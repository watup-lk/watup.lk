# watup.lk

A monorepo containing multiple services for the watup.lk platform. This repository manages multiple sub-projects.

## Projects

This monorepo contains the following core services and applications:

- **watup-fe**: Frontend application.
- **identity-service**: Identity and authentication service.
- **vote-service**: Voting service.

## Project Structure

```text
watup.lk/
├── identity-service/    # Identity and authentication service
├── infra-db/            # Database initialization scripts and Docker config
├── proto/               # Protocol Buffers (gRPC definitions)
├── vote-service/        # Voting service
├── watup-fe/            # Frontend application
├── docker-compose.yml   # Multi-service container orchestration
├── package.json         # Node dependencies
└── README.md            # This file
```

## Getting Started

Use these commands from the root directory to manage all Watup.lk microservices (Frontend, Identity, Vote, etc.) simultaneously.

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

## Database

This project uses a containerized architecture to ensure a consistent development environment across the team. The core data layer is powered by PostgreSQL 16 (Alpine), managed via Docker.

We use a single database instance with multiple logical schemas to provide data isolation between microservices while maintaining a lightweight footprint for local development.

### Database Commands

| Action | Command | Description |
| --- | --- | --- |
| **Start DB** | `docker compose up -d postgres-db` | Starts the Postgres container in the background. |
| **Stop DB** | `docker compose stop postgres-db` | Gracefully stops the DB (preserves container state). |
| **Resume DB** | `docker compose start postgres-db` | Quickly starts the stopped DB container. |
| **Remove DB** | `docker compose down` | Stops and removes the container (data is safe). |
| **View Logs** | `docker compose logs -f postgres-db` | Follows the database logs in real-time. |

> [!IMPORTANT]
> **Initialization:** On the first run, Docker executes scripts in `./infra-db/init-scripts/` to create schemas (`vote_schema`, `identity_schema`, etc.). If you modify these scripts, you must run `docker compose down -v` to reset the database and trigger re-initialization.

## Contributing

When contributing to this monorepo, please ensure you:
1. Keep all repositories in sync.
2. Test changes across affected services.
3. Follow the established coding standards for each project.
