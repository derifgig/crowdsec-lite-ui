package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/crowdsec-lite-ui/internal/lapi"
	"github.com/crowdsec-lite-ui/webui"
)

var (
	alertsSince string
	client      *lapi.Client
)

func main() {
	lapiURL := os.Getenv("LAPI_URL")
	if lapiURL == "" {
		log.Fatal("LAPI_URL environment variable is required")
	}

	lapiUsername := os.Getenv("LAPI_USERNAME")
	if lapiUsername == "" {
		log.Fatal("LAPI_USERNAME environment variable is required")
	}

	lapiPassword := os.Getenv("LAPI_PASSWORD")
	if lapiPassword == "" {
		log.Fatal("LAPI_PASSWORD environment variable is required")
	}

	listenAddr := os.Getenv("LISTEN_ADDR")
	if listenAddr == "" {
		listenAddr = ":3000"
	}

	skipTLSVerify := false
	if v := os.Getenv("LAPI_SKIP_TLS_VERIFY"); v != "" {
		var err error
		skipTLSVerify, err = strconv.ParseBool(v)
		if err != nil {
			log.Fatalf("invalid LAPI_SKIP_TLS_VERIFY value %q: %v", v, err)
		}
	}

	alertsSince = os.Getenv("ALERTS_SINCE")
	if alertsSince == "" {
		alertsSince = "168h"
	}

	client = lapi.NewClient(lapiURL, lapiUsername, lapiPassword, skipTLSVerify)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", handleHealth)
	mux.HandleFunc("GET /api/alerts", handleGetAlerts)
	mux.HandleFunc("GET /api/alerts/{id}", handleGetAlertByID)
	mux.HandleFunc("GET /api/decisions", handleGetDecisions)
	mux.HandleFunc("POST /api/decisions", handleAddDecision)
	mux.HandleFunc("DELETE /api/decisions/{id}", handleDeleteDecision)

	distFS, err := fs.Sub(webui.FS, "dist")
	if err != nil {
		log.Fatalf("failed to create sub filesystem: %v", err)
	}
	mux.HandleFunc("/", spaHandler(distFS))

	srv := &http.Server{
		Addr:    listenAddr,
		Handler: mux,
	}

	log.Printf("CrowdSec Lite UI listening on %s, LAPI: %s", listenAddr, lapiURL)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}
	log.Println("Server stopped")
}

func spaHandler(distFS fs.FS) http.HandlerFunc {
	fileServer := http.FileServer(http.FS(distFS))
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		_, err := fs.Stat(distFS, path)
		if err != nil {
			// File not found — serve index.html for SPA routing
			data, err := fs.ReadFile(distFS, "index.html")
			if err != nil {
				http.Error(w, "index.html not found", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			w.Write(data)
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writeJSON encode error: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func paginate(slice []json.RawMessage, page, pageSize int) ([]json.RawMessage, int) {
	total := len(slice)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 1
	}

	start := (page - 1) * pageSize
	if start >= total {
		return []json.RawMessage{}, total
	}

	end := start + pageSize
	if end > total {
		end = total
	}
	return slice[start:end], total
}

func parsePageParams(r *http.Request) (page, pageSize int) {
	page = 1
	pageSize = 100

	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 500 {
				n = 500
			}
			pageSize = n
		}
	}
	return page, pageSize
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	err := client.Heartbeat()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":             true,
			"lapi_connected": false,
			"error":          err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"lapi_connected": true,
	})
}

func handleGetAlerts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	since := q.Get("since")
	if since == "" {
		since = alertsSince
	}
	ip := q.Get("ip")
	scenario := q.Get("scenario")

	page, pageSize := parsePageParams(r)

	alerts, err := client.FetchAlerts(since, ip, scenario)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	pageAlerts, total := paginate(alerts, page, pageSize)

	writeJSON(w, http.StatusOK, map[string]any{
		"alerts":    pageAlerts,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func handleGetAlertByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	alert, err := client.FetchAlertByID(id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(alert)
}

func handleGetDecisions(w http.ResponseWriter, r *http.Request) {
	ip := r.URL.Query().Get("ip")
	page, pageSize := parsePageParams(r)

	decisions, err := client.FetchDecisions(ip)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	pageDecisions, total := paginate(decisions, page, pageSize)

	writeJSON(w, http.StatusOK, map[string]any{
		"decisions": pageDecisions,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

type addDecisionRequest struct {
	IP       string `json:"ip"`
	Duration string `json:"duration"`
	Reason   string `json:"reason"`
	Type     string `json:"type"`
}

func handleAddDecision(w http.ResponseWriter, r *http.Request) {
	var req addDecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid request body: %v", err))
		return
	}

	if req.IP == "" {
		writeError(w, http.StatusBadRequest, "ip is required")
		return
	}
	if net.ParseIP(req.IP) == nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid IP address: %q", req.IP))
		return
	}
	if req.Duration == "" {
		writeError(w, http.StatusBadRequest, "duration is required")
		return
	}
	if req.Type == "" {
		req.Type = "ban"
	}
	if req.Type != "ban" && req.Type != "captcha" {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("type must be 'ban' or 'captcha', got %q", req.Type))
		return
	}

	if err := client.AddDecision(req.IP, req.Duration, req.Reason, req.Type); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func handleDeleteDecision(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := client.DeleteDecision(id); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
