# Docker Setup Guide

## Overview

The project includes Docker configurations for both development and production environments.

## Development Setup

### Quick Start

The easiest way to start the development environment:

```bash
./dev.sh
```

This script:
1. Checks for Docker installation
2. Builds the development image
3. Starts all services
4. Initializes the database
5. Displays the application URL

### Docker Compose Development

**File**: `docker-compose.dev.yml`

#### Services

##### PostgreSQL Database
```yaml
postgres:
  image: postgres:15-alpine
  environment:
    - POSTGRES_USER=i7user
    - POSTGRES_PASSWORD=i7password
    - POSTGRES_DB=i7card
  ports:
    - "5432:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./sql:/docker-entrypoint-initdb.d
```

##### SvelteKit Application
```yaml
app:
  build:
    context: .
    dockerfile: Dockerfile.dev
  ports:
    - "5173:5173"
  environment:
    - DATABASE_URL=postgresql://i7user:i7password@postgres:5432/i7card
    - NODE_ENV=development
  volumes:
    - .:/app
    - /app/node_modules
  depends_on:
    - postgres
```

### Development Dockerfile

**File**: `Dockerfile.dev`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Expose development port
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

### Development Commands

```bash
# Start services
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f

# Stop services
docker compose -f docker-compose.dev.yml down

# Rebuild after dependency changes
docker compose -f docker-compose.dev.yml up -d --build

# Access PostgreSQL
docker exec -it i7-postgres psql -U i7user -d i7card

# Access application container
docker exec -it i7-app sh
```

## Production Setup

### Production Docker Compose

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - NODE_ENV=production
    restart: unless-stopped
```

### Production Dockerfile

**File**: `Dockerfile`

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/build ./build
COPY static ./static

EXPOSE 3000

CMD ["node", "build"]
```

### Production Deployment

```bash
# Build and start
docker compose up -d --build

# View logs
docker compose logs -f

# Update application
git pull
docker compose up -d --build

# Health check
curl http://localhost:3000/health
```

## Database Initialization

### Automatic Initialization

The development setup automatically initializes the database using SQL scripts in the `sql/` directory.

### Manual Initialization

```bash
# Initialize schema only
docker exec -i i7-postgres psql -U i7user -d i7card < sql/01-schema.sql
docker exec -i i7-postgres psql -U i7user -d i7card < sql/02-additional-tables.sql

# Initialize with data
./scripts/init-db-all.sh
```

## Volume Management

### Development Volumes
- `postgres_data`: PostgreSQL data persistence
- Application code: Mounted for hot reload
- `node_modules`: Separate volume to avoid conflicts

### Backup and Restore

```bash
# Backup database
docker exec i7-postgres pg_dump -U i7user i7card > backup.sql

# Restore database
docker exec -i i7-postgres psql -U i7user i7card < backup.sql

# Backup volumes
docker run --rm -v i7_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
lsof -i :5173
lsof -i :5432

# Change port in docker-compose.yml
ports:
  - "5174:5173"  # Different host port
```

#### Database Connection Issues
```bash
# Check PostgreSQL logs
docker compose -f docker-compose.dev.yml logs postgres

# Verify connection
docker exec i7-app npm run db:test
```

#### Permission Issues
```bash
# Fix ownership
sudo chown -R $USER:$USER .

# Reset volumes
docker compose -f docker-compose.dev.yml down -v
```

### Health Checks

Add health checks to services:

```yaml
healthcheck:
  test: ["CMD", "pg_isready", "-U", "i7user"]
  interval: 10s
  timeout: 5s
  retries: 5
```

## Best Practices

1. **Use specific image versions** instead of `latest`
2. **Set resource limits** for containers
3. **Use secrets** for sensitive data
4. **Implement health checks** for all services
5. **Use multi-stage builds** to reduce image size
6. **Mount only necessary files** in development
7. **Use `.dockerignore`** to exclude unnecessary files

## Security Considerations

1. Don't use default passwords in production
2. Use Docker secrets for sensitive data
3. Run containers as non-root user
4. Keep base images updated
5. Scan images for vulnerabilities
6. Use read-only filesystems where possible