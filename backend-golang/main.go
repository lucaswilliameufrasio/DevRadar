package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bytedance/sonic"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"
	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/tidwall/rtree"
)

type Dev struct {
	ID             int      `json:"id"`
	GithubUsername string   `json:"github_username" validate:"required"`
	Name           string   `json:"name"`
	AvatarURL      string   `json:"avatar_url"`
	Bio            string   `json:"bio"`
	Techs          []string `json:"techs"`
}

type ApiError struct {
	Message   string      `json:"message"`
	ErrorCode string      `json:"error_code"`
	Extra     interface{} `json:"extra,omitempty"`
}

type AppState struct {
	DB           *pgxpool.Pool
	Redis        *redis.Client
	Validator    *validator.Validate
	SpatialIndex *rtree.RTree
	SpatialMutex sync.RWMutex
}

func sendError(w http.ResponseWriter, code int, message, errCode string, extra interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	sonic.ConfigDefault.NewEncoder(w).Encode(ApiError{
		Message:   message,
		ErrorCode: errCode,
		Extra:     extra,
	})
}

func main() {
	ctx := context.Background()

	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" { dbUrl = "postgresql://postgres:postgres@localhost:5432/devradar" }
	dbPool, err := pgxpool.New(ctx, dbUrl)
	if err != nil { panic(err) }

	redisUrl := os.Getenv("REDIS_URL")
	if redisUrl == "" { redisUrl = "redis://localhost:6379" }
	opt, _ := redis.ParseURL(redisUrl)
	rdb := redis.NewClient(opt)

	state := &AppState{
		DB:           dbPool,
		Redis:        rdb,
		Validator:    validator.New(),
		SpatialIndex: &rtree.RTree{},
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(httprate.LimitByIP(100, 1*time.Minute))

	r.Route("/v1", func(v1 chi.Router) {
		v1.Get("/devs", func(w http.ResponseWriter, r *http.Request) {
			rows, err := state.DB.Query(r.Context(), "SELECT id, github_username, name, avatar_url, bio, techs FROM devs")
			if err != nil {
				sendError(w, 500, "Database error", "DATABASE_ERROR", err.Error())
				return
			}
			var devs []Dev
			for rows.Next() {
				var d Dev
				rows.Scan(&d.ID, &d.GithubUsername, &d.Name, &d.AvatarURL, &d.Bio, &d.Techs)
				devs = append(devs, d)
			}
			sonic.ConfigDefault.NewEncoder(w).Encode(devs)
		})

		v1.Post("/devs", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				GithubUsername string  `json:"github_username" validate:"required"`
				Techs          string  `json:"techs" validate:"required"`
				Latitude       float64 `json:"latitude" validate:"required,min=-90,max=90"`
				Longitude      float64 `json:"longitude" validate:"required,min=-180,max=180"`
			}
			if err := sonic.ConfigDefault.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, 400, "Invalid JSON", "INVALID_BODY", nil)
				return
			}
			if err := state.Validator.Struct(req); err != nil {
				sendError(w, 400, "Validation failed", "VALIDATION_ERROR", err.Error())
				return
			}

			// GitHub fetch with Token support
			client := &http.Client{}
			ghUrl := "https://api.github.com/users/" + req.GithubUsername
			ghReq, _ := http.NewRequest("GET", ghUrl, nil)
			if token := os.Getenv("GITHUB_TOKEN"); token != "" {
				ghReq.Header.Set("Authorization", "token "+token)
			}
			githubRes, err := client.Do(ghReq)
			
			if err != nil || githubRes.StatusCode != 200 {
				sendError(w, 404, "GitHub user not found", "GITHUB_USER_NOT_FOUND", nil)
				return
			}

			var ghData struct {
				Name      string `json:"name"`
				Login     string `json:"login"`
				AvatarURL string `json:"avatar_url"`
				Bio       string `json:"bio"`
			}
			sonic.ConfigDefault.NewDecoder(githubRes.Body).Decode(&ghData)
			
			techsArray := strings.Split(req.Techs, ",")
			for i, t := range techsArray { techsArray[i] = strings.TrimSpace(t) }
			name := ghData.Name
			if name == "" { name = ghData.Login }

			var id int
			err = state.DB.QueryRow(r.Context(),
				`INSERT INTO devs (github_username, name, avatar_url, bio, techs, location, geometry_location) 
				 VALUES ($1, $2, $3, $4, $5, ST_MakePoint($6, $7)::geography, ST_Transform(ST_SetSRID(ST_MakePoint($6, $7), 4326), 3857)) 
				 RETURNING id`,
				req.GithubUsername, name, ghData.AvatarURL, ghData.Bio, techsArray, req.Longitude, req.Latitude,
			).Scan(&id)

			if err != nil {
				sendError(w, 500, "Failed to save dev", "DATABASE_ERROR", err.Error())
				return
			}

			w.WriteHeader(http.StatusCreated)
			sonic.ConfigDefault.NewEncoder(w).Encode(map[string]int{"id": id})
		})

		v1.Get("/search", func(w http.ResponseWriter, r *http.Request) {
			latStr := r.URL.Query().Get("latitude")
			lonStr := r.URL.Query().Get("longitude")
			techs := r.URL.Query().Get("techs")

			if latStr == "" || lonStr == "" || techs == "" {
				sendError(w, 400, "Missing query parameters", "MISSING_PARAMS", nil)
				return
			}

			cacheKey := fmt.Sprintf("search:%s:%s:%s", latStr, lonStr, techs)
			cached, err := state.Redis.Get(r.Context(), cacheKey).Result()
			if err == nil {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(cached))
				return
			}

			lat, _ := strconv.ParseFloat(latStr, 64)
			lon, _ := strconv.ParseFloat(lonStr, 64)
			techsArray := strings.Split(techs, ",")

			rows, _ := state.DB.Query(r.Context(),
				`SELECT id, github_username, name, avatar_url, bio, techs 
				 FROM devs 
				 WHERE techs && $1 
				 AND ST_DWithin(geometry_location, ST_Transform(ST_SetSRID(ST_MakePoint($2, $3), 4326), 3857), 10000)`,
				techsArray, lon, lat,
			)
			var results []Dev
			for rows.Next() {
				var d Dev
				rows.Scan(&d.ID, &d.GithubUsername, &d.Name, &d.AvatarURL, &d.Bio, &d.Techs)
				results = append(results, d)
			}
			
			resBytes, _ := sonic.Marshal(results)
			state.Redis.Set(r.Context(), cacheKey, resBytes, 1*time.Minute)
			
			w.Header().Set("Content-Type", "application/json")
			w.Write(resBytes)
		})
	})

	port := os.Getenv("PORT")
	if port == "" { port = "9988" }
	fmt.Printf("🚀 Go Backend (Optimized V1) on :%s\n", port)
	http.ListenAndServe(":"+port, r)
}
