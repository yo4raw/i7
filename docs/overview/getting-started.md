# Getting Started

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (optional, for containerized development)
- PostgreSQL (or use Docker)

## Quick Start

### 1. Clone the Repository

```bash
git clone [repository-url]
cd i7
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://i7user:i7password@localhost:5432/i7card?sslmode=disable
NODE_ENV=development
PORT=3000
```

### 4. Database Setup

#### Option A: Using Docker

```bash
# Start PostgreSQL container
docker compose -f docker-compose.dev.yml up -d postgres

# Initialize database
./scripts/init-db.sh
```

#### Option B: Using Local PostgreSQL

```bash
# Create database and schema
psql -U postgres -c "CREATE DATABASE i7card;"
psql -U postgres -d i7card < sql/01-schema.sql
psql -U postgres -d i7card < sql/02-additional-tables.sql
```

### 5. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Using Docker for Development

For a fully containerized development environment:

```bash
# Start all services
./dev.sh
# or
docker compose -f docker-compose.dev.yml up -d
```

This will start:
- PostgreSQL database
- SvelteKit development server with hot reload
- Automatic database initialization

## Next Steps

- Explore the [Development Commands](../development/commands.md)
- Learn about the [Project Structure](../architecture/project-structure.md)
- Review the [Database Schema](../database/schema.md)
- Check out the [API Documentation](../api/routes.md)