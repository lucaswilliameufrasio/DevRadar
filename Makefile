# Makefile for DevRadar Performant Backends

.PHONY: test-rust test-go test-node test-all load-test-rust load-test-go load-test-node migrate-make-node migrate-make-go migrate-make-rust

# ... existing test targets ...

# Migration creation targets
migrate-make-node:
	@read -p "Migration name: " name; \
	cd backend && npx knex migrate:make $$name

migrate-make-go:
	@read -p "Migration name: " name; \
	cd backend-golang && goose -dir migrations create $$name sql

migrate-make-rust:
	@read -p "Migration name: " name; \
	cd backend-rust && sqlx migrate add $$name

test-rust:
	@echo "🧪 Running Rust (Axum) tests..."
	cargo test --manifest-path backend-rust/Cargo.toml

test-go:
	@echo "🧪 Running Go (Chi) tests..."
	cd backend-golang && go test -v ./...

test-node:
	@echo "🧪 Running Node.js (Fastify) tests..."
	cd backend && npm test

test-all: test-rust test-go test-node

load-test-rust:
	@echo "🚀 Starting Rust backend and running load test..."
	cd backend-rust && cargo run --release & sleep 5
	k6 run -e TARGET_URL=http://localhost:9988 load_tests/k6_load_test.js
	killall devradar-api || true

load-test-go:
	@echo "🚀 Starting Go backend and running load test..."
	cd backend-golang && go run main.go & sleep 5
	k6 run -e TARGET_URL=http://localhost:9988 load_tests/k6_load_test.js
	killall main || true

load-test-node:
	@echo "🚀 Starting Node.js backend and running load test..."
	cd backend && npm run dev & sleep 5
	k6 run -e TARGET_URL=http://localhost:9988 load_tests/k6_load_test.js
	killall node || true

# Helper to kill any process running on 9988
clean-ports:
	lsof -ti:9988 | xargs kill -9 || true
