package config

import (
	"os"
	"strings"
)

type Config struct {
	Port         string
	DatabaseURL  string
	KafkaBrokers []string
}

func Load() *Config {
	return &Config{
		Port:         getEnv("PORT", "8080"),
		DatabaseURL:  getEnv("DATABASE_URL", ""),
		KafkaBrokers: strings.Split(getEnv("KAFKA_BROKERS", ""), ","),
	}
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
