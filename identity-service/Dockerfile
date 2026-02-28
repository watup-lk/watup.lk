# Build stage — compile the Go binary in a full Go environment
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Cache dependencies before copying source (layer cache optimization)
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build a statically-linked binary (no CGO) for the minimal runtime image
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o identity-service ./cmd/server/main.go

# ── Runtime stage ── minimal Alpine image with no build tools
FROM alpine:3.21

# Install CA certificates for HTTPS calls to Azure Key Vault
RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/identity-service .

# HTTP API
EXPOSE 8080
# gRPC internal
EXPOSE 50052
# Prometheus metrics
EXPOSE 9090

# Run as non-root for security — UID 10001 must match deployment.yaml runAsUser: 10001
RUN addgroup -S -g 10001 appgroup \
 && adduser  -S -u 10001 -G appgroup appuser
USER appuser

CMD ["./identity-service"]
