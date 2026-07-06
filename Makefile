# Variables #
# Name of the application service defined in docker compose
APP_SERVICE=nest-setup-app

# ─── Help ─────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Docker / Containers"
	@echo "  setup           Build images, start containers, run migrations, seed database and run tests"
	@echo "  build           Rebuild images and start containers"
	@echo "  up              Start all containers in detached mode"
	@echo "  stop            Stop containers (without removing them)"
	@echo "  down            Stop and remove containers, networks and volumes"
	@echo "  clean           Remove containers, volumes and rebuild from scratch"
	@echo "  restart         Full stop + start cycle"
	@echo "  logs            Follow live logs from all containers"
	@echo ""
	@echo "In-container commands  (require running containers)"
	@echo "  exec            Open sh shell inside the app container"
	@echo "  bash            Open bash shell inside the app container"
	@echo "  bun-install     Run bun install inside the container"
	@echo "  run-start       Run bun run start inside the container"
	@echo "  run-dev         Run bun run start:dev (watch) inside the container"
	@echo "  run-build       Run bun run build inside the container"
	@echo "  run-lint        Run ESLint inside the container"
	@echo "  run-test         Run unit tests inside the container"
	@echo "  run-test-e2e     Run e2e tests inside the container"
	@echo "  run-all-tests    Run unit and e2e tests inside the container"
	@echo "  prisma-generate  Run prisma generate inside the container"
	@echo "  prisma-migrate   Create and apply a new migration (dev only)"
	@echo "  prisma-deploy    Apply pending migrations (production / CI)"
	@echo "  prisma-seed      Run prisma db seed inside the container"
	@echo "  exec-cmd         Run a custom command     (make exec-cmd cmd='<command>')"
	@echo ""

# Remove containers, volumes and host artifacts, then rebuild from scratch (no sudo needed)
clean:
	@echo "🧹 Stopping containers and unmounting volumes..."
	docker compose down -v
	@echo "🗑️  Removing host artifacts..."
	rm -rf node_modules dist
	@echo "🔨 Rebuilding from scratch..."
	docker compose build --no-cache

setup: build prisma-migrate prisma-seed run-all-tests
	@echo "✅ Setup complete! All services are running and the database is seeded."

# Build or rebuild services and start containers (useful after Dockerfile changes)
build:
	@echo "🔨 Building/rebuilding images and starting containers..."
	docker compose up --build -d

# Start all containers in detached mode (running in the background)
up:
	@echo "🚀 Starting all containers in detached mode..."
	docker compose up -d

# Stop all running containers without removing them (containers can be restarted later)
stop:
	@echo "⏸ Stopping all containers without removing them..."
	docker compose stop

# Stop and remove all containers, networks
down:
	@echo "🛑 Stopping and removing all containers, networks, and volumes..."
	docker compose down

# Stop and remove all containers, networks, and volumes
down-v:
	@echo "🛑 Stopping and removing all containers, networks, and volumes..."
	docker compose down -v

# Restart all containers (stop and then start again)
restart: down up

# Display live logs from all running containers (press Ctrl+C to stop viewing logs)
logs:
	@echo "📜 Showing live logs from all containers..."
	docker compose logs -f

# Open a shell inside the app container (useful for debugging)
exec:
	@echo "💻 Opening a shell inside the application container..."
	docker compose exec $(APP_SERVICE) sh

# Start a bash session inside the application container
bash:
	@echo "💻 Starting a bash session inside the application container..."
	docker compose exec $(APP_SERVICE) bash

# Run 'bun install' inside the app container to install dependencies
bun-install:
	@echo "💻 Running 'bun install' inside the application container..."
	docker compose exec $(APP_SERVICE) bun install

# Run the app in development mode inside the container
run-start:
	@echo "💻 Running the app in development mode inside the container..."
	docker compose exec $(APP_SERVICE) bun run start

# Run the app in watch mode (auto-restart on changes) inside the container
run-dev:
	@echo "💻 Running the app in watch mode inside the container..."
	docker compose exec $(APP_SERVICE) bun run start:dev

# Build the application inside the container
run-build:
	@echo "💻 Building the application inside the container..."
	docker compose exec $(APP_SERVICE) bun run build

# Run linters inside the container to verify code quality
run-lint:
	@echo "💻 Running linters inside the container..."
	docker compose exec $(APP_SERVICE) bun run lint

# Run tests inside the container
run-test:
	@echo "💻 Running tests inside the container..."
	docker compose exec $(APP_SERVICE) bun run test

# Run e2e tests inside the container
run-test-e2e:
	@echo "💻 Running e2e tests inside the container..."
	docker compose exec $(APP_SERVICE) bun run test:e2e

# Run unit and e2e tests inside the container
run-all-tests: run-test run-test-e2e
	@echo "✅ All tests have been executed!"

# Generate Prisma client inside the app container
prisma-generate:
	@echo "💻 Generating Prisma client inside the application container..."
	docker compose exec $(APP_SERVICE) bunx prisma generate

# Create and apply a new migration (development only)
prisma-migrate:
	@echo "💻 Creating and applying migration inside the application container..."
	docker compose exec $(APP_SERVICE) bunx prisma migrate dev

# Apply pending migrations without generating new ones (production / CI)
prisma-deploy:
	@echo "💻 Applying pending migrations inside the application container..."
	docker compose exec $(APP_SERVICE) bunx prisma migrate deploy

# Seed the database inside the app container
prisma-seed:
	@echo "💻 Syncing Prisma schema and seeding the database inside the application container..."
	docker compose exec $(APP_SERVICE) bunx prisma db seed

# Run any custom command inside the app container (example: 'make exec-cmd cmd="bun run lint"')
exec-cmd:
	@echo "💻 Running a custom command inside the application container..."
	docker compose exec $(APP_SERVICE) $(cmd)
