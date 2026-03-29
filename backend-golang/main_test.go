package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/tidwall/rtree"
)

func TestHaversineDistance(t *testing.T) {
	// Distance between São Paulo and Rio de Janeiro should be approx 360km
	dist := haversineDistance(-23.5505, -46.6333, -22.9068, -43.1729)
	if dist < 350 || dist > 370 {
		t.Errorf("Expected distance around 360km, got %f", dist)
	}

	// Distance between two close points (within 10km)
	distClose := haversineDistance(-23.5505, -46.6333, -23.5605, -46.6433)
	if distClose > 10 {
		t.Errorf("Expected distance under 10km, got %f", distClose)
	}
}

func TestRegisterAndSearch(t *testing.T) {
	state := &AppState{
		SpatialIndex: &rtree.RTree{},
	}

	r := chi.NewRouter()
	r.Post("/register", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ClientID  string  `json:"client_id"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		client := &Client{ID: req.ClientID, Latitude: req.Latitude, Longitude: req.Longitude, Channel: make(chan string, 10)}
		state.Clients.Store(req.ClientID, client)
		state.SpatialMutex.Lock()
		state.SpatialIndex.Insert([2]float64{req.Latitude, req.Longitude}, [2]float64{req.Latitude, req.Longitude}, client)
		state.SpatialMutex.Unlock()
		w.WriteHeader(http.StatusOK)
	})

	// Test Registration
	regBody, _ := json.Marshal(map[string]interface{}{
		"client_id": "test-1",
		"latitude":  -23.5505,
		"longitude": -46.6333,
	})
	req := httptest.NewRequest("POST", "/register", bytes.NewBuffer(regBody))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Registration failed, got %d", w.Code)
	}

	// Verify it's in the state
	if _, ok := state.Clients.Load("test-1"); !ok {
		t.Error("Client not found in state after registration")
	}
}
