package config

import (
	"context"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azsecrets"
)

type Config struct {
	Port                 string
	GRPCPort             string
	MetricsPort          string
	DatabaseURL          string
	JWTSecret            string
	KafkaBrokers         []string
	AzureKeyVaultURL     string
	AccessTokenMinutes   int
	RefreshTokenDays     int
}

func Load() *Config {
	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		GRPCPort:           getEnv("GRPC_PORT", "50052"),
		MetricsPort:        getEnv("METRICS_PORT", "9090"),
		DatabaseURL:        getEnv("DATABASE_URL", ""),
		JWTSecret:          getEnv("JWT_SECRET", ""),
		KafkaBrokers:       strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ","),
		AzureKeyVaultURL:   getEnv("AZURE_KEYVAULT_URL", ""),
		AccessTokenMinutes: getEnvInt("ACCESS_TOKEN_MINUTES", 15),
		RefreshTokenDays:   getEnvInt("REFRESH_TOKEN_DAYS", 7),
	}

	// Override secrets from Azure Key Vault when running in AKS with Workload Identity
	if cfg.AzureKeyVaultURL != "" {
		cfg.loadFromKeyVault()
	}

	return cfg
}

// loadFromKeyVault fetches secrets from Azure Key Vault using Managed Identity (Workload Identity).
// Falls back gracefully to environment variables if Key Vault is not reachable.
func (c *Config) loadFromKeyVault() {
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		log.Printf("[config] Azure Key Vault: could not obtain credentials, using env vars: %v", err)
		return
	}

	client, err := azsecrets.NewClient(c.AzureKeyVaultURL, cred, nil)
	if err != nil {
		log.Printf("[config] Azure Key Vault: could not create client, using env vars: %v", err)
		return
	}

	ctx := context.Background()

	if secret, err := client.GetSecret(ctx, "jwt-signing-key", "", nil); err == nil {
		c.JWTSecret = *secret.Value
		log.Println("[config] Loaded jwt-signing-key from Azure Key Vault")
	} else {
		log.Printf("[config] Azure Key Vault: jwt-signing-key not found, using env var: %v", err)
	}

	if secret, err := client.GetSecret(ctx, "identity-db-url", "", nil); err == nil {
		c.DatabaseURL = *secret.Value
		log.Println("[config] Loaded identity-db-url from Azure Key Vault")
	} else {
		log.Printf("[config] Azure Key Vault: identity-db-url not found, using env var: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
