# Production Deployment

## Overview

The application is deployed on Render with a Neon PostgreSQL database.

## Render Deployment

### Prerequisites

- Render account
- GitHub repository connected
- Environment variables configured

### Deployment Steps

1. **Create New Web Service**
   - Connect GitHub repository
   - Choose branch to deploy (usually `main`)
   - Select Node environment

2. **Configure Build Settings**
   ```yaml
   Build Command: npm install && npm run build
   Start Command: npm start
   ```

3. **Set Environment Variables**
   - `DATABASE_URL` - Neon connection string
   - `NODE_ENV` - production
   - `PORT` - (optional, Render provides)

4. **Deploy**
   - Automatic deploys on push to main
   - Manual deploy from dashboard

### Health Checks

Add health check endpoint:
```javascript
// src/routes/health/+server.ts
export async function GET() {
  return new Response('OK', { status: 200 });
}
```

## Neon Database Setup

### Create Database

1. Sign up for Neon account
2. Create new project
3. Copy connection string

### Database Migration

```bash
# Run migrations
npm run db:push

# Verify schema
npm run db:studio
```

### Connection Pooling

Neon provides built-in connection pooling. Use the pooled connection string for better performance.

## Environment Variables

### Required Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Node
NODE_ENV=production

# Optional
PORT=3000
```

### Security

- Never commit `.env` files
- Use Render's environment variable UI
- Rotate credentials regularly

## Monitoring

### Render Dashboard

- Service metrics
- Deploy history
- Logs viewer
- Resource usage

### Application Monitoring

```javascript
// Basic request logging
console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
```

### Error Tracking

Consider adding:
- Sentry for error tracking
- LogDNA for log aggregation
- UptimeRobot for availability

## Performance Optimization

### Build Optimization

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['svelte', '@sveltejs/kit'],
        }
      }
    }
  }
}
```

### Caching Strategy

```javascript
// Static assets
response.headers.set('Cache-Control', 'public, max-age=31536000');

// API responses
response.headers.set('Cache-Control', 'public, max-age=300');
```

### Image Optimization

- Use WebP format
- Implement lazy loading
- Serve from CDN

## Deployment Checklist

- [ ] Environment variables set
- [ ] Database migrated
- [ ] Build succeeds locally
- [ ] Health check endpoint added
- [ ] Error pages customized
- [ ] SSL certificate active
- [ ] Domain configured
- [ ] Monitoring set up

## Rollback Strategy

### Render Rollback

1. Go to deploy history
2. Select previous deploy
3. Click "Rollback"

### Database Rollback

```bash
# Create backup before deploy
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore if needed
psql $DATABASE_URL < backup_20240106_120000.sql
```

## Scaling

### Horizontal Scaling

- Render automatically handles multiple instances
- Ensure stateless application design
- Use database for session storage

### Database Scaling

- Neon auto-scales compute
- Monitor connection pool usage
- Consider read replicas for heavy loads

## Maintenance

### Scheduled Maintenance

1. Enable maintenance mode
2. Run database migrations
3. Deploy new version
4. Verify functionality
5. Disable maintenance mode

### Zero-Downtime Deploys

Render provides zero-downtime deploys by default:
1. New version builds
2. Health check passes
3. Traffic switches to new version
4. Old version terminated

## Troubleshooting

### Common Issues

#### Build Failures
- Check Node version
- Verify dependencies
- Review build logs

#### Database Connection
- Verify connection string
- Check SSL requirements
- Monitor connection limits

#### Performance Issues
- Review query performance
- Check memory usage
- Analyze slow endpoints

### Debug Mode

```javascript
// Enable verbose logging
if (process.env.DEBUG) {
  console.log('Debug info:', data);
}
```