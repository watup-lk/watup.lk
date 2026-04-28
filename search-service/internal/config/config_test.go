package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	os.Unsetenv("PORT")
	os.Unsetenv("DATABASE_URL")
	c := Load()
	if c.Port != "8080" {
		t.Errorf("expected port 8080, got %s", c.Port)
	}
	if c.DatabaseURL != "" {
		t.Errorf("expected empty DATABASE_URL, got %s", c.DatabaseURL)
	}
}

func TestLoad_EnvOverride(t *testing.T) {
	os.Setenv("PORT", "9090")
	os.Setenv("DATABASE_URL", "postgres://localhost/testdb")
	defer os.Unsetenv("PORT")
	defer os.Unsetenv("DATABASE_URL")
	c := Load()
	if c.Port != "9090" {
		t.Errorf("expected port 9090, got %s", c.Port)
	}
	if c.DatabaseURL != "postgres://localhost/testdb" {
		t.Errorf("unexpected DATABASE_URL: %s", c.DatabaseURL)
	}
}
