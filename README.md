# watup.lk

A microservice-based salary transparency platform for Sri Lanka, built as a cloud-native application deployed on Azure Kubernetes Service (AKS). Users can anonymously submit salary data, search and filter entries, vote on their trustworthiness, and explore salary analytics.

## Services

| Service              | Language             | Responsibility                                                                       |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| **watup-frontend**   | Next.js 14           | UI — search, submit, vote, analytics                                                 |
| **bff**              | Node.js / TypeScript | API gateway — single entry point for the frontend, auth enforcement, request routing |
| **identity-service** | Go                   | User signup/login, JWT tokens, gRPC token validation, Kafka audit events             |
| **search-service**   | Node.js / TypeScript | Filtered salary lookup against `salary_schema`                                       |
| **stats-service**    | Node.js / TypeScript | Aggregated salary insights — medians, percentiles, trends, experience breakdown      |
| **salary-service**   | NestJS / TypeScript  | Salary submission creation                                                           |
| **vote-service**     | Go                   | Upvote/downvote submissions, approval threshold via Kafka                            |
| **infra-db**         | PostgreSQL 16        | Single DB with schema-per-service isolation                                          |

## Project Structure

```text
watup.lk/
├── watup-frontend/      # Next.js frontend
├── bff/                 # Backend-for-Frontend (Express proxy + auth)
├── identity-service/    # Auth microservice (Go)
├── search-service/      # Salary search microservice (Node.js)
├── stats-service/       # Salary stats microservice (Node.js)
├── salary-service/      # Salary submission microservice (NestJS)
├── vote-service/        # Voting microservice (Go)
├── infra-db/            # PostgreSQL init scripts and Dockerfile
├── proto/               # Shared protobuf definitions (gRPC)
├── docker-compose.yml   # Full local stack orchestration
├── .env                 # Backend environment variables (not committed)
└── README.md
```

## Getting Started

### Prerequisites

- Docker Desktop (running)
- Node.js 20+ (for the frontend only)

### 1. Create the `.env` file

Create `.env` in the project root:

```env
POSTGRES_USER=watup_user
POSTGRES_PASSWORD=watup_dev_password
POSTGRES_DB=watup_db
```

### 2. Create the frontend `.env.local` file

Create `watup-frontend/.env.local`:

```env
NEXT_PUBLIC_BFF_URL=http://localhost:8080
```

### 3. Start all backend services

```bash
docker compose up -d --build
```

### 4. Start the frontend

```bash
cd watup-frontend
npm install
npm run dev
```

The app is now available at **http://localhost:3000**.

## Local Service Ports

| Service            | Host Port | Notes                                         |
| ------------------ | --------- | --------------------------------------------- |
| Frontend (Next.js) | 3000      | Started separately via `npm run dev`          |
| BFF (API gateway)  | 8080      | Single entry point for all frontend API calls |
| Identity Service   | 8081      | HTTP; also 50052 (gRPC), 9090 (metrics)       |
| Salary Service     | 8082      | Swagger docs at `/api/docs`                   |
| Search Service     | 8083      |                                               |
| Stats Service      | 8084      |                                               |
| Vote Service       | 8087      | HTTP; also 8085 (gRPC)                        |
| Kafka UI           | 8086      | Browse topics and messages                    |
| PostgreSQL         | 5432      | User: `watup_user`, DB: `watup_db`            |

## Common Commands

```bash
# Start all backend services (rebuild after code changes)
docker compose up -d --build

# Start a single service only
docker compose up -d --build stats-service

# Check status of all containers
docker compose ps

# View logs for a specific service (live)
docker compose logs -f stats-service

# Stop all services
docker compose down

# Full reset — removes all containers and database data
docker compose down -v
```

## Database

Single PostgreSQL 16 instance with three logical schemas:

| Schema             | Owner Service                                 | Tables                                                           |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------- |
| `identity_schema`  | identity-service                              | `users`, `refresh_tokens`, `audit_logs`, `password_reset_tokens` |
| `salary_schema`    | salary-service, search-service, stats-service | `submissions` (PENDING → APPROVED → REJECTED)                    |
| `community_schema` | vote-service                                  | `votes`, `submission_vote_counts`                                |

Connect with any PostgreSQL client using host `localhost`, port `5432`, user `watup_user`, password `watup_dev_password`, database `watup_db`.

Run a query directly:

```bash
docker exec watup-db psql -U watup_user -d watup_db -c "SELECT role, company, salary_amount, status FROM salary_schema.submissions;"
```

> [!IMPORTANT]
> On first run, Docker executes scripts in `./infra-db/init-scripts/` to create all schemas and seed data. If you modify these scripts, run `docker compose down -v` to trigger re-initialisation.

## Kafka Event Bus

Kafka runs in KRaft mode (no ZooKeeper). Topics:

| Topic                | Producer         | Description                                   |
| -------------------- | ---------------- | --------------------------------------------- |
| `user.registered`    | identity-service | Published on new user signup                  |
| `user.login`         | identity-service | Published on successful login                 |
| `user.logout`        | identity-service | Published on logout                           |
| `user.token_refresh` | identity-service | Published on token refresh                    |
| `threshold-reached`  | vote-service     | Published when a submission reaches 5 upvotes |

Kafka UI: **http://localhost:8086**

## Authentication

- **No login required:** Browse salaries, search, submit a salary, view analytics
- **Login required:** Upvote/downvote, dashboard, admin panel

Tokens issued by identity-service: 15-minute access token + 7-day refresh token. The BFF validates every protected request before forwarding it downstream.

## Proto Definitions

All gRPC service definitions live in the root `proto/` directory. To regenerate Go code after modifying a `.proto` file, navigate to the relevant service directory and run its `make proto` command (identity-service) or equivalent.
