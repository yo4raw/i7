# Technology Stack

## Frontend

### SvelteKit
- **Version**: Latest
- **Purpose**: Full-stack web framework
- **Features Used**:
  - Server-side rendering (SSR)
  - File-based routing
  - Server-side data loading
  - TypeScript support

### TypeScript
- **Purpose**: Type safety and improved developer experience
- **Configuration**: Strict mode enabled
- **Usage**: Throughout the application

### Tailwind CSS
- **Purpose**: Utility-first CSS framework
- **Configuration**: Custom theme with project colors
- **PostCSS**: For processing Tailwind directives

## Backend

### Node.js
- **Version**: 18+
- **Purpose**: JavaScript runtime
- **Package Manager**: npm

### Database

#### PostgreSQL
- **Production**: Neon (Serverless PostgreSQL)
- **Development**: Local PostgreSQL or Docker
- **Version**: 15+
- **Schema**: Custom `i7card` schema

#### Drizzle ORM
- **Purpose**: Type-safe database queries
- **Features**:
  - Schema definition
  - Query building
  - Connection pooling
  - Migration support

## Development Tools

### Docker
- **Purpose**: Containerization and development environment
- **Services**:
  - PostgreSQL database
  - Node.js application
- **Docker Compose**: Multi-container orchestration

### Build Tools
- **Vite**: Fast build tool and dev server
- **ESBuild**: JavaScript bundling
- **PostCSS**: CSS processing

### Code Quality
- **ESLint**: JavaScript/TypeScript linting
- **Prettier**: Code formatting
- **TypeScript Compiler**: Type checking

## Deployment

### Hosting
- **Application**: Render.com
  - Automatic deployments from Git
  - Built-in SSL
  - Environment variable management

### Database Hosting
- **Neon**: Serverless PostgreSQL
  - Automatic scaling
  - Connection pooling
  - Point-in-time recovery

## External Services

### Data Sources
- **Google Sheets API**: Card data synchronization
- **Static Assets**: Card images stored locally

## Package Dependencies

### Core Dependencies
```json
{
  "@sveltejs/kit": "Latest SvelteKit framework",
  "drizzle-orm": "Database ORM",
  "postgres": "PostgreSQL client",
  "tailwindcss": "CSS framework",
  "typescript": "Type safety"
}
```

### Development Dependencies
```json
{
  "@sveltejs/adapter-node": "Node.js adapter for production",
  "@types/node": "Node.js type definitions",
  "autoprefixer": "CSS vendor prefixing",
  "postcss": "CSS processing",
  "vite": "Build tool"
}
```

## Architecture Decisions

### Why SvelteKit?
- Excellent performance with minimal JavaScript
- Built-in SSR for SEO
- Simple component model
- TypeScript support out of the box

### Why PostgreSQL?
- Robust relational data model
- Complex query support for score calculations
- JSONB support for flexible data
- Excellent performance at scale

### Why Drizzle ORM?
- Type-safe queries
- Lightweight and performant
- Good PostgreSQL support
- Simple migration system

### Why Docker?
- Consistent development environment
- Easy onboarding for new developers
- Production-like development
- Service isolation