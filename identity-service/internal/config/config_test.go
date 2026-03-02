package config_test

import (
	"os"
	"testing"

	"github.com/watup-lk/identity-service/internal/config"
)

func TestLoad_Defaults(t *testing.T) {
	// Unset all env vars to get defaults
	for _, k := range []string{"PORT", "GRPC_PORT", "METRICS_PORT", "DATABASE_URL", "JWT_SECRET", "KAFKA_BROKERS", "AZURE_KEYVAULT_URL", "ACCESS_TOKEN_MINUTES", "REFRESH_TOKEN_DAYS"} {
		os.Unsetenv(k)
	}

	cfg := config.Load()

	if cfg.Port != "8080" {
		t.Errorf("Port: expected 8080, got %s", cfg.Port)
	}
	if cfg.GRPCPort != "50052" {
		t.Errorf("GRPCPort: expected 50052, got %s", cfg.GRPCPort)
	}
	if cfg.MetricsPort != "9090" {
		t.Errorf("MetricsPort: expected 9090, got %s", cfg.MetricsPort)
	}
	if cfg.DatabaseURL != "" {
		t.Errorf("DatabaseURL: expected empty, got %s", cfg.DatabaseURL)
	}
	if cfg.JWTSecret != "" {
		t.Errorf("JWTSecret: expected empty, got %s", cfg.JWTSecret)
	}
	if len(cfg.KafkaBrokers) != 1 || cfg.KafkaBrokers[0] != "localhost:9092" {
		t.Errorf("KafkaBrokers: expected [localhost:9092], got %v", cfg.KafkaBrokers)
	}
	if cfg.AccessTokenMinutes != 15 {
		t.Errorf("AccessTokenMinutes: expected 15, got %d", cfg.AccessTokenMinutes)
	}
	if cfg.RefreshTokenDays != 7 {
		t.Errorf("RefreshTokenDays: expected 7, got %d", cfg.RefreshTokenDays)
	}
}

func TestLoad_EnvOverrides(t *testing.T) {
	os.Setenv("PORT", "3000")
	os.Setenv("GRPC_PORT", "50051")
	os.Setenv("METRICS_PORT", "9091")
	os.Setenv("DATABASE_URL", "postgres://test")
	os.Setenv("JWT_SECRET", "my-secret")
	os.Setenv("KAFKA_BROKERS", "broker1:9092,broker2:9092")
	os.Setenv("ACCESS_TOKEN_MINUTES", "30")
	os.Setenv("REFRESH_TOKEN_DAYS", "14")
	os.Unsetenv("AZURE_KEYVAULT_URL") // ensure no Key Vault
	defer func() {
		for _, k := range []string{"PORT", "GRPC_PORT", "METRICS_PORT", "DATABASE_URL", "JWT_SECRET", "KAFKA_BROKERS", "ACCESS_TOKEN_MINUTES", "REFRESH_TOKEN_DAYS"} {
			os.Unsetenv(k)
		}
	}()

	cfg := config.Load()

	if cfg.Port != "3000" {
		t.Errorf("Port: expected 3000, got %s", cfg.Port)
	}
	if cfg.GRPCPort != "50051" {
		t.Errorf("GRPCPort: expected 50051, got %s", cfg.GRPCPort)
	}
	if cfg.MetricsPort != "9091" {
		t.Errorf("MetricsPort: expected 9091, got %s", cfg.MetricsPort)
	}
	if cfg.DatabaseURL != "postgres://test" {
		t.Errorf("DatabaseURL: expected postgres://test, got %s", cfg.DatabaseURL)
	}
	if cfg.JWTSecret != "my-secret" {
		t.Errorf("JWTSecret: expected my-secret, got %s", cfg.JWTSecret)
	}
	if len(cfg.KafkaBrokers) != 2 || cfg.KafkaBrokers[0] != "broker1:9092" {
		t.Errorf("KafkaBrokers: expected [broker1:9092,broker2:9092], got %v", cfg.KafkaBrokers)
	}
	if cfg.AccessTokenMinutes != 30 {
		t.Errorf("AccessTokenMinutes: expected 30, got %d", cfg.AccessTokenMinutes)
	}
	if cfg.RefreshTokenDays != 14 {
		t.Errorf("RefreshTokenDays: expected 14, got %d", cfg.RefreshTokenDays)
	}
}

func TestLoad_InvalidIntFallback(t *testing.T) {
	os.Setenv("ACCESS_TOKEN_MINUTES", "not-a-number")
	os.Unsetenv("AZURE_KEYVAULT_URL")
	defer os.Unsetenv("ACCESS_TOKEN_MINUTES")

	cfg := config.Load()
	if cfg.AccessTokenMinutes != 15 {
		t.Errorf("expected fallback 15, got %d", cfg.AccessTokenMinutes)
	}
}
