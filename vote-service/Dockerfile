# Build stage
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .

# Install Delve for debugging
RUN go install github.com/go-delve/delve/cmd/dlv@latest

# Build without optimizations for debugging
RUN CGO_ENABLED=0 GOOS=linux go build -gcflags="all=-N -l" -o server ./cmd/server/main.go

# Final stage
FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/server .
COPY --from=builder /go/bin/dlv /usr/local/bin/dlv

# Expose app ports and Delve debugger port
EXPOSE 8080 40000

CMD ["dlv", "--listen=:40000", "--headless=true", "--api-version=2", "--accept-multiclient", "exec", "./server", "--continue"]
