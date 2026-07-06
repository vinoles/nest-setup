# Authentication Flow

## Goal
Document the real authentication flow implemented by the application so the security model is easy to understand, review, and evolve.

## High-level model
The API uses a hybrid auth model:

- **JWT access tokens** for stateless authorization on protected routes
- **Opaque refresh tokens** persisted as server-side sessions in PostgreSQL
- **Redis token blocklist** for immediate access-token invalidation after logout

This means:

- access tokens are self-contained and short-lived
- refresh tokens are stateful and can be rotated / revoked
- logout takes effect immediately for the active access token through Redis blocklisting

---

## 1. Login flow

### Endpoint
`POST /api/v1/auth/login`

### What happens
1. The client sends `email` + `password`.
2. `AuthService.signIn()` looks up the user through `UsersService`.
3. The password is verified with `bcrypt.compare()`.
4. The service rejects inactive users.
5. A JWT access token is issued with:
   - `sub`
   - `email`
   - `role`
   - `jti`
6. A refresh session is created in PostgreSQL.
7. The API returns:
   - `access_token`
   - `refresh_token`

### Important implementation details
- the access token `jti` is generated with `randomUUID()`
- the refresh token is opaque (`rt_<random>`)
- the plain refresh token is **never stored** in the database

---

## 2. Refresh-session persistence model

Refresh sessions are stored in PostgreSQL via Prisma, not in Redis.

Each session stores:
- `tokenHash` → bcrypt hash of the opaque refresh token
- `tokenLookup` → SHA-256 lookup key for O(1) indexed access
- `familyId` → groups rotated refresh tokens into the same session family
- `accessTokenJti` / `accessTokenExp` → metadata of the access token associated with that refresh session
- `expiresAt`, `revokedAt`, `replacedBy`, `lastUsedAt`

### Why both SHA-256 and bcrypt are used
- **SHA-256** gives fast indexed lookup by token identity
- **bcrypt** ensures the original token still cannot be reconstructed or trivially replayed if lookup data leaks

---

## 3. Protected-route access flow

### Guard
`AuthGuard`

### What happens on a protected request
1. Extract bearer token from the `Authorization` header.
2. Verify JWT signature and payload shape.
3. Check whether the token `jti` is blocklisted in Redis.
4. Load the user from `UsersService`.
5. Reject the request if the user is missing or inactive.
6. Attach `request.user` and continue.

### Why Redis is involved here
JWTs are otherwise stateless. Without a revocation store, a previously issued access token would remain valid until natural expiration even after logout.

Redis solves that by storing revoked `jti` values with TTL.

---

## 4. Refresh flow

### Endpoint
`POST /api/v1/auth/refresh`

### What happens
1. The client sends a refresh token.
2. `RefreshSessionService.validateToken()`:
   - finds the session by `tokenLookup`
   - verifies expiry / revocation / replacement state
   - verifies the plain token against the bcrypt hash
   - updates `lastUsedAt`
3. The user is loaded and checked for active status.
4. A new JWT access token is issued.
5. The refresh token is rotated.
6. The API returns a new pair:
   - `access_token`
   - `refresh_token`

### Rotation model
The old refresh session is marked as replaced and a new session is created in the same `familyId`.

This gives the application a basis for refresh-token reuse detection and family-wide revocation.

---

## 5. Logout flow

### Endpoint
`POST /api/v1/auth/logout`

### What happens
1. The client sends the current refresh token.
2. The refresh session is revoked in PostgreSQL.
3. The service returns the associated `accessTokenJti` and `accessTokenExp`.
4. `TokenBlocklistService` stores `blocklist:<jti>` in Redis with TTL derived from the access token expiration.

### Why this matters
This is what gives the project **immediate logout semantics** for access tokens.

Without Redis blocklisting:
- the refresh session could be revoked
- but the current access token would still work until expiry

---

## 6. What Redis is and is not used for

### Redis is used for
- access-token revocation by `jti`
- TTL-backed blocklist entries that expire automatically

### Redis is not used for
- refresh-token persistence
- generic cache
- rate limiting
- queues
- full server-side session storage

This distinction is important because PostgreSQL and Redis have different responsibilities in the current design.

---

## 7. Security properties of the current design

### Strengths
- short-lived stateless access tokens
- server-side refresh-session control
- rotation support
- immediate logout for access tokens through Redis blocklisting
- inactive users blocked at request time

### Known tradeoffs / next improvements
- refresh-token rotation should be hardened further against concurrency races
- Redis failure strategy should be explicitly documented (`fail open` vs `fail closed`)
- integration tests should cover the full login → refresh → logout → blocked-token flow

---

## 8. File map

- `src/auth/auth.controller.ts` — auth endpoints
- `src/auth/auth.service.ts` — login / refresh / logout orchestration
- `src/auth/auth.guard.ts` — request-time JWT validation + blocklist + user-active check
- `src/auth/refresh-session.service.ts` — refresh-session persistence and rotation logic
- `src/auth/token-blocklist.service.ts` — Redis-backed `jti` blocklist
- `src/redis/redis.module.ts` — Redis client provider
- `prisma/schema.prisma` — refresh-session persistence model
