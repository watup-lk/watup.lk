# Identity Service

A production-grade Go microservice that manages user authentication for the watup.lk salary transparency platform. This is the only service requiring user login — all salary submissions are anonymous.

## Overview

The identity service is responsible for:
- **User registration** — email + bcrypt-hashed password stored in `identity_schema`
- **Authentication** — JWT access tokens (15 min) + opaque refresh tokens (7 days)
- **Token validation** — called by the BFF on every authenticated request
- **Privacy enforcement** — only `user_id` is ever shared with other services; email and password hash never leave this service

## Architecture

```
Browser
  │
  ▼
[Azure Load Balancer] ──→ [NGINX Ingress]
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
| `DATABASE_URL` | Secret / Key Vault | PostgreSQL connection string with `search_path=identity_schema` |
| `JWT_SECRET` | Secret / Key Vault | HMAC-SHA256 signing key (min 32 chars) |
| `KAFKA_BROKERS` | ConfigMap | Comma-separated Kafka broker addresses |
| `AZURE_KEYVAULT_URL` | ConfigMap | Key Vault URL for Workload Identity secret loading |
| `PORT` | ConfigMap | HTTP listen port (default: `8080`) |
| `GRPC_PORT` | ConfigMap | gRPC listen port (default: `50052`) |
| `ACCESS_TOKEN_MINUTES` | ConfigMap | JWT access token lifetime (default: `15`) |
| `REFRESH_TOKEN_DAYS` | ConfigMap | Refresh token lifetime (default: `7`) |

---

## Deployment Guide

### Prerequisites

```bash
# Tools required
brew install kubectl azure-cli jq
az login
az aks install-cli

# Verify cluster access
az aks get-credentials --resource-group <RESOURCE_GROUP> --name <CLUSTER_NAME>
kubectl get nodes
```

### Step 1 — Initialize the Database Schema

```bash
# Apply the schema to the running PostgreSQL pod
kubectl exec -n data deploy/postgres -- psql \
  -U watup_user -d watup_db \
  -f /docker-entrypoint-initdb.d/02-identity-schema.sql

# Or copy and apply the file directly:
kubectl cp ../infra-db/init-scripts/02-identity-schema.sql \
  data/$(kubectl get pod -n data -l app=postgres -o jsonpath='{.items[0].metadata.name}'):/tmp/schema.sql
kubectl exec -n data deploy/postgres -- psql -U watup_user -d watup_db -f /tmp/schema.sql
```

### Step 2 — Configure Secrets

#### Option A: Azure Key Vault (Production — Recommended)

```bash
# 1. Create Key Vault
az keyvault create \
  --name watup-keyvault \
  --resource-group <RESOURCE_GROUP> \
  --location eastus

# 2. Store secrets
az keyvault secret set --vault-name watup-keyvault \
  --name jwt-signing-key \
  --value "$(openssl rand -base64 48)"

az keyvault secret set --vault-name watup-keyvault \
  --name identity-db-url \
  --value "postgres://watup_user:<PASSWORD>@postgres-service.data.svc.cluster.local:5432/watup_db?search_path=identity_schema&sslmode=require"

# 3. Enable Workload Identity on AKS
az aks update \
  --resource-group <RESOURCE_GROUP> \
  --name <CLUSTER_NAME> \
  --enable-oidc-issuer \
  --enable-workload-identity

# 4. Create Managed Identity + federate with ServiceAccount
az identity create --name identity-service-mid --resource-group <RESOURCE_GROUP>
PRINCIPAL_ID=$(az identity show --name identity-service-mid --query principalId -o tsv)

az keyvault set-policy --name watup-keyvault \
  --object-id "$PRINCIPAL_ID" \
  --secret-permissions get list

CLIENT_ID=$(az identity show --name identity-service-mid --query clientId -o tsv)
OIDC_ISSUER=$(az aks show --name <CLUSTER_NAME> --resource-group <RESOURCE_GROUP> \
  --query oidcIssuerProfile.issuerUrl -o tsv)

az identity federated-credential create \
  --name identity-service-fed \
  --identity-name identity-service-mid \
  --resource-group <RESOURCE_GROUP> \
  --issuer "$OIDC_ISSUER" \
  --subject "system:serviceaccount:app:identity-service-sa"

# 5. Update serviceaccount.yaml with the client ID:
#    azure.workload.identity/client-id: "<CLIENT_ID>"
sed -i "s/00000000-0000-0000-0000-000000000000/$CLIENT_ID/" k8s/serviceaccount.yaml
```

#### Option B: Kubernetes Secret (Development/Demo)

```bash
# Generate and apply a Kubernetes secret
kubectl create secret generic identity-service-secret \
  --namespace app \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=DATABASE_URL="postgres://watup_user:<PASSWORD>@postgres-service.data.svc.cluster.local:5432/watup_db?search_path=identity_schema" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 3 — Build and Push the Docker Image

```bash
# Set your ACR name
export ACR_NAME=watupacr
export REGISTRY="${ACR_NAME}.azurecr.io"
export TAG=$(git rev-parse --short HEAD)

# Login to ACR
az acr login --name $ACR_NAME

# Build and push
docker build -t "${REGISTRY}/identity-service:${TAG}" -t "${REGISTRY}/identity-service:latest" .
docker push "${REGISTRY}/identity-service:${TAG}"
docker push "${REGISTRY}/identity-service:latest"

# Update the image in deployment.yaml:
sed -i "s|watupacr.azurecr.io/identity-service:latest|${REGISTRY}/identity-service:${TAG}|" \
  k8s/deployment.yaml
```

### Step 4 — Apply All Kubernetes Manifests

```bash
# Apply everything in order (or use: make k8s-apply)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/kafka/
kubectl apply -f k8s/serviceaccount.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/network-policy.yaml
```

### Step 5 — Verify the Deployment

```bash
# Check pods are running (should show 2/2 Ready)
kubectl get pods -n app -l app=identity-service

# Check liveness and readiness probes
kubectl describe pod -n app -l app=identity-service | grep -A5 "Liveness\|Readiness"

# Check HPA
kubectl get hpa -n app

# View logs
kubectl logs -n app -l app=identity-service -f

# Check the database schema was applied
kubectl exec -n data deploy/postgres -- \
  psql -U watup_user -d watup_db -c "\dt identity_schema.*"
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

# Against AKS (get the ingress IP first)
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
| JWT signing | HMAC-SHA256 with secret from Azure Key Vault |
| Refresh tokens | Opaque UUIDs stored as SHA-256 hashes — plaintext never persisted |
| Token rotation | Old refresh token revoked on every refresh |
| Rate limiting | Per-IP token bucket: 20 burst / 5 req/s + NGINX Ingress 10 RPS |
| Security headers | OWASP recommended set (HSTS, CSP, X-Frame-Options, etc.) |
| Service isolation | ClusterIP + NetworkPolicy — not reachable from outside the cluster |
| Secrets | Azure Key Vault via Workload Identity — zero credentials in image |
| Pod security | Runs as non-root user in minimal Alpine image |

---

## Kafka Events

| Topic | Published When | Payload |
|-------|---------------|---------|
| `user.registered` | Successful signup | `{user_id, event_type, timestamp}` |
| `user.login` | Successful login | `{user_id, event_type, timestamp}` |

Events are fire-and-forget (goroutine) to avoid blocking the HTTP response.

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
