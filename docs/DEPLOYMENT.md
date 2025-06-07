# Deployment Setup

This application uses GitHub Actions for CI/CD and deploys to Render. Environment variables are managed through GitHub Repository Secrets.

## GitHub Repository Secrets Setup

You need to set the following secrets in your GitHub repository:

1. **DATABASE_URL**: Your Neon PostgreSQL connection string
   - Example: `postgresql://user:password@host/database?sslmode=require`

2. **RENDER_API_KEY**: Your Render API key
   - Get it from: https://dashboard.render.com/account/api-keys

3. **RENDER_SERVICE_ID**: Your Render service ID
   - Find it in your Render service URL: `https://dashboard.render.com/web/srv-XXXXX`
   - The service ID is the `srv-XXXXX` part

## Setting Up Secrets

1. Go to your GitHub repository
2. Click on "Settings" → "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Add each secret with its corresponding value

## Render Configuration

The application will automatically deploy to Render when you push to the main branch.

Environment variables on Render:
- `DATABASE_URL`: Will be synced from GitHub Actions during build
- `NODE_ENV`: Set to "production"

## Local Development

For local development, create a `.env` file in the project root:

```
DATABASE_URL=your_database_url_here
```

This file is already in `.gitignore` and won't be committed to the repository.