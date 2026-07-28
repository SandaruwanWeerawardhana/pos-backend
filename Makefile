.PHONY: build run lint fmt vet tidy test test-unit test-integration cover \
	migrate-up migrate-down migrate-status seed swag \
	docker-build docker-up docker-down

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

cover:
	go test -race -coverprofile=coverage.out ./internal/... ./pkg/...
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

docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down
