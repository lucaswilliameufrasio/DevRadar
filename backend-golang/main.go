package main

import (
	"fmt"
	"io"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type AppState struct {
	Clients     map[string]ClientLocation
	Points      []Point
	SseChannels map[string]chan string
	Mutex       sync.Mutex
}

type Point struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type ClientLocation struct {
	Latitude  float64
	Longitude float64
}

type RegisterClientRequest struct {
	ClientID  string  `json:"client_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

func main() {
	r := gin.Default()
	state := &AppState{
		Clients:     make(map[string]ClientLocation),
		Points:      []Point{},
		SseChannels: make(map[string]chan string),
	}

	r.POST("/register", func(c *gin.Context) {
		var req RegisterClientRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		state.Mutex.Lock()
		state.Clients[req.ClientID] = ClientLocation{
			Latitude:  req.Latitude,
			Longitude: req.Longitude,
		}
		state.SseChannels[req.ClientID] = make(chan string, 10)
		state.Mutex.Unlock()

		fmt.Printf("Registered client `%s` at (%f, %f)\n", req.ClientID, req.Latitude, req.Longitude)
		c.JSON(http.StatusOK, gin.H{"message": "Client registered"})
	})

	r.POST("/points", func(c *gin.Context) {
		var point Point
		if err := c.ShouldBindJSON(&point); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		state.Mutex.Lock()
		state.Points = append(state.Points, point)
		for clientID, loc := range state.Clients {
			distance := haversineDistance(loc.Latitude, loc.Longitude, point.Latitude, point.Longitude)
			if distance < 2.0 {
				if ch, ok := state.SseChannels[clientID]; ok {
					message := fmt.Sprintf("New point added: (%f, %f)", point.Latitude, point.Longitude)
					select {
					case ch <- message:
					default:
						fmt.Printf("Client `%s` channel full, skipping\n", clientID)
					}
				}
			}
		}
		state.Mutex.Unlock()

		c.JSON(http.StatusCreated, gin.H{"message": "Point added"})
	})

	r.GET("/sse", func(c *gin.Context) {
		clientID := c.Query("client_id")
		if clientID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "client_id is required"})
			return
		}

		state.Mutex.Lock()
		ch, exists := state.SseChannels[clientID]
		if !exists {
			c.JSON(http.StatusNotFound, gin.H{"error": "client not found"})
			state.Mutex.Unlock()
			return
		}
		state.Mutex.Unlock()

		c.Stream(func(w io.Writer) bool {
			select {
			case msg := <-ch:
				c.SSEvent("message", msg)
				return true
			case <-time.After(15 * time.Second):
				c.SSEvent("ping", "keep-alive")
				return true
			default:
				return true
			}
		})
	})

	r.Run(":9988")
}

func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	toRadians := func(deg float64) float64 {
		return deg * math.Pi / 180.0
	}

	lat1, lon1, lat2, lon2 = toRadians(lat1), toRadians(lon1), toRadians(lat2), toRadians(lon2)
	dlat, dlon := lat2-lat1, lon2-lon1

	a := math.Sin(dlat/2)*math.Sin(dlat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dlon/2)*math.Sin(dlon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	const earthRadiusKm = 6371.0
	return earthRadiusKm * c
}
