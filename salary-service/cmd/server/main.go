package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/lib/pq"

	"github.com/watup-lk/salary-service/internal/config"
	"github.com/watup-lk/salary-service/internal/handlers"
	"github.com/watup-lk/salary-service/internal/kafka"
	"github.com/watup-lk/salary-service/internal/repository"
	"github.com/watup-lk/salary-service/internal/service"
)

func main() {
	cfg := config.Load()

	if cfg.DatabaseURL == "" {
		log.Fatal("[startup] DATABASE_URL is required")
	}
	hasValidBroker := false
	for _, b := range cfg.KafkaBrokers {
		if strings.TrimSpace(b) != "" {
			hasValidBroker = true
			break
		}
	}
	if !hasValidBroker {
		log.Fatal("[startup] KAFKA_BROKERS must contain at least one broker address")
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[startup] failed to open database: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("[startup] database ping failed: %v", err)
	}
	log.Println("[startup] connected to PostgreSQL")

	repo := repository.NewPostgresRepo(db)
	producer := kafka.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()

	consumer := kafka.NewConsumer(cfg.KafkaBrokers, repo)

	svc := service.New(repo, producer)

	salaryH := handlers.NewSalaryHandler(svc)
	healthH := handlers.NewHealthHandler(repo)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /salary", salaryH.List)
	mux.HandleFunc("POST /salary", salaryH.Create)
	mux.HandleFunc("POST /salary/{id}/report", salaryH.Report)
	mux.HandleFunc("GET /health/live", healthH.Liveness)
	mux.HandleFunc("GET /health/ready", healthH.Readiness)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go consumer.Run(ctx)

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		log.Printf("[shutdown] received %v — shutting down", sig)
		cancel()
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutCancel()
		if err := srv.Shutdown(shutCtx); err != nil {
			log.Printf("[shutdown] error: %v", err)
		}
	}()

	log.Printf("[startup] salary-service listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("[http] server error: %v", err)
	}

	<-ctx.Done()
	log.Println("[shutdown] salary-service stopped")
}
