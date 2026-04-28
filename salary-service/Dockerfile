FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o salary-service ./cmd/server/main.go

FROM alpine:3.21

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/salary-service .

EXPOSE 8080

RUN addgroup -S -g 10001 appgroup \
 && adduser  -S -u 10001 -G appgroup appuser
USER appuser

CMD ["./salary-service"]
