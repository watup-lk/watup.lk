# Identity Service

A production-grade Go microservice that manages user authentication for the watup.lk salary transparency platform. This is the only service requiring user login — all salary submissions are anonymous.

## Overview

The identity service is responsible for:
- **User registration** — email + bcrypt-hashed password stored in `identity_schema`
- **Authentication** — JWT access tokens (15 min) + opaque refresh tokens (7 days)
- **Token validation** — called by the BFF on every authenticated request
- **Audit logging** — all auth events (signup, login, login_failed, logout, token_refresh) recorded in `identity_schema.audit_logs`
- **Privacy enforcement** — only `user_id` is ever shared with other services; email and password hash never leave this service

## Architecture

```
Browser
  │
  ▼
[Ingress Controller] ──→ [NGINX Ingress]
                                │
                     ┌──────────┴────────────┐
                     ▼                       ▼
               /auth/*                    /api/* or /
       [identity-service]            [bff / frontend]
          HTTP :8080                       │
          gRPC :50052  ◄───────────────────┘
               │              (internal token validation)
               ▼
       [PostgreSQL: identity_schema] (data namespace)
               │
       [Kafka: user.registered, user.login]
```

## API Reference

| Method | Path | Auth Required | Description |
|--------|------|:---:|-------------|
| `POST` | `/auth/signup` | — | Create account → `{user_id}` |
| `POST` | `/auth/login` | — | Authenticate → `{access_token, refresh_token, expires_at}` |
| `POST` | `/auth/refresh` | — | Rotate refresh token → new token pair |
| `POST` | `/auth/logout` | — | Revoke refresh token |
| `GET` | `/auth/validate` | Bearer | Validate JWT → `{user_id}` (BFF uses this) |
| `GET` | `/health/live` | — | Kubernetes liveness probe |
| `GET` | `/health/ready` | — | Kubernetes readiness probe (checks DB) |

### gRPC Internal API (port 50052)

Used by other microservices to validate tokens without routing through the BFF.

```protobuf
service IdentityService {
  rpc ValidateToken(ValidateTokenRequest) returns (ValidateTokenResponse);
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
}
```

## Database Schema

Tables created in `identity_schema` (isolated from salary/community data):

```sql
identity_schema.users              -- credentials + account status
identity_schema.refresh_tokens     -- revocable opaque token hashes
identity_schema.audit_logs         -- auth event history (no PII)
identity_schema.password_reset_tokens  -- one-time reset tokens
```

**Privacy**: `email` and `password_hash` never appear in other schemas.

## Configuration

| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Secret | PostgreSQL connection string with `search_path=identity_schema` |
| `JWT_SECRET` | Secret | HMAC-SHA256 signing key (min 32 chars) |
| `KAFKA_BROKERS` | ConfigMap | Comma-separated Kafka broker addresses |
| `AZURE_KEYVAULT_URL` | ConfigMap | Optional Key Vault URL for Workload Identity secret loading |
| `PORT` | ConfigMap | HTTP listen port (default: `8080`) |
| `GRPC_PORT` | ConfigMap | gRPC listen port (default: `50052`) |
| `ACCESS_TOKEN_MINUTES` | ConfigMap | JWT access token lifetime (default: `15`) |
| `REFRESH_TOKEN_DAYS` | ConfigMap | Refresh token lifetime (default: `7`) |

---

## Deployment Guide

This service repository builds, tests, scans, and publishes the identity-service image to Azure Container Registry. Kubernetes manifests and cluster deployment scripts live in the separate `watup.lk-k8s-deployment` repository.

For deployment, publish an image from this repo, then run the deployment repo with the published image URI:

```bash
ACR_LOGIN_SERVER=watupacr.azurecr.io IMAGE_TAG=<git-sha> \
  ../watup.lk-k8s-deployment/scripts/install.sh
```

---

## Testing the Workflow

### Run Unit Tests Locally

```bash
go test -v -race -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
```

### Run End-to-End Tests

```bash
# Against local service
./test-e2e.sh http://localhost:8080

# Against a Kubernetes ingress endpoint
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
./test-e2e.sh "http://${INGRESS_IP}"
```

