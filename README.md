# 📚 LibraFlow — Full-Stack Library Platform

Concurrency-safe book circulation with JWT + optional Google OAuth2, refresh-token
rotation with reuse detection, rate-limited auth, and a one-command production
Docker stack. Spring Boot 3 + MySQL on the back, Next.js 16 + TypeScript on the front.

[![CI](https://github.com/Iampranjaldubey/LibraFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Iampranjaldubey/LibraFlow/actions/workflows/ci.yml)
![Coverage](https://img.shields.io/badge/backend%20coverage-61%25-yellowgreen)
![Java](https://img.shields.io/badge/Java-17-orange)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2-6DB33F)
![Next.js](https://img.shields.io/badge/Next.js-16-black)

![Dashboard](screenshots/dashboard.png)

---

## 🚀 Run it (one command)

```bash
docker compose up --build
```

Starts **MySQL 8 → Spring Boot API → Next.js UI**, each gated on the previous one's
healthcheck, with demo data seeded.

| | |
|---|---|
| App | http://localhost:3000 |
| API docs (Swagger) | http://localhost:8080/swagger-ui.html |
| Admin | `admin@libraflow.dev` / `LibraFlow@2026` |
| Librarian | `librarian@libraflow.dev` / `LibraFlow@2026` |
| Member | `member@libraflow.dev` / `LibraFlow@2026` |

Only Docker is required. Optional overrides: `cp .env.example .env`.

**Deploying for free** (Aiven MySQL + Render API + Vercel web): see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 🧩 Engineering Highlights

### Concurrency-safe circulation
`issueBook` used to read → check availability → decrement → save with no locking,
so two requests for the last copy could both succeed and over-issue a book. A
[12-thread test](backend/src/test/java/com/library/service/TransactionConcurrencyTest.java)
reproduces it (10/12 succeed on the old code). The fix is **JPA optimistic locking**:
a `@Version` column on `Book` (Flyway
[V5](backend/src/main/resources/db/migration/V5__add_book_version_optimistic_lock.sql))
turns the update into `... WHERE id = ? AND version = ?`, and
[`issueBook`](backend/src/main/java/com/library/service/impl/TransactionServiceImpl.java)
retries the loser in a fresh `REQUIRES_NEW` transaction with jittered backoff.
Rejected alternatives (pessimistic `SELECT ... FOR UPDATE`, atomic conditional
`UPDATE`) and when each would win are documented inline. The same race is also
tested against [real MySQL](backend/src/test/java/com/library/integration/TransactionConcurrencyMySQLTest.java).

### Token security
- Short-lived access JWT (15 min); the refresh token lives **only** in an
  `HttpOnly` cookie scoped to `/api/v1/auth` — never in JSON or `localStorage`.
- Every `/refresh` [rotates](backend/src/main/java/com/library/service/impl/RefreshTokenServiceImpl.java)
  the token; replaying a rotated one is treated as theft and **revokes the whole family**.
- The Next.js app is a **same-origin proxy (BFF)** for `/api`, `/oauth2` and
  `/login/oauth2`, so the cookie is first-party (`SameSite=Lax`) and the browser
  never talks to the API cross-origin.
- **Google OAuth2 never puts tokens in URLs**: the success handler only sets the
  cookie and redirects to `/oauth-callback`, which exchanges it via `POST /refresh`.
  Google login is optional — it's registered only when credentials exist, and the
  UI hides the button via `GET /api/v1/auth/providers`.

### Abuse protection
[`RateLimitFilter`](backend/src/main/java/com/library/security/RateLimitFilter.java):
per-IP, per-endpoint **token bucket** on login, register and password-reset routes
(default burst 10, refill 10/min) → `429` + `Retry-After`. Token bucket rather than
fixed window so a user's few typos are fine but there's no boundary double-burst.
Memory is bounded (idle-bucket eviction + hard cap). Unit-tested with an injected
clock and integration-tested through the real filter chain.

### Testing against real infrastructure
- **65 backend tests**: services (Mockito), HTTP contracts on a real embedded server
  (401 vs 403, cookie flags, rotation/reuse), and **Testcontainers MySQL** running the
  actual Flyway migrations with `ddl-auto=validate`.
- **Frontend**: Vitest + Testing Library (auth context, hooks, OAuth flow).
- **CI** ([ci.yml](.github/workflows/ci.yml)): backend `mvnw verify` with a JaCoCo gate,
  frontend type-check/tests/build, then builds all three images, boots the stack with
  `docker compose up --wait`, and runs an end-to-end smoke test (demo login through
  the proxy, cookie rotation, seeded data, rate limiter returns 429).

### PDF receipts
`GET /api/v1/transactions/{id}/receipt` streams an
[OpenPDF receipt](backend/src/main/java/com/library/service/impl/ReceiptServiceImpl.java).

---

## 🛡 Production readiness

| Concern | Implementation |
|---|---|
| Health | Actuator liveness + readiness (readiness includes DB); used by Docker `HEALTHCHECK`, compose `depends_on`, Render deploy gate |
| Zero-downtime deploys | Readiness-gated traffic + `server.shutdown=graceful` (20 s drain); JVM is PID 1 via `exec` so it receives `SIGTERM` |
| Containers | Multi-stage builds, non-root users, Next.js `standalone` output, container-aware heap (`MaxRAMPercentage`), `ExitOnOutOfMemoryError` |
| Config | 12-factor: all secrets/env via environment; CORS origins from `FRONTEND_URL` + `CORS_ALLOWED_ORIGINS` (no hard-coded hosts) |
| Schema | Flyway V1–V6, Hibernate `validate` only — no `ddl-auto=update` |
| HTTP security | CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer/Permissions-Policy, HSTS; no stack traces in error bodies |
| Auth hardening | Rate limiting, refresh rotation + reuse detection, BCrypt, role checks at URL **and** method level, anti-enumeration on forgot-password |
| Demo data | Idempotent seeder, off by default (`APP_DEMO_SEED`), fails fast on a weak password |

### Known trade-offs
- The rate limiter is **in-memory, per instance** — correct for one replica. Horizontal
  scaling needs a shared store (Redis + Bucket4j) or an edge/WAF limiter.
- Client IP comes from `X-Forwarded-For` behind the proxies, so the limiter is a
  best-effort throttle, not an authentication control.
- CSP allows `'unsafe-inline'` because Next.js injects inline bootstrap scripts; a
  nonce-based CSP is the next step.

---

## 🛠 Tech Stack

**Backend** — Java 17, Spring Boot 3.2, Spring Security 6 (JWT + OAuth2 client),
Spring Data JPA, MySQL 8, Flyway, Actuator, OpenPDF, springdoc/OpenAPI, Maven wrapper.

**Frontend** — Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS +
shadcn/ui, react-hook-form + zod, native fetch.

**Testing / infra** — JUnit 5, Mockito, Testcontainers, JaCoCo, Vitest + Testing
Library, Docker + Compose, GitHub Actions, Render + Vercel.

---

## 🔗 Key API Endpoints

| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/api/v1/auth/register`, `/login` | Public (rate-limited) |
| POST | `/api/v1/auth/refresh`, `/logout` | Refresh cookie |
| GET | `/api/v1/auth/providers` | Public |
| GET | `/api/v1/books`, `/books/{id}` | Authenticated |
| POST/PUT/DELETE | `/api/v1/books`, `/books/{id}` | ADMIN, LIBRARIAN |
| POST | `/api/v1/issue`, `/return` | ADMIN, LIBRARIAN |
| GET | `/api/v1/transactions`, `/transactions/{id}/receipt` | ADMIN, LIBRARIAN |
| GET | `/actuator/health/liveness`, `/readiness` | Public |

Full contract in Swagger (`/swagger-ui.html`).

---

## 💻 Development

```bash
# DB + API in Docker, UI with hot reload
docker compose up -d db backend
cd frontend && pnpm install && pnpm dev          # http://localhost:3000

# Tests
cd backend && ./mvnw verify      # unit + integration + Testcontainers MySQL + coverage gate (needs Docker)
cd frontend && pnpm type-check && pnpm test:run
```

Env reference: [`.env.example`](.env.example) (compose) and
[`backend/.env.example`](backend/.env.example) (hosted). Load/Lighthouse harness: [`perf/`](perf/README.md).

---

## 📁 Project Structure

```
LibraFlow/
├── backend/     Spring Boot API (controller/service/repository/entity/dto/security/config)
│   └── src/main/resources/db/migration/   Flyway V1–V6
├── frontend/    Next.js app (app/ components/ hooks/ lib/ context/ __tests__/)
├── docs/        DEPLOYMENT.md
├── perf/        k6 load test + Lighthouse harness
├── .github/workflows/ci.yml
├── docker-compose.yml
└── render.yaml
```

---

## 👨‍💻 Author

**Pranjal Dubey** — B.Tech Computer Science, Sitare University

[![GitHub](https://img.shields.io/badge/GitHub-Iampranjaldubey-black?logo=github)](https://github.com/Iampranjaldubey)
