package main

import (
	"context"
	"database/sql"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/status"

	pb "github.com/watup-lk/identity-service/api/proto/v1"
	"github.com/watup-lk/identity-service/internal/config"
	"github.com/watup-lk/identity-service/internal/grpcserver"
	"github.com/watup-lk/identity-service/internal/handlers"
	"github.com/watup-lk/identity-service/internal/kafka"
	"github.com/watup-lk/identity-service/internal/middleware"
	"github.com/watup-lk/identity-service/internal/repository"
	"github.com/watup-lk/identity-service/internal/service"
)

func main() {
	cfg := config.Load()
	validateConfig(cfg)

	// --- Database ---
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[startup] Failed to open database connection: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("[startup] Database ping failed: %v", err)
	}
	log.Println("[startup] Connected to PostgreSQL")

	repo := repository.NewPostgresRepo(db)

	// --- Kafka ---
	producer := kafka.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()

	// --- Service ---
	identitySvc := service.NewIdentityService(repo, producer, cfg)

	// --- Start servers ---
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup

	// HTTP API server: auth routes (rate-limited) + health probes (not rate-limited)
	wg.Add(1)
	go func() {
		defer wg.Done()
		startHTTPServer(ctx, cfg, identitySvc, repo)
	}()

	// Metrics server: dedicated port for Prometheus scraping — bypasses rate limiter
	wg.Add(1)
	go func() {
		defer wg.Done()
		startMetricsServer(ctx, cfg)
	}()

	// gRPC server: internal service-to-service token validation
	wg.Add(1)
	go func() {
		defer wg.Done()
		startGRPCServer(ctx, cfg, identitySvc)
	}()

	// Graceful shutdown on SIGINT / SIGTERM
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("[shutdown] Received signal: %v — beginning graceful shutdown...", sig)
	cancel()
	wg.Wait()
	log.Println("[shutdown] Identity service stopped cleanly")
}

// validateConfig checks required configuration at startup and fails fast.
func validateConfig(cfg *config.Config) {
	if cfg.DatabaseURL == "" {
		log.Fatal("[startup] DATABASE_URL is required (set via env var or Azure Key Vault)")
	}
	if cfg.JWTSecret == "" {
		log.Fatal("[startup] JWT_SECRET is required (min 32 chars recommended)")
	}
	if len(cfg.JWTSecret) < 32 {
		log.Println("[startup] WARNING: JWT_SECRET is shorter than 32 characters — use a stronger secret in production")
	}
	// Check that at least one non-empty broker address is configured
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
	log.Printf("[startup] Port=%s GRPCPort=%s MetricsPort=%s AccessTokenMins=%d RefreshTokenDays=%d",
		cfg.Port, cfg.GRPCPort, cfg.MetricsPort, cfg.AccessTokenMinutes, cfg.RefreshTokenDays)
}

func startHTTPServer(ctx context.Context, cfg *config.Config, svc *service.IdentityService, repo *repository.PostgresRepo) {
	authH := handlers.NewAuthHandler(svc)
	healthH := handlers.NewHealthHandler(repo)

	// Auth-only sub-mux — this is the handler that gets rate-limited
	authMux := http.NewServeMux()
	authMux.HandleFunc("POST /auth/signup", authH.Signup)
	authMux.HandleFunc("POST /auth/login", authH.Login)
	authMux.HandleFunc("POST /auth/refresh", authH.Refresh)
	authMux.HandleFunc("POST /auth/logout", authH.Logout)
	authMux.HandleFunc("GET /auth/validate", authH.ValidateToken)

	// Per-IP rate limiter: burst of 20, refills at 5 req/s — applied to auth routes only
	limiter := middleware.NewRateLimiter(20, 5)

	// Top-level mux: health probes bypass the rate limiter entirely.
	// Kubelet hits /health/live and /health/ready frequently — never rate-limit them.
	topMux := http.NewServeMux()
	topMux.Handle("/auth/", limiter.Limit(authMux))
	topMux.HandleFunc("GET /health/live", healthH.Liveness)
	topMux.HandleFunc("GET /health/ready", healthH.Readiness)

	// SecurityHeaders, Metrics, RequestLogger apply to ALL routes (auth + health)
	handler := middleware.Chain(
		topMux,
		middleware.SecurityHeaders,
		middleware.Metrics,
		middleware.RequestLogger,
	)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("[http] Shutdown error: %v", err)
		}
	}()

	log.Printf("[http] Listening on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("[http] Server error: %v", err)
	}
}

// startMetricsServer binds the Prometheus /metrics endpoint to a dedicated port.
// This keeps metrics scraping separate from the API rate limiter and allows
// Prometheus to be configured with a different scrape target than the API.
func startMetricsServer(ctx context.Context, cfg *config.Config) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())

	srv := &http.Server{
		Addr:         ":" + cfg.MetricsPort,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("[metrics] Shutdown error: %v", err)
		}
	}()

	log.Printf("[metrics] Listening on :%s", cfg.MetricsPort)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Printf("[metrics] Server error: %v", err)
	}
}

func startGRPCServer(ctx context.Context, cfg *config.Config, svc *service.IdentityService) {
	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("[grpc] Failed to listen on :%s: %v", cfg.GRPCPort, err)
	}

	s := grpc.NewServer(
		// Keepalive: detect dead connections and release resources
		grpc.KeepaliveParams(keepalive.ServerParameters{
			MaxConnectionIdle: 5 * time.Minute,
			Time:              2 * time.Minute,
			Timeout:           20 * time.Second,
		}),
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			MinTime:             30 * time.Second,
			PermitWithoutStream: true,
		}),
		// Chain interceptors: logging → panic recovery
		grpc.ChainUnaryInterceptor(
			grpcLoggingInterceptor,
			grpcRecoveryInterceptor,
		),
	)

	pb.RegisterIdentityServiceServer(s, grpcserver.NewIdentityServer(svc))

	go func() {
		<-ctx.Done()
		s.GracefulStop()
	}()

	log.Printf("[grpc] Listening on :%s", cfg.GRPCPort)
	if err := s.Serve(lis); err != nil {
		log.Printf("[grpc] Server error: %v", err)
	}
}

// grpcLoggingInterceptor logs every gRPC call with method name, duration, and status code.
func grpcLoggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	start := time.Now()
	resp, err := handler(ctx, req)
	code := codes.OK
	if err != nil {
		code = status.Code(err)
	}
	log.Printf("[grpc] %s %s %v", info.FullMethod, code, time.Since(start).Round(time.Millisecond))
	return resp, err
}

// grpcRecoveryInterceptor catches panics in gRPC handlers and returns an Internal error
// instead of crashing the entire server process.
func grpcRecoveryInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp interface{}, err error) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[grpc] PANIC in %s: %v\n%s", info.FullMethod, r, debug.Stack())
			err = status.Errorf(codes.Internal, "internal server error")
		}
	}()
	return handler(ctx, req)
}
