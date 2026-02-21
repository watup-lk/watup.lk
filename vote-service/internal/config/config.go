package config

import (
	"os"
)

type Config struct {
	Port              string
	DatabaseURL       string
	KafkaBrokers      []string
	ApprovalThreshold int
}

func Load() *Config {
	return &Config{
		Port:         getEnv("PORT", "50051"),
		DatabaseURL:  getEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db?sslmode=disable"),
		KafkaBrokers: []string{getEnv("KAFKA_BROKERS", "localhost:9092")},
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
