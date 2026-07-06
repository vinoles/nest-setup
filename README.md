# NestJS Auth + Users API

Production-minded NestJS backend focused on authentication, session security, and role-based user management.

This project demonstrates:
- JWT access tokens with opaque refresh-session rotation
- immediate access-token revocation through Redis-backed `jti` blocklisting
- role-based authorization with custom Nest guards
- PostgreSQL persistence through Prisma
- Docker-first local development with Bun-based tooling

## Why this project exists
This repository is intentionally built as more than a CRUD demo. The goal is to show practical backend concerns such as:

- stateless auth with controlled server-side session revocation
- security tradeoffs (for example Redis `fail open` vs `fail closed` behavior)
- modular NestJS architecture
- testable infrastructure and auth flows

## Tech Stack
- **Runtime:** Node.js 22, NestJS 11
- **Package manager / tooling:** Bun
- **Database:** PostgreSQL 16 + Prisma
- **Security infrastructure:** Redis for access-token revocation by `jti`
- **Testing:** Jest + Supertest
- **Container workflow:** Docker Compose

## Prerequisites
- Docker
- Docker Compose

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/example/nest-setup.git
cd nest-setup
```

### 2. Create the local environment file
```bash
cp .env.example .env
```

### 3. Start the application stack
Recommended:

Use the bootstrap target:
```bash
make setup
```

If you only want the app running in Docker without the bootstrap flow:
```bash
docker compose up --build -d
```

Or, if you prefer step-by-step Make targets:
```bash
make build
make prisma-migrate
make prisma-seed
make run-test
make run-test-e2e
make run-dev
```

### 4. Install dependencies and generate Prisma artifacts
If this is the first local run, install dependencies inside the app container:
```bash
docker compose exec nest-setup-app bun install
```

Prisma client is generated automatically by `postinstall`, but you can run it explicitly if needed:
```bash
docker compose exec nest-setup-app bunx prisma generate
```

### 5. Apply migrations and seed data
If this is your first local run, initialize the database with:
```bash
make prisma-migrate
make prisma-seed
```

Or with Docker Compose directly:
```bash
docker compose exec nest-setup-app bunx prisma migrate dev
docker compose exec nest-setup-app bunx prisma db seed
```

### 6. Run the tests
```bash
make run-test
make run-test-e2e
```

Or with Docker Compose directly:
```bash
docker compose exec nest-setup-app bun run test
docker compose exec nest-setup-app bun run test:e2e
```

### 7. Run the app in watch mode
If the containers are already up:
```bash
make run-dev
```

Or with Docker Compose directly:
```bash
docker compose exec nest-setup-app bun run start:dev
```

## Common Local Commands
```bash
make logs           # follow container logs
make exec           # open sh inside the app container
make bash           # open bash inside the app container
make run-test       # run unit tests
make run-test-e2e   # run e2e tests
make run-all-tests  # run both unit and e2e tests
make prisma-generate
make prisma-migrate
make prisma-deploy
make prisma-seed
```

## Local URLs
- API: `http://localhost:3000` (or the value of `FORWARD_APP_PORT`)
- Swagger: `http://localhost:3000/api/docs` (or the forwarded app port)
- Postgres: forwarded from Docker Compose
- Redis: forwarded from Docker Compose

## Seed Credentials
The seed script creates:
- admin user: `admin@example.test / AdminPass123!`
- regular users: `daniel.morales@example.test / UserPass123!`

Examples include users such as:
- `daniel.morales@example.test`
- `lucia.vargas@example.test`
- `julia.castro@example.test`

## Architecture Overview
The application is organized around four top-level modules registered in `AppModule`:
- `RedisModule`
- `PrismaModule`
- `AuthModule`
- `UsersModule`

### RedisModule
Redis is kept intentionally as a **security infrastructure component**, not as a generic cache.

Current responsibility:
- store revoked JWT access-token `jti` values in a short-lived blocklist
- allow immediate access-token invalidation after logout while keeping the API stateless
- degrade to fail-open behavior if Redis is temporarily unavailable

Why this exists:
- refresh sessions are persisted in PostgreSQL via Prisma
- revoking a refresh token alone does **not** invalidate an already-issued access token
- Redis gives us a TTL-backed revocation store keyed by `jti`, so logout can take effect immediately

Current Redis availability tradeoff:
- if Redis is down, the API prioritizes availability and falls back to JWT validation without blocklist enforcement
- this means logout remains successful at the refresh-session level, but immediate access-token revocation is temporarily degraded until Redis recovers

What Redis is **not** used for today:
- refresh-token persistence
- rate limiting
- generic response caching
- job queues

### PrismaModule
- global infrastructure module
- exposes `PrismaService`
- centralizes database access for the rest of the application

### AuthModule
Responsible for:
- login
- refresh token rotation
- logout
- JWT signing
- request protection through `AuthGuard`
- immediate access-token invalidation through Redis blocklisting

Current auth model:
- short-lived JWT access tokens
- opaque refresh tokens persisted in the database
- revoked access-token JTIs stored in Redis until token expiry
- refresh token lookup optimized with SHA-256 lookup + bcrypt verification
- route protection handled by a custom guard instead of Passport strategy
- fail-open behavior if Redis is temporarily unavailable

### UsersLookupModule
Dedicated read-only dependency for authentication and guard-time user resolution.

Why it exists:
- `AuthModule` only needs user lookup, not the full `UsersService` surface
- this split removes the circular dependency between `AuthModule` and `UsersModule`
- the architecture stays explicit about what auth actually depends on

### UsersModule
Responsible for:
- user CRUD-style operations
- profile updates
- role changes
- active/inactive status updates

Authorization rules are layered with:
- `AuthGuard`
- `RolesGuard`
- `SelfOrAdminGuard`

## API Conventions
- Users endpoints are under `/api/v1/users`
- Auth endpoints are under `/api/v1/auth`
- Swagger is exposed at `/api/docs`

## Additional Documentation
The `/doc` folder contains project documentation, technical decisions, and design notes that complement this README.

Currently available documents:
- `doc/auth-flow.md`
- `doc/inactive-user-auth-enforcement.md`
- `doc/inactive-user-forbidden-response.md`
- `doc/auth-guard-users-service-di.md`

## Notable Technical Decisions
- **Refresh sessions live in PostgreSQL** while **revoked access tokens live in Redis**
- **Redis is not used as a generic cache**; it is intentionally scoped to token revocation
- **Redis fail-open behavior** prioritizes API availability when the revocation store is temporarily unavailable
- **Auth depends on `UsersLookupModule`**, not the full `UsersModule`, to avoid circular module dependencies
- **Email lookup is normalized** to avoid auth failures caused by casing or accidental whitespace

## Development Notes
- the app runs in Docker and mounts the repository into the container
- `start:dev` uses Nest watch mode inside the container
- Prisma migrations are preferred over `db push`
- the Makefile is the main operational entry point for local development
