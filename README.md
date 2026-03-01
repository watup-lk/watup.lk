# watup.lk

A microservice-based salary transparency platform for Sri Lanka, built as a cloud-native application deployed on Azure Kubernetes Service (AKS). Users can anonymously submit salary data, search and filter entries, and vote on their trustworthiness.

## Projects

This monorepo contains the following core services and applications:

- **watup-fe**: Frontend application (Next.js) — UI for salary search, submission, and community voting.
- **identity-service**: Identity and authentication service (Go) — user signup/login, JWT tokens, gRPC token validation, Kafka event publishing, audit logging.
- **vote-service**: Voting service (Go) — upvote/downvote salary submissions, approval threshold.
- **infra-db**: PostgreSQL 16 with schema-per-service isolation (identity, salary, community schemas).

## Project Structure

```text
watup.lk/
├── identity-service/    # Identity and authentication service (Go)
├── infra-db/            # Database initialization scripts and Docker config
├── proto/               # Protocol Buffers (gRPC definitions)
├── vote-service/        # Voting service (Go)
├── watup-fe/            # Frontend application (Next.js)
├── docker-compose.yml   # Multi-service container orchestration
├── .env                 # Environment variables for docker-compose
├── package.json         # Node dependencies
└── README.md            # This file
```

## Getting Started

### Prerequisites

A `.env` file is required in the project root for docker-compose. It should contain:

```env
POSTGRES_USER=watup_user
POSTGRES_PASSWORD=watup_dev_password
POSTGRES_DB=watup_db
```

> [!NOTE]
> A `.env` file is included by default. Update the password before deploying to production.

### Service Management

```bash
# Start all services and the database in the background
docker compose up -d

# Rebuild images and start (Required after changing service code)
docker compose up -d --build

# Check the status of all containers
docker compose ps
```

### Stopping and Teardown

```bash
# Stop all services gracefully
docker compose stop

# Shut down all services (stops and removes containers)
docker compose down

# FULL RESET: Deletes all containers, networks, and LOCAL DATA
docker compose down -v
```

## Proto Definitions & Code Generation

All gRPC service definitions are stored in the root `proto/` directory. This ensures a single source of truth for service contracts across all microservices.

### Workflow

1. **Add/Update Protos**: Place your `.proto` files in the root `proto/` directory.
2. **Generate Code**: Navigate to the specific service directory (e.g., `vote-service`) and run the code generation command.

## Database

This project uses a containerized architecture to ensure a consistent development environment across the team. The core data layer is powered by PostgreSQL 16 (Alpine), managed via Docker.

We use a single database instance with multiple logical schemas to provide data isolation between microservices while maintaining a lightweight footprint for local development.

### Database Commands

| Action | Command | Description |
| --- | --- | --- |
| **Start DB** | `docker compose up -d postgres-db` | Starts the Postgres container in the background. |
| **Stop DB** | `docker compose stop postgres-db` | Gracefully stops the DB (preserves container state). |
| **Resume DB** | `docker compose start postgres-db` | Quickly starts the stopped DB container. |
| **Remove DB** | `docker compose down postgres-db` | Stops and removes the container (data is safe). |
| **View Logs** | `docker compose logs -f postgres-db` | Follows the database logs in real-time. |

> [!IMPORTANT]
> **Initialization:** On the first run, Docker executes scripts in `./infra-db/init-scripts/` to create schemas (`identity_schema`, `salary_schema`, `community_schema`). If you modify these scripts, you must run `docker compose down -v` to reset the database and trigger re-initialization.

## Kafka Event Bus

Microservices communicate asynchronously via Apache Kafka (KRaft mode — no ZooKeeper). The following topics are used:

| Topic | Producer | Description |
|-------|----------|-------------|
| `user.registered` | identity-service | Published when a new user signs up |
| `user.login` | identity-service | Published on each successful login |
| `user.logout` | identity-service | Published when a user logs out |
| `user.token_refresh` | identity-service | Published on token refresh |
| `threshold-reached` | vote-service | Published when a submission reaches the approval threshold |

Kafka UI is available at `http://localhost:8086` when running with docker-compose.

## Contributing

When contributing to this monorepo, please ensure you:
1. Keep all repositories in sync.
2. Test changes across affected services.
3. Follow the established coding standards for each project.