### Manual curl Workflow (demonstrates the full auth flow)

```bash
BASE_URL="http://localhost:8080"

# 1. Sign up
curl -s -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"SecurePass99"}' | jq .

# 2. Login — note the access_token and refresh_token
TOKENS=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"SecurePass99"}')
ACCESS_TOKEN=$(echo "$TOKENS" | jq -r '.access_token')
REFRESH_TOKEN=$(echo "$TOKENS" | jq -r '.refresh_token')

# 3. Validate token (BFF calls this on every authenticated request)
curl -s -X GET "$BASE_URL/auth/validate" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# 4. Refresh the access token
NEW_TOKENS=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}")
echo "$NEW_TOKENS" | jq .

# 5. Logout
curl -s -X POST "$BASE_URL/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$(echo "$NEW_TOKENS" | jq -r '.refresh_token')\"}"
```

---

## Local Development

```bash
# Start PostgreSQL and Kafka with Docker Compose (from repo root)
docker-compose up postgres-db kafka -d

# Set environment variables
export DATABASE_URL="postgres://user:pass@localhost:5432/watup_db?search_path=identity_schema&sslmode=disable"
export JWT_SECRET="local-dev-secret-key-min-32-chars!!"
export KAFKA_BROKERS="localhost:9092"

# Apply DB schema
psql "$DATABASE_URL" -f ../infra-db/init-scripts/02-identity-schema.sql

# Run the service
go run ./cmd/server/main.go
```

---

## Security Notes

| Control | Implementation |
|---------|---------------|
| Password storage | bcrypt with `DefaultCost` (adaptive) |
| JWT signing | HMAC-SHA256 with secret from Kubernetes Secret or external secret manager |
| Refresh tokens | Opaque UUIDs stored as SHA-256 hashes — plaintext never persisted |
| Token rotation | Old refresh token revoked on every refresh |
| Rate limiting | Per-IP token bucket: 20 burst / 5 req/s + NGINX Ingress 10 RPS |
| CORS | Configurable cross-origin support for frontend/BFF integration |
| Security headers | OWASP recommended set (HSTS, CSP, X-Frame-Options, etc.) |
| Service isolation | ClusterIP + NetworkPolicy — not reachable from outside the cluster |
| Secrets | Kubernetes Secret by default, with optional external secret manager integration |
| Pod security | Runs as non-root user in minimal Alpine image |

---

## Kafka Events

| Topic | Published When | Payload |
|-------|---------------|---------|
| `user.registered` | Successful signup | `{user_id, event_type, timestamp}` |
| `user.login` | Successful login | `{user_id, event_type, timestamp}` |
| `user.logout` | Successful logout | `{user_id, event_type, timestamp}` |
| `user.token_refresh` | Successful token refresh | `{user_id, event_type, timestamp}` |

Events are fire-and-forget (goroutine) to avoid blocking the HTTP response.

## Audit Logging

All auth events are recorded in `identity_schema.audit_logs` for security monitoring:

| Event | Logged On | Fields |
|-------|-----------|--------|
| `signup` | User creates account | user_id, ip_address, success |
| `login` | Successful authentication | user_id, ip_address, success |
| `login_failed` | Wrong password or disabled account | user_id (if known), ip_address, success=false |
| `logout` | Token revocation | user_id, ip_address, success |
| `token_refresh` | Token rotation | user_id, ip_address, success |

Audit logs are written asynchronously (fire-and-forget) to avoid impacting response times.

---

## Proto Regeneration

If you modify `api/proto/v1/identity.proto`, regenerate the Go files:

```bash
make proto

# Or manually:
protoc \
  --plugin=protoc-gen-go=$HOME/go/bin/protoc-gen-go \
  --plugin=protoc-gen-go-grpc=$HOME/go/bin/protoc-gen-go-grpc \
  --go_out=. --go_opt=paths=source_relative \
  --go-grpc_out=. --go-grpc_opt=paths=source_relative \
  api/proto/v1/identity.proto
```
