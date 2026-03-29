package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/bytedance/sonic"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/tidwall/rtree"
)

type Dev struct {
	ID             int      `json:"id"`
	GithubUsername string   `json:"github_username"`
	Name           string   `json:"name"`
	AvatarURL      string   `json:"avatar_url"`
	Bio            string   `json:"bio"`
	Techs          []string `json:"techs"`
}

type AppState struct {
	DB           *pgxpool.Pool
	SpatialIndex *rtree.RTree
	SpatialMutex sync.RWMutex
}

func main() {
	dbPool, _ := pgxpool.New(context.Background(), "postgresql://postgres:postgres@localhost:5432/devradar")
	state := &AppState{DB: dbPool, SpatialIndex: &rtree.RTree{}}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
type ApiError struct {
	Message   string      `json:"message"`
	ErrorCode string      `json:"error_code"`
	Extra     interface{} `json:"extra,omitempty"`
}

func sendError(w http.ResponseWriter, code int, message, errCode string, extra interface{}) {
	w.WriteHeader(code)
	sonic.ConfigDefault.NewEncoder(w).Encode(ApiError{
		Message:   message,
		ErrorCode: errCode,
		Extra:     extra,
	})
}

func main() {
...
	r.Route("/v1", func(v1 chi.Router) {
		v1.Get("/devs", func(w http.ResponseWriter, r *http.Request) {
			rows, err := state.DB.Query(context.Background(), "SELECT id, github_username, name, avatar_url, bio, techs FROM devs")
			if err != nil {
				sendError(w, 500, "Failed to fetch devs", "DATABASE_ERROR", err.Error())
				return
			}
...
		v1.Post("/devs", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				GithubUsername string  `json:"github_username"`
				Techs          string  `json:"techs"`
				Latitude       float64 `json:"latitude"`
				Longitude      float64 `json:"longitude"`
			}
			if err := sonic.ConfigDefault.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, 400, "Invalid request body", "INVALID_BODY", nil)
				return
			}
...
			githubRes, err := http.Get("https://api.github.com/users/" + req.GithubUsername)
			if err != nil || githubRes.StatusCode != 200 {
				sendError(w, 404, "GitHub user not found", "GITHUB_USER_NOT_FOUND", nil)
				return
			}

			
			techsArray := strings.Split(req.Techs, ",")
			for i, t := range techsArray { techsArray[i] = strings.TrimSpace(t) }

			name := ghData.Name
			if name == "" { name = ghData.Login }

			var id int
			state.DB.QueryRow(context.Background(),
				`INSERT INTO devs (github_username, name, avatar_url, bio, techs, location) 
				 VALUES ($1, $2, $3, $4, $5, ST_MakePoint($6, $7)::geography) 
				 RETURNING id`,
				req.GithubUsername, name, ghData.AvatarURL, ghData.Bio, techsArray, req.Longitude, req.Latitude,
			).Scan(&id)

			w.WriteHeader(http.StatusCreated)
			sonic.ConfigDefault.NewEncoder(w).Encode(map[string]int{"id": id})
		})

		v1.Get("/search", func(w http.ResponseWriter, r *http.Request) {
			// Search implementation here...
		})
	})

	fmt.Println("🚀 Go Backend (V1) on :9988")
	http.ListenAndServe(":9988", r)
}
