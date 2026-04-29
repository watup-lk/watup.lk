package config

import (
	"os"
	"reflect"
	"testing"
)

func TestLoadUsesDefaultsWhenEnvironmentKeysAreMissing(t *testing.T) {
	unsetEnv(t, "PORT", "HTTP_PORT", "DATABASE_URL", "KAFKA_BROKERS")

	cfg := Load()

	if cfg.Port != "8080" {
		t.Fatalf("expected default http port 8080, got %q", cfg.Port)
	}
	if cfg.DatabaseURL != "" {
		t.Fatalf("expected empty database url, got %q", cfg.DatabaseURL)
	}
	if !reflect.DeepEqual(cfg.KafkaBrokers, []string{""}) {
		t.Fatalf("expected empty kafka broker list value, got %#v", cfg.KafkaBrokers)
	}
}

func unsetEnv(t *testing.T, keys ...string) {
	t.Helper()

	previous := make(map[string]*string, len(keys))
	for _, key := range keys {
		if value, ok := os.LookupEnv(key); ok {
			copyValue := value
			previous[key] = &copyValue
		}
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
	}

	t.Cleanup(func() {
		for _, key := range keys {
			if value, ok := previous[key]; ok {
				_ = os.Setenv(key, *value)
			} else {
				_ = os.Unsetenv(key)
			}
		}
	})
}

func TestLoadUsesConfiguredEnvironmentValues(t *testing.T) {
	t.Setenv("PORT", "60061")
	t.Setenv("HTTP_PORT", "9090")
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/vote?sslmode=disable")
	t.Setenv("KAFKA_BROKERS", "kafka:9092")

	cfg := Load()

	if cfg.Port != "60061" {
		t.Fatalf("expected configured http port, got %q", cfg.Port)
	}
	if cfg.DatabaseURL != "postgres://user:pass@localhost:5432/vote?sslmode=disable" {
		t.Fatalf("expected configured database url, got %q", cfg.DatabaseURL)
	}
	if !reflect.DeepEqual(cfg.KafkaBrokers, []string{"kafka:9092"}) {
		t.Fatalf("expected configured kafka broker, got %#v", cfg.KafkaBrokers)
	}
}
