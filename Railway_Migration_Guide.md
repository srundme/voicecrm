# VoiceCRM — Railway Migration Guide

> Step-by-step guide to migrate VoiceCRM from Replit to Railway.app for fully independent, 24/7 hosting.

---

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Export Database from Replit](#step-1-export-database-from-replit)
4. [Step 2: Create Railway Project](#step-2-create-railway-project)
5. [Step 3: Add PostgreSQL Database](#step-3-add-postgresql-database)
6. [Step 4: Import Database to Railway](#step-4-import-database-to-railway)
7. [Step 5: Configure Environment Variables](#step-5-configure-environment-variables)
8. [Step 6: Reorganize for Single-Service Deploy](#step-6-reorganize-for-single-service-deploy)
9. [Step 7: Configure the Build Process](#step-7-configure-the-build-process)
10. [Step 8: Deploy to Railway](#step-8-deploy-to-railway)
11. [Step 9: Verify & Update Webhook URLs](#step-9-verify--update-webhook-urls)
12. [Key Code Changes](#key-code-changes)
13. [Troubleshooting](#troubleshooting)

---

## Overview

This app is a **pnpm monorepo** with:
- `artifacts/web` — React + Vite frontend
- `artifacts/api-server` — Express + Drizzle ORM backend
- `lib/db` — Shared database schema

On Railway, we deploy it as a **single Node.js service** that:
1. Builds the React frontend as static files
2. Runs the Express API server
3. Serves static frontend files from the Express server
4. Uses Railway's managed PostgreSQL

---

## Prerequisites

- Railway account (free tier available)
- GitHub account (for pushing code)
- Railway CLI installed (`npm install -g @railway/cli`)

---

## Step 1: Export Database from Replit

### Option A: Using pg_dump

```bash
# In Replit shell
pg_dump --no-owner --no-acl \
  --format=custom \
  --file=voicecrm-backup.dump \
  "$DATABASE_URL"
```

### Option B: Using plain SQL

```bash
pg_dump --no-owner --no-acl \
  --format=plain \
  --file=voicecrm-backup.sql \
  "$DATABASE_URL"
```

### Download the backup

```bash
# The file will be in the project root
# Download via Replit file explorer or:
# In a new terminal on your local machine:
scp replit-user@your-replit-domain:~/voicecrm-backup.dump .
```

---

## Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app) and sign up
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub account and select the VoiceCRM repo
4. Railway creates the project with one service

---

## Step 3: Add PostgreSQL Database

### Via Railway Dashboard
1. In your Railway project, click "New" → "Database" → "Add PostgreSQL"
2. Railway automatically creates a PostgreSQL instance
3. Click the PostgreSQL service → "Variables" tab
4. Copy the `DATABASE_URL` value (starts with `postgresql://`)

### Via Railway CLI

```bash
railway login
railway link  # Select your VoiceCRM project
railway add --database
```

**Note:** Keep the `DATABASE_URL` value — you'll need it in Step 5.

---

## Step 4: Import Database to Railway

### Restore the dump

```bash
# On your local machine (or Railway shell)
# First, get the Railway DATABASE_URL from the dashboard
export RAILWAY_DB="postgresql://..."

# Restore the dump
pg_restore --no-owner --no-acl --clean \
  --dbname="$RAILWAY_DB" \
  voicecrm-backup.dump

# Or for SQL:
# psql "$RAILWAY_DB" < voicecrm-backup.sql
```

**Note:** If `pg_restore` fails due to existing tables, add `--clean` flag.

---

## Step 5: Configure Environment Variables

In Railway Dashboard, go to your service → "Variables" tab, and add:

| Variable | Value | How to get |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Railway auto-provides from PostgreSQL service |
| `PORT` | `8080` | Hardcoded (Railway sets its own `PORT` but we use 8080 for consistency) |
| `NODE_ENV` | `production` | |
| `LOG_LEVEL` | `info` | |

### API Keys (from your Replit Settings)

| Variable | Value | Source |
|---|---|---|
| `BOLNA_API_KEY` | Your Bolna key | Replit Settings page |
| `BOLNA_BASE_URL` | `https://api.bolna.ai` | (optional, defaults to this) |
| `BREVO_API_KEY` | Your Brevo key | Replit Settings page |
| `BREVO_SENDER_NAME` | `VoiceCRM` | Replit Settings page |
| `META_ADS_ACCESS_TOKEN` | Your Meta token | Replit Settings page |
| `META_ADS_ACCOUNT_ID` | Your Meta account ID | Replit Settings page |

### Secrets (read from database after import, or set new)

| Variable | Value | Notes |
|---|---|---|
| `WEBHOOK_SECRET` | Copy from Replit DB | `SELECT webhook_secret FROM api_config` |
| `CONTEXT_API_BEARER_TOKEN` | Copy from Replit DB | `SELECT context_api_bearer_token FROM api_config` |

**Important:** If you set `WEBHOOK_SECRET` and `CONTEXT_API_BEARER_TOKEN` as new random values, you must update the webhook URLs in Bolna and Meta after deployment.

---

## Step 6: Reorganize for Single-Service Deploy

Railway deploys one Node.js service. We need to restructure so the backend can also serve the built frontend.

### Create the restructured entry point

Create a new file at the project root: `railway-server.js`

```javascript
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a minimal express server for Railway
const app = express();

// Import your API routes
// Note: We'll need to build the backend first
const rawPort = process.env["PORT"];
const port = Number(rawPort) || 8080;

// Serve static frontend from /dist
app.use(express.static(path.join(__dirname, 'artifacts/web/dist')));

// API routes will be added below
// For now, a health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: 'production' });
});

// Fallback to index.html for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'artifacts/web/dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

### Better approach: Use the existing app.ts

Instead of a new server file, modify the existing app to serve static files:

**File: `artifacts/api-server/src/app.ts`** (add after line 32)

```typescript
// Serve static frontend files in production
if (process.env.NODE_ENV === "production") {
  const staticPath = path.resolve(process.cwd(), "../../artifacts/web/dist");
  app.use(express.static(staticPath));
  // Fallback to index.html for React Router
  app.use((req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}
```

Add import at the top:
```typescript
import path from "node:path";
```

---

## Step 7: Configure the Build Process

### Create `package.json` at the root for Railway

Create `/package.json` (this will replace the existing one for Railway deploy):

```json
{
  "name": "voicecrm",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "npm run build:frontend && npm run build:backend",
    "build:frontend": "cd artifacts/web && npm install && npm run build",
    "build:backend": "cd artifacts/api-server && npm install && npm run build",
    "start": "cd artifacts/api-server && npm run start"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Create `railway.json` (for Railway configuration)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 300,
    "restartPolicy": "ON_FAILURE"
  }
}
```

### Alternative: Use `Procfile` (simpler)

Create a `Procfile` at the project root:

```
web: cd artifacts/api-server && npm run start
```

And create a `build.sh` script:

```bash
#!/bin/bash
set -e

# Build frontend
cd artifacts/web
npm install
npm run build

# Build backend  
cd ../api-server
npm install
npm run build

echo "Build complete"
```

Make it executable:
```bash
chmod +x build.sh
```

---

## Step 8: Deploy to Railway

### Option A: GitHub Integration (Recommended)

1. Push code to GitHub
2. In Railway Dashboard, click "New Project" → "Deploy from GitHub repo"
3. Select your repo
4. Railway auto-detects the Node.js app and deploys

### Option B: Railway CLI

```bash
# Login to Railway
railway login

# Link to project
railway link

# Deploy
railway up
```

### Option C: Manual Upload

```bash
# In Railway Dashboard
# Click "New" → "Upload Code"
# Upload a ZIP of the entire project (excluding node_modules)
```

### Build settings in Railway Dashboard

1. Go to your service → "Settings"
2. Set "Build Command" to: `npm run build`
3. Set "Start Command" to: `cd artifacts/api-server && npm run start`
4. Set "Root Directory" to: `/` (project root)
5. Click "Deploy"

---

## Step 9: Verify & Update Webhook URLs

### 1. Get your Railway domain

After deployment, Railway assigns a domain:
```
https://voicecrm-production-12345.up.railway.app
```

Copy this from the Railway Dashboard → your service → "Settings" → "Public Domain".

### 2. Update the base URL in the database

The `publicBaseUrl()` function reads `REPLIT_DEV_DOMAIN` which won't exist on Railway. We need to change it.

**Update `artifacts/api-server/src/lib/org.ts`:**

```typescript
export function publicBaseUrl(): string {
  // Railway provides RAILWAY_STATIC_URL or RAILWAY_PUBLIC_DOMAIN
  const railwayDomain = process.env["RAILWAY_STATIC_URL"] ||
                       process.env["RAILWAY_PUBLIC_DOMAIN"] ||
                       process.env["RAILWAY_DOMAIN"];
  if (railwayDomain) return `https://${railwayDomain}`;
  
  // Fallback for dev
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  
  return "";
}
```

**Or better: set a custom env var:**

In Railway, add environment variable:
```
APP_BASE_URL = https://voicecrm-production-12345.up.railway.app
```

Then update `publicBaseUrl()`:
```typescript
export function publicBaseUrl(): string {
  const appBase = process.env["APP_BASE_URL"];
  if (appBase) return appBase;
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  return "";
}
```

### 3. Update webhook URLs in external services

| Service | Old URL (Replit) | New URL (Railway) |
|---|---|---|
| **Bolna webhook** | `https://...replit.dev/api/webhooks/bolna` | `https://<railway-domain>/api/webhooks/bolna` |
| **Meta webhook** | `https://...replit.dev/api/webhooks/meta` | `https://<railway-domain>/api/webhooks/meta` |
| **Website form** | `https://...replit.dev/api/webhooks/website-form?secret=...` | `https://<railway-domain>/api/webhooks/website-form?secret=...` |

### 4. Update `BASE_URL` in frontend

The frontend currently uses `import.meta.env.BASE_URL` for API calls. In Railway, the API and frontend share the same domain, so:

```
// Before (Replit):
fetch(`${import.meta.env.BASE_URL}api/leads`)
// = fetch(`https://...replit.dev/api/leads`)

// After (Railway):
fetch(`${import.meta.env.BASE_URL}api/leads`)
// = fetch(`/api/leads`)  // same domain
```

**If frontend and backend are separate services**, you need to set the API base URL in the frontend:

Create a `.env.production` file in `artifacts/web/`:
```
VITE_API_BASE_URL=https://your-railway-domain.com
```

Then update the frontend code to use:
```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.BASE_URL;
fetch(`${API_BASE}api/leads`)
```

---

## Key Code Changes

### 1. Frontend: Remove hardcoded Replit references

**File: `artifacts/web/src/pages/settings.tsx`**

```typescript
// Remove or update this to show the Railway domain
const urlField = (label: string, url: string) => (
  <div className="flex flex-col space-y-1">
    <label className="text-sm font-medium text-muted-foreground">{label}</label>
    <code className="text-xs bg-muted p-2 rounded break-all">{url}</code>
  </div>
);
```

### 2. Backend: Environment-aware domain

**File: `artifacts/api-server/src/lib/org.ts`**

```typescript
export function publicBaseUrl(): string {
  const appBase = process.env["APP_BASE_URL"];
  if (appBase) return appBase;
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  return "";
}
```

### 3. Backend: Add health check endpoint

The existing `/api/health` endpoint is already there (check `artifacts/api-server/src/routes/index.ts`).

### 4. Frontend: Configure `BASE_URL` in Vite

**File: `artifacts/web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',  // Railway uses root path
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
```

### 5. Add `railway.json` (or `nixpacks.toml`)

**File: `nixpacks.toml`** (if Railway auto-detects fails)

```toml
[phases.build]
cmds = [
  "cd artifacts/web && npm install && npm run build",
  "cd artifacts/api-server && npm install && npm run build"
]

[phases.setup]
nixPkgs = ["nodejs_20", "postgresql"]

[start]
cmd = "cd artifacts/api-server && npm run start"
```

---

## Troubleshooting

### "Cannot find module" errors

Railway doesn't preserve the pnpm workspace. Install dependencies in each sub-package:

```json
// In package.json scripts
"build": "cd artifacts/web && npm install && npm run build && cd ../api-server && npm install && npm run build"
```

### Database connection fails

1. Check Railway PostgreSQL → "Variables" tab
2. Copy `DATABASE_URL` exactly (it includes `?sslmode=require`)
3. Ensure `pg` is in dependencies (it already is in `lib/db/package.json`)

### Static files not served

The `express.static()` path must be correct relative to the working directory:

```typescript
// In app.ts
const staticPath = path.resolve(
  process.cwd(),
  process.env.NODE_ENV === "production" 
    ? "artifacts/web/dist" 
    : "../../artifacts/web/dist"
);
```

### CORS issues

Since both frontend and backend are served from the same domain on Railway, CORS is not needed. But keep it in the Express app for safety:

```typescript
app.use(cors({
  origin: process.env.NODE_ENV === "production" 
    ? process.env["APP_BASE_URL"] || "*"
    : "*"
}));
```

### "Module not found" for workspace packages

The Railway build needs to compile all workspace packages. Add this to build steps:

```bash
# Build lib packages first
npm install -g pnpm
pnpm install
pnpm run build
```

Or create a flat `package.json` without workspace references:

```json
{
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "drizzle-zod": "^0.8.3",
    "pg": "^8.20.0",
    "express": "^5.2.1",
    "cors": "^2.8.6",
    "pino": "^9.14.0",
    "pino-http": "^10.5.0",
    "zod": "^3.25.76",
    ... // all other dependencies
  }
}
```

### Alternative: Deploy as separate services

If you prefer separate frontend and backend:

**Frontend service (static site):**
```
Build: cd artifacts/web && npm install && npm run build
Start: serve -s dist (or use railway's static site)
```

**Backend service (Node.js):**
```
Build: cd artifacts/api-server && npm install && npm run build
Start: cd artifacts/api-server && npm run start
```

**Note:** If separated, you need to set `CORS_ORIGIN` to allow the frontend domain.

---

## Quick Reference: Environment Variables

```
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
PORT=8080
NODE_ENV=production

# API Keys
BOLNA_API_KEY=your_bolna_key
BOLNA_BASE_URL=https://api.bolna.ai
BREVO_API_KEY=your_brevo_key
BREVO_SENDER_NAME=VoiceCRM
META_ADS_ACCESS_TOKEN=your_meta_token
META_ADS_ACCOUNT_ID=your_meta_account

# Secrets (copy from Replit DB or generate new)
WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CONTEXT_API_BEARER_TOKEN=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy

# Custom
APP_BASE_URL=https://your-railway-domain.up.railway.app
LOG_LEVEL=info
```

---

## Performance Notes

- Railway free tier includes **500 hours** of runtime per month (good for testing)
- Railway Hobby tier (≈$5/month) includes **24/7 runtime** with no sleep
- Railway PostgreSQL is managed and auto-backed up
- Use Railway's **Health Checks** to ensure your service stays running
- Set up **Railway Alerts** for database connection issues

---

## Backup Plan

1. **Keep the Replit project** as a backup while you migrate
2. **Export the database** periodically from Railway:
   ```bash
   pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
   ```
3. **Test webhooks** after migration with a test lead

---

## Next Steps After Migration

1. Verify all pages load correctly
2. Test a manual lead creation
3. Test a test call via the Agents page
4. Test Meta webhook with a test lead
5. Test the Bolna completion webhook
6. Verify the dashboard trends chart loads
7. Check the live-feed SSE stream works

---

## Migration Checklist

- [ ] Export database from Replit
- [ ] Create Railway project
- [ ] Add PostgreSQL database
- [ ] Import database
- [ ] Set all environment variables
- [ ] Update `publicBaseUrl()` in `org.ts`
- [ ] Add `APP_BASE_URL` environment variable
- [ ] Configure build process
- [ ] Deploy
- [ ] Update webhook URLs in Bolna dashboard
- [ ] Update webhook URLs in Meta Business Manager
- [ ] Test all functionality
- [ ] Set up Railway domain (custom domain optional)
- [ ] Configure Railway health checks
- [ ] Set up monitoring/alerts

---

> Need help? Railway has excellent docs at [docs.railway.app](https://docs.railway.app) and a Discord community.
