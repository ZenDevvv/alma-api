# Heroku Docker Deployment Guide

This guide will help you deploy your Dockerized IMS API to Heroku.

## Prerequisites

1. Heroku CLI installed and logged in
2. Docker configured and running
3. Git repository initialized

## Step-by-Step Deployment

### 1. Login to Heroku

```bash
heroku login
```

### 2. Create a Heroku App

```bash
heroku create your-app-name
# Replace 'your-app-name' with your desired app name (must be unique)
```

### 3. Enable Heroku Container Registry

```bash
heroku container:login
```

### 4. Build and Push Docker Image

```bash
heroku container:push web
```

### 5. Release Your App

```bash
heroku container:release web
```

### 6. Configure Environment Variables

You'll need to set up environment variables in Heroku for your application:

```bash
# Database Configuration
heroku config:set DATABASE_URL="your-mongodb-connection-string"

# Redis Configuration
heroku config:set REDIS_URL="your-redis-connection-string"
heroku config:set REDIS_HOST="your-redis-host"

# JWT Secret
heroku config:set JWT_SECRET="your-jwt-secret"

# CORS Origins
heroku config:set CORS_ORIGINS="https://your-frontend-domain.com"

# Environment
heroku config:set NODE_ENV="production"

# Base API Path
heroku config:set BASE_API_PATH="/api"

# Port (automatically set by Heroku)
# Heroku sets PORT automatically, so don't manually set it
```

### 7. Add Heroku Postgres (Optional - for PostgreSQL)

If you want to use Heroku Postgres:

```bash
heroku addons:create heroku-postgresql:hobby-dev
```

This will automatically set the `DATABASE_URL` config var.

### 8. Open Your App

```bash
heroku open
```

Or visit: `https://your-app-name.herokuapp.com`

## Environment Variables Reference

Here's a template of all environment variables you might need:

```bash
# Core Configuration
NODE_ENV=production
PORT=3000
BASE_API_PATH=/api

# Database
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# Redis
REDIS_URL=redis://:password@host:6379
REDIS_HOST=your-redis-host
REDIS_PASSWORD=your-redis-password

# Security
JWT_SECRET=your-secret-key-here
CORS_ORIGINS=https://yourdomain.com
CORS_CREDENTIALS=true

# Logging (optional)
LOGTAIL_SOURCE_TOKEN=your-logtail-token

# API Keys (if applicable)
API_KEY=your-api-key
```

## Useful Heroku Commands

```bash
# View logs
heroku logs --tail

# Check app status
heroku ps

# Access shell
heroku run bash

# Restart app
heroku restart

# Scale dynos
heroku ps:scale web=1

# View config vars
heroku config

# Remove config var
heroku config:unset CONFIG_NAME

# Run one-off commands
heroku run npm run seed

# Deploy without pushing to Git
heroku container:push web && heroku container:release web
```

## Updating Your App

### To update your deployed app:

1. Make changes to your code
2. Build and push the new Docker image:

```bash
heroku container:push web
```

3. Release the update:

```bash
heroku container:release web
```

### Alternative: Using Git

If you prefer to use Heroku's buildpacks instead of Docker:

```bash
# Add Heroku as a remote
heroku git:remote -a your-app-name

# Deploy via Git
git push heroku main
```

Note: This requires a buildpack, not Docker.

## Troubleshooting

### Build Fails

```bash
# Check build logs
heroku logs --tail

# Check if all dependencies are in package.json
heroku run npm install

# Check environment variables
heroku config
```

### App Crashes

```bash
# View detailed logs
heroku logs --tail

# Check dyno status
heroku ps

# Restart the app
heroku restart

# Scale up if needed
heroku ps:scale web=2
```

### Database Connection Issues

```bash
# Verify database is attached
heroku addons

# Check database credentials
heroku config | grep DATABASE_URL

# Test connection
heroku run node -e "console.log(process.env.DATABASE_URL)"
```

## Monitoring and Maintenance

```bash
# View metrics
heroku ps:info

# Access database console
heroku run npm run prisma-studio

# Run database migrations
heroku run npx prisma migrate deploy

# Seed database
heroku run npm run prisma-seed
```

## Important Notes

1. **Port Configuration**: Heroku dynamically assigns a PORT. Don't hardcode port 3000. Your app should read from `process.env.PORT`.

2. **Dyno Hours**: Free tier has 550-1000 hours per month.

3. **Database Migrations**: Run migrations after deployment:

    ```bash
    heroku run npx prisma migrate deploy
    ```

4. **Asset Caching**: Static assets should be cached using appropriate headers.

5. **Security**: Always use strong secrets and enable HTTPS (Heroku provides this automatically).

## Health Checks

Your app includes a health check endpoint at `/health`. Heroku will automatically use this for monitoring:

```bash
curl https://your-app-name.herokuapp.com/health
```

## Complete Deployment Script

Here's a complete script to deploy:

```bash
#!/bin/bash

# Login
heroku login

# Create app (only if doesn't exist)
heroku create your-app-name

# Login to container registry
heroku container:login

# Push image
heroku container:push web

# Release
heroku container:release web

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set DATABASE_URL="your-connection-string"
heroku config:set REDIS_URL="your-redis-url"
heroku config:set JWT_SECRET="your-secret"

# Run migrations
heroku run npx prisma migrate deploy

# Open app
heroku open
```

## Next Steps

1. Set up a CI/CD pipeline (GitHub Actions, GitLab CI, etc.)
2. Configure custom domain
3. Set up monitoring and alerting
4. Implement backup strategies
5. Configure log aggregation

## Support

For issues, check:

- Heroku Dev Center: https://devcenter.heroku.com
- Heroku Support: https://help.heroku.com
- Your app logs: `heroku logs --tail`
