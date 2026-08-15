.PHONY: build run lint fmt vet tidy test test-unit test-integration cover \
	migrate-up migrate-down migrate-status seed swag

BIN_DIR := bin

build:
	go build -o $(BIN_DIR)/api ./cmd/api
	go build -o $(BIN_DIR)/migrate ./cmd/migrate
	go build -o $(BIN_DIR)/seed ./cmd/seed

run:
	go run ./cmd/api

lint:
	golangci-lint run ./...

fmt:
	gofmt -l -w .

vet:
	go vet ./...

tidy:
	go mod tidy

test: test-unit

test-unit:
	go test -short -race ./...

test-integration:
	go test -race -tags=integration ./test/integration/...

# -coverpkg is required, not cosmetic: the service tests live in ./test/service,
# and without it Go credits their coverage to that package instead of to
# internal/service, which then reports as untested.
cover:
	go test -race -coverprofile=coverage.out \
		-coverpkg=./internal/...,./pkg/... \
		./internal/... ./pkg/... ./test/...
	go tool cover -func=coverage.out

migrate-up:
	go run ./cmd/migrate up

migrate-down:
	go run ./cmd/migrate down

migrate-status:
	go run ./cmd/migrate status

seed:
	go run ./cmd/seed

swag:
	swag init -g cmd/api/main.go -o docs
