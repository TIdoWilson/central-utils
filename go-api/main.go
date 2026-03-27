package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	port := os.Getenv("GO_API_PORT")
	if port == "" {
		port = "8002"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "metodo nao permitido", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true,"service":"go-api"}`))
	})

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           withBasicHeaders(mux),
		ReadHeaderTimeout: 15 * time.Second,
	}

	fmt.Printf("GO API rodando em http://127.0.0.1:%s\n", port)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}

func withBasicHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}
