package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	os.Unsetenv("PORT")
	os.Unsetenv("DATABASE_URL")
	os.Unsetenv("KAFKA_BROKERS")
	c := Load()
	if c.Port != "8080" {
		t.Errorf("expected port 8080, got %s", c.Port)
	}
	if c.DatabaseURL != "" {
		t.Errorf("expected empty DATABASE_URL, got %s", c.DatabaseURL)
	}
	if len(c.KafkaBrokers) != 1 || c.KafkaBrokers[0] != "" {
		t.Errorf("unexpected KafkaBrokers: %v", c.KafkaBrokers)
	}
}

func TestLoad_EnvOverride(t *testing.T) {
	os.Setenv("PORT", "9090")
	os.Setenv("DATABASE_URL", "postgres://localhost/testdb")
	os.Setenv("KAFKA_BROKERS", "broker1:9092,broker2:9092")
	defer os.Unsetenv("PORT")
	defer os.Unsetenv("DATABASE_URL")
	defer os.Unsetenv("KAFKA_BROKERS")
	c := Load()
	if c.Port != "9090" {
		t.Errorf("expected port 9090, got %s", c.Port)
	}
	if c.DatabaseURL != "postgres://localhost/testdb" {
		t.Errorf("unexpected DATABASE_URL: %s", c.DatabaseURL)
	}
	if len(c.KafkaBrokers) != 2 {
		t.Errorf("expected 2 brokers, got %v", c.KafkaBrokers)
	}
}
