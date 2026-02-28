# ── Identity Service Makefile ──────────────────────────────────────────────────
# Usage: make <target>
# Run `make help` to see all available targets.

BINARY        := identity-service
REGISTRY      ?= watupacr.azurecr.io
IMAGE         := $(REGISTRY)/$(BINARY)
TAG           ?= latest
GOFLAGS       ?= -v -race
COVERAGE_FILE := coverage.out
MIN_COVERAGE  := 60

# Proto generation settings
PROTOC        := /opt/anaconda3/bin/protoc
PROTOC_GO     := $(HOME)/go/bin/protoc-gen-go
PROTOC_GRPC   := $(HOME)/go/bin/protoc-gen-go-grpc
PROTO_SRC     := api/proto/v1/identity.proto

.PHONY: all build test test-cover lint fmt vet proto \
        docker-build docker-push docker-run \
        k8s-apply k8s-delete k8s-status \
        clean help

## help: Show this help message
help:
	@echo "Identity Service — Available Targets"
	@echo "========================================"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'

# ── Build ──────────────────────────────────────────────────────────────────────

## build: Compile the binary to ./bin/identity-service
build:
	@mkdir -p bin
	CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bin/$(BINARY) ./cmd/server/main.go
	@echo "✓ Built bin/$(BINARY)"

## run: Run the service locally (requires DATABASE_URL and JWT_SECRET env vars)
run:
	go run ./cmd/server/main.go

# ── Test ───────────────────────────────────────────────────────────────────────

## test: Run all unit tests with race detector
test:
	go test $(GOFLAGS) ./... -coverprofile=$(COVERAGE_FILE) -covermode=atomic

## test-cover: Show coverage report in browser
test-cover: test
	go tool cover -html=$(COVERAGE_FILE)

## test-ci: Run tests and enforce minimum coverage threshold (used in CI)
test-ci:
	go test -v -race ./... -coverprofile=$(COVERAGE_FILE) -covermode=atomic
	@COVERAGE=$$(go tool cover -func=$(COVERAGE_FILE) | grep total | awk '{print $$3}' | sed 's/%//'); \
	echo "Coverage: $$COVERAGE%"; \
	if [ $$(echo "$$COVERAGE < $(MIN_COVERAGE)" | bc -l) -eq 1 ]; then \
		echo "FAIL: coverage $$COVERAGE% is below minimum $(MIN_COVERAGE)%"; exit 1; \
	fi

# ── Code Quality ──────────────────────────────────────────────────────────────

## vet: Run go vet static analysis
vet:
	go vet ./...

## fmt: Format all Go source files
fmt:
	gofmt -s -w .
	@echo "✓ Formatted"

## lint: Run golangci-lint (install: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
lint:
	golangci-lint run ./...

## sec: Run gosec security scanner (install: go install github.com/securego/gosec/v2/cmd/gosec@latest)
sec:
	gosec ./...

# ── Proto ──────────────────────────────────────────────────────────────────────

## proto: Regenerate Go code from identity.proto
proto:
	$(PROTOC) \
		--plugin=protoc-gen-go=$(PROTOC_GO) \
		--plugin=protoc-gen-go-grpc=$(PROTOC_GRPC) \
		--go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		$(PROTO_SRC)
	@echo "✓ Proto files generated"

# ── Docker ─────────────────────────────────────────────────────────────────────

## docker-build: Build the Docker image
docker-build:
	docker build \
		--tag $(IMAGE):$(TAG) \
		--tag $(IMAGE):latest \
		--label "git.commit=$(shell git rev-parse --short HEAD)" \
		.
	@echo "✓ Built $(IMAGE):$(TAG)"

## docker-push: Push the image to Azure Container Registry
docker-push: docker-build
	az acr login --name $(shell echo $(REGISTRY) | cut -d. -f1)
	docker push $(IMAGE):$(TAG)
	docker push $(IMAGE):latest
	@echo "✓ Pushed to $(REGISTRY)"

## docker-run: Run the service in Docker for local testing
docker-run:
	docker run --rm -p 8080:8080 -p 50052:50052 -p 9090:9090 \
		-e DATABASE_URL="$(DATABASE_URL)" \
		-e JWT_SECRET="$(JWT_SECRET)" \
		-e KAFKA_BROKERS="$(KAFKA_BROKERS)" \
		$(IMAGE):$(TAG)

# ── Kubernetes ─────────────────────────────────────────────────────────────────

## k8s-apply: Apply all Kubernetes manifests to the cluster
k8s-apply:
	@echo "Applying namespaces..."
	kubectl apply -f k8s/namespace.yaml
	@echo "Applying PostgreSQL (data namespace)..."
	kubectl apply -f k8s/postgres/
	@echo "Applying Kafka..."
	kubectl apply -f k8s/kafka/
	@echo "Applying identity-service..."
	kubectl apply -f k8s/serviceaccount.yaml
	kubectl apply -f k8s/configmap.yaml
	kubectl apply -f k8s/secret.yaml
	kubectl apply -f k8s/deployment.yaml
	kubectl apply -f k8s/service.yaml
	kubectl apply -f k8s/hpa.yaml
	kubectl apply -f k8s/pdb.yaml
	kubectl apply -f k8s/ingress.yaml
	kubectl apply -f k8s/network-policy.yaml
	@echo "✓ All manifests applied"

## k8s-delete: Remove all identity-service resources from the cluster
k8s-delete:
	kubectl delete -f k8s/network-policy.yaml --ignore-not-found
	kubectl delete -f k8s/ingress.yaml --ignore-not-found
	kubectl delete -f k8s/pdb.yaml --ignore-not-found
	kubectl delete -f k8s/hpa.yaml --ignore-not-found
	kubectl delete -f k8s/deployment.yaml --ignore-not-found
	kubectl delete -f k8s/service.yaml --ignore-not-found
	kubectl delete -f k8s/configmap.yaml --ignore-not-found
	kubectl delete -f k8s/secret.yaml --ignore-not-found
	kubectl delete -f k8s/serviceaccount.yaml --ignore-not-found
	kubectl delete -f k8s/kafka/ --ignore-not-found
	# Note: postgres PVC is NOT deleted automatically (data safety)
	@echo "⚠ PostgreSQL PVC NOT deleted — run 'kubectl delete pvc postgres-pvc -n data' to remove data"

## k8s-status: Show status of all identity-service resources
k8s-status:
	@echo "=== Deployments (app namespace) ==="
	kubectl get deployments -n app
	@echo ""
	@echo "=== Pods (app namespace) ==="
	kubectl get pods -n app -l app=identity-service
	@echo ""
	@echo "=== Services ==="
	kubectl get svc -n app identity-service
	@echo ""
	@echo "=== HPA ==="
	kubectl get hpa -n app identity-service-hpa
	@echo ""
	@echo "=== PDB ==="
	kubectl get pdb -n app identity-service-pdb
	@echo ""
	@echo "=== Ingress ==="
	kubectl get ingress -n app

## k8s-logs: Tail logs from the identity-service pod
k8s-logs:
	kubectl logs -n app -l app=identity-service -f --tail=100

# ── Cleanup ────────────────────────────────────────────────────────────────────

## clean: Remove build artifacts
clean:
	rm -rf bin/ $(COVERAGE_FILE)
	@echo "✓ Cleaned"
