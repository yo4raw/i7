# Development Commands

## NPM Scripts

### Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Start development server on specific host/port
npm run dev -- --host 0.0.0.0 --port 3000
```

### Building and Production

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview

# Start production server
npm start
```

### Code Quality

```bash
# Run TypeScript type checking
npm run check

# Run linting
npm run lint

# Format code
npm run format
```

## Docker Commands

### Development Environment

```bash
# Quick start (recommended)
./dev.sh

# Manual Docker Compose
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f

# Stop services
docker compose -f docker-compose.dev.yml down
```

### Production Environment

```bash
# Start production services
docker compose up -d

# Build and start
docker compose up -d --build

# View logs
docker compose logs -f
```

## Database Commands

### Initialization

```bash
# Initialize database with schema
./scripts/init-db.sh

# Initialize with sample data
./scripts/init-db-all.sh
```

### Data Management

```bash
# Fetch data from Google Sheets
python scripts/fetch_sheets_data.py

# Fetch all sheets data
python scripts/fetch_all_sheets_data.py

# Import data from CSV
python scripts/import_all_data.py

# Clear database
python scripts/clear_database.py

# Verify imported data
python scripts/verify-import.py
```

### Database Access

```bash
# Connect to PostgreSQL (Docker)
docker exec -it i7-postgres psql -U i7user -d i7card

# Connect to PostgreSQL (Local)
psql -U i7user -d i7card
```

## Drizzle ORM Commands

```bash
# Generate migrations
npm run db:generate

# Push schema changes
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

## Useful Development Shortcuts

### Quick Restart

```bash
# Restart development server
docker compose -f docker-compose.dev.yml restart app

# Rebuild and restart
docker compose -f docker-compose.dev.yml up -d --build app
```

### Database Reset

```bash
# Complete database reset
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
./scripts/init-db-all.sh
```

### Logs and Debugging

```bash
# Follow app logs only
docker compose -f docker-compose.dev.yml logs -f app

# Follow database logs
docker compose -f docker-compose.dev.yml logs -f postgres

# Check container status
docker compose -f docker-compose.dev.yml ps
```