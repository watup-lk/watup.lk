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
		Port:         getEnv("PORT", "8080"),
		DatabaseURL:  getEnv("DATABASE_URL", ""),
		KafkaBrokers: []string{getEnv("KAFKA_BROKERS", "")},
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
