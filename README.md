# NestJS Setup Auth Test Example

NestJS backend that exposes:
- authentication endpoints with JWT access tokens and opaque refresh sessions
- user management endpoints with role-based access control
- MDM endpoints backed by a NinjaOne integration

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
docker compose exec nest-setup-app pnpm install
```

Prisma client is generated automatically by `postinstall`, but you can run it explicitly if needed:
```bash
docker compose exec nest-setup-app pnpm prisma:generate
```

### 5. Apply migrations and seed data
If this is your first local run, initialize the database with:
```bash
make prisma-migrate
make prisma-seed
```

Or with Docker Compose directly:
```bash
docker compose exec nest-setup-app pnpm exec prisma migrate dev
docker compose exec nest-setup-app pnpm prisma:seed
```

### 6. Run the tests
```bash
make run-test
make run-test-e2e
```

Or with Docker Compose directly:
```bash
docker compose exec nest-setup-app pnpm run test
docker compose exec nest-setup-app pnpm run test:e2e
```

### 7. Run the app in watch mode
If the containers are already up:
```bash
make run-dev
```

Or with Docker Compose directly:
```bash
docker compose exec nest-setup-app pnpm run start:dev
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
- API: `http://localhost:${PORT}`
- Swagger: `http://localhost:${PORT}/api/docs`
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
- `PrismaModule`
- `AuthModule`
- `UsersModule`

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

Current auth model:
- short-lived JWT access tokens
- opaque refresh tokens persisted in the database
- refresh token lookup optimized with SHA-256 lookup + bcrypt verification
- route protection handled by a custom guard instead of Passport strategy

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
- MDM endpoints are under `/api/v1/mdm`
- Swagger is exposed at `/api/docs`

## Additional Documentation
The `/doc` folder contains project documentation, technical decisions, and design notes that complement this README.

Currently available documents:
- `doc/access_tokens.md`
- `doc/inactive-user-auth-enforcement.md`
- `doc/inactive-user-forbidden-response.md`
- `doc/auth-guard-users-service-di.md`
- `doc/observaciones.md`

## Development Notes
- the app runs in Docker and mounts the repository into the container
- `start:dev` uses Nest watch mode inside the container
- Prisma migrations are preferred over `db push`
- the Makefile is the main operational entry point for local development
