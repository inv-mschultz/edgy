# Edgy Server

Backend server for the Edgy Figma plugin. Handles analysis, LLM review, screen generation, and deployment.

## Overview

The Edgy server is a **Hono-based API server** deployed on Vercel that replaces the original GitHub Actions-based approach. This new architecture provides:

- **Real-time progress updates** via Server-Sent Events (SSE)
- **Persistent job tracking** with Postgres database
- **Secure credential management** with encryption
- **Direct API communication** instead of file-based polling
- **Better scalability** and error handling

### Migration from GitHub Actions

**Previous Approach (GitHub Actions):**
- Plugin writes `input.json` to GitHub repository
- GitHub Action triggers on file push
- Action runs analysis and writes `output.json`
- Plugin polls GitHub API for results

**New Approach (Server API):**
- Plugin sends POST request to `/api/v1/analyze`
- Server streams progress via SSE
- Results stored in database and streamed back
- No file I/O or polling required

## Architecture

```
server/
├── src/
│   ├── index.ts              # Hono app entry point
│   ├── routes/               # API endpoints
│   │   ├── analyze.ts        # POST /analyze - Start analysis job
│   │   ├── deploy.ts         # POST /deploy - Deploy prototype
│   │   ├── credentials.ts    # Credential management
│   │   └── jobs.ts           # Job history
│   ├── services/             # Business logic
│   │   ├── pipeline.ts       # Full analysis pipeline
│   │   ├── analyzer.ts       # Pattern detection & findings
│   │   ├── llm-reviewer.ts   # Claude/Gemini review
│   │   ├── screen-generator.ts # AI screen generation
│   │   └── deployer.ts       # Vercel deployment
│   ├── db/                   # Database layer
│   │   ├── schema.ts         # Drizzle schema
│   │   ├── client.ts         # Postgres client
│   │   ├── users.ts          # User queries
│   │   ├── credentials.ts    # Encrypted credential storage
│   │   └── jobs.ts           # Job persistence
│   ├── middleware/
│   │   └── auth.ts           # API key validation
│   └── lib/                  # Utilities
│       ├── types.ts          # Shared types
│       ├── sse.ts            # Server-sent events
│       ├── llm.ts            # Claude/Gemini client
│       ├── crypto.ts         # Credential encryption
│       └── knowledge.ts      # Knowledge base loader
└── drizzle.config.ts         # Drizzle ORM config
```

## Key Features

### 1. Server-Sent Events (SSE) Streaming

The server uses SSE to stream real-time progress updates during analysis:

```typescript
// Client connects to POST /api/v1/analyze
// Server streams events:
event: progress
data: {"stage": "patterns", "message": "Analyzing screens...", "progress": 0.3}

event: progress
data: {"stage": "llm-review", "message": "Reviewing with Claude...", "progress": 0.6}

event: complete
data: {"analysis": {...}, "generated_layouts": {...}, "prototype_url": "..."}
```

### 2. Database Persistence

All analysis jobs are stored in Postgres:
- Job status tracking (`pending`, `processing`, `complete`, `error`)
- Results persistence for later retrieval
- Job history per user
- Support for reconnection if SSE stream drops

### 3. Encrypted Credential Storage

API keys (Anthropic, Gemini, Vercel) are encrypted at rest:
- Uses AES-256 encryption
- Encryption key stored in environment variable
- Credentials never exposed in logs or responses

### 4. Authentication

API key-based authentication:
- Each user has a unique API key
- Keys validated on protected endpoints
- Stored in `users` table

## Architecture Flow

```
┌─────────────┐
│ Figma Plugin│
└──────┬──────┘
       │ POST /api/v1/analyze
       │ Headers: X-API-Key: xxx
       │ Body: { screens, design_tokens, ... }
       ▼
┌─────────────────────────────────────┐
│         Edgy Server (Hono)          │
│                                     │
│  1. Validate API key                │
│  2. Create job in database          │
│  3. Start SSE stream                │
│  4. Run analysis pipeline:          │
│     ├─ Pattern detection            │
│     ├─ LLM review (optional)        │
│     ├─ Screen generation (optional) │
│     └─ Deploy to Vercel (optional)  │
│  5. Stream progress updates         │
│  6. Save results to database        │
│  7. Send complete event             │
└─────────────────────────────────────┘
       │
       │ SSE Events:
       │ - progress
       │ - complete
       │ - error
       ▼
┌─────────────┐
│ Figma Plugin│
│ (receives   │
│  results)   │
└─────────────┘
```

## Setup

### Prerequisites

- Node.js 20+
- Vercel CLI (`npm i -g vercel`)
- Vercel Postgres database (or any Postgres instance)

### Environment Variables

Create a `.env` file in the `server/` directory:

```bash
# Database connection (from Vercel Postgres dashboard)
POSTGRES_URL="postgres://user:password@host:port/database"

# Encryption key for credential storage
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY="64-character-hex-string"

# Optional: Port for local development
PORT=3000
```

### Installation

```bash
cd server
npm install
```

### Database Setup

1. **Create Postgres database** (Vercel Postgres recommended):
   - Go to Vercel dashboard → Storage → Create Database → Postgres
   - Copy the connection string to `POSTGRES_URL`

2. **Push schema to database**:
   ```bash
   npm run db:push
   ```

   This creates the following tables:
   - `users` - User accounts and API keys
   - `jobs` - Analysis job tracking
   - `credentials` - Encrypted API credentials

### Development

```bash
# Start local development server
npm run dev
```

The server will run at `http://localhost:3000` (or the port specified in `PORT`).

**Note:** Local development uses `@hono/node-server` for the HTTP server. In production on Vercel, the serverless function handler is used.

### Deployment

The server deploys automatically to Vercel when you push to the main branch.

**Manual deployment:**
```bash
vercel deploy
```

**Environment variables:**
Set environment variables in Vercel dashboard:
- Project → Settings → Environment Variables
- Add `POSTGRES_URL` and `ENCRYPTION_KEY`
- Redeploy after adding variables

## API Endpoints

### `POST /api/v1/analyze`

Start an analysis job. Returns SSE stream with real-time progress updates.

**Headers:**
- `X-API-Key`: Your Edgy API key (required)
- `Content-Type`: `application/json`

**Request Body:**
```json
{
  "file_name": "My Design",
  "screens": [
    {
      "screen_id": "figma_node_id",
      "name": "Login Screen",
      "order": 0,
      "thumbnail_base64": "data:image/png;base64,...",
      "node_tree": { /* Figma node tree JSON */ }
    }
  ],
  "design_tokens": {
    "primaryColor": { "r": 0.09, "g": 0.09, "b": 0.09 },
    "backgroundColor": { "r": 1, "g": 1, "b": 1 },
    "textColor": { "r": 0.09, "g": 0.09, "b": 0.09 },
    "borderRadius": 8,
    "fontFamily": "Inter"
  },
  "component_library": {
    "serialized": "...",
    "components": [...]
  },
  "options": {
    "llm_provider": "claude",
    "llm_api_key": "sk-ant-...",  // Optional, uses stored credential if not provided
    "generate_missing_screens": true,
    "auto_deploy": false
  }
}
```

**Response:** Server-Sent Events stream

**SSE Events:**

1. **`progress`** - Progress update during analysis:
   ```json
   {
     "stage": "patterns" | "llm-review" | "generating" | "prototype",
     "message": "Analyzing screens...",
     "progress": 0.3  // 0.0 to 1.0
   }
   ```

2. **`complete`** - Analysis finished successfully:
   ```json
   {
     "analysis": {
       "summary": { "total_findings": 12, "critical": 3, ... },
       "screens": [...],
       "flow_findings": [...]
     },
     "generated_layouts": { /* if screen generation enabled */ },
     "prototype_url": "https://..."  /* if auto-deploy enabled */
   }
   ```

3. **`error`** - Error occurred:
   ```json
   {
     "code": "PIPELINE_ERROR",
     "message": "Analysis failed: ..."
   }
   ```

**Example Client Usage:**
```typescript
const response = await fetch('https://your-server.vercel.app/api/v1/analyze', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(requestBody)
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  // Parse SSE events from chunk
  // Handle progress, complete, error events
}
```

### `GET /api/v1/analyze/:jobId`

Get job status and results (fallback for environments where SSE doesn't work).

**Headers:**
- `X-API-Key`: Your Edgy API key

**Response:**
```json
{
  "id": "job-uuid",
  "status": "complete" | "processing" | "error",
  "created_at": "2026-02-07T14:30:00Z",
  "completed_at": "2026-02-07T14:30:45Z",
  "result": { /* analysis output */ },
  "generated_layouts": { /* if generated */ },
  "prototype_url": "https://...",
  "error": null
}
```

### `GET /api/v1/analyze/:jobId/stream`

Reconnect to SSE stream for a specific job. If job is already complete, sends the result immediately.

### `POST /api/v1/deploy`

Deploy a prototype to Vercel.

**Headers:**
- `X-API-Key`: Your Edgy API key

**Request Body:**
```json
{
  "job_id": "job-uuid",
  "files": [
    { "path": "index.html", "content": "<!DOCTYPE html>..." }
  ],
  "project_name": "my-prototype"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://my-prototype.vercel.app",
  "deployment_id": "dpl_xxx"
}
```

### `GET /api/v1/credentials/:provider`

Get stored credential for a provider.

**Providers:** `anthropic`, `gemini`, `vercel`

**Response:**
```json
{
  "provider": "anthropic",
  "has_credential": true
}
```

### `PUT /api/v1/credentials/:provider`

Store encrypted credential for a provider.

**Request Body:**
```json
{
  "api_key": "sk-ant-..."
}
```

**Response:**
```json
{
  "success": true,
  "provider": "anthropic"
}
```

### `DELETE /api/v1/credentials/:provider`

Delete stored credential.

### `GET /api/v1/jobs`

List analysis job history for the authenticated user.

**Query Parameters:**
- `limit`: Number of jobs to return (default: 20)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "jobs": [
    {
      "id": "job-uuid",
      "file_name": "My Design",
      "status": "complete",
      "created_at": "2026-02-07T14:30:00Z",
      "summary": { "total_findings": 12 }
    }
  ],
  "total": 42
}
```

### `GET /api/v1/health`

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

## Authentication

All protected endpoints require an `X-API-Key` header with a valid Edgy API key.

**How API keys work:**
- API keys are generated when a user account is created
- Stored in the `users` table
- Validated on every protected request via `authMiddleware`
- Keys are unique per user and never expire (can be rotated manually)

**Example:**
```bash
curl -H "X-API-Key: your-api-key" \
     https://your-server.vercel.app/api/v1/jobs
```

## Development Workflow

### Local Development

1. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

2. **Start database:**
   - Use Vercel Postgres (recommended)
   - Or run Postgres locally

3. **Run migrations:**
   ```bash
   npm run db:push
   ```

4. **Start dev server:**
   ```bash
   npm run dev
   ```

5. **Test endpoints:**
   ```bash
   curl http://localhost:3000/api/v1/health
   ```

### Testing SSE Locally

Use a tool like `curl` or write a simple test script:

```bash
curl -N -H "X-API-Key: test-key" \
     -H "Content-Type: application/json" \
     -d @test-request.json \
     http://localhost:3000/api/v1/analyze
```

### Database Migrations

When you change the schema in `src/db/schema.ts`:

```bash
# Generate migration files
npm run db:generate

# Push changes to database
npm run db:push
```

## Production Deployment

### Vercel Deployment

1. **Connect repository** to Vercel
2. **Set environment variables** in Vercel dashboard
3. **Deploy** - automatic on push to main branch

### Environment Variables in Vercel

Required:
- `POSTGRES_URL` - Database connection string
- `ENCRYPTION_KEY` - 64-character hex string for credential encryption

Optional:
- `NODE_ENV` - Set to `production` (default)

### Monitoring

- Check Vercel function logs for errors
- Monitor database connection pool
- Track job completion rates
- Watch for SSE connection issues

## Troubleshooting

### SSE Not Working

- Check browser console for connection errors
- Verify `Content-Type: text/event-stream` header
- Ensure no proxy/load balancer buffering SSE
- Test with `curl -N` to see raw events

### Database Connection Issues

- Verify `POSTGRES_URL` is correct
- Check database is accessible from Vercel
- Ensure connection pool limits aren't exceeded
- Review Vercel function logs

### Credential Encryption Errors

- Verify `ENCRYPTION_KEY` is exactly 64 hex characters
- Ensure same key used for encryption/decryption
- Check for key rotation issues

## Architecture Decisions

### Why Hono?

- **Fast**: Built for edge/serverless environments
- **Lightweight**: Minimal dependencies
- **Type-safe**: Full TypeScript support
- **Vercel-optimized**: Works seamlessly with Vercel serverless functions

### Why SSE over WebSockets?

- **Simpler**: One-way streaming is sufficient for progress updates
- **HTTP-based**: Works through proxies and firewalls
- **Auto-reconnect**: Browsers handle reconnection automatically
- **Serverless-friendly**: No persistent connections needed

### Why Database Persistence?

- **Reliability**: Jobs survive server restarts
- **History**: Users can view past analyses
- **Reconnection**: Can resume SSE streams if dropped
- **Debugging**: Track job status and errors

## Contributing

When adding new features:

1. **Add types** in `src/lib/types.ts`
2. **Create service** in `src/services/`
3. **Add route** in `src/routes/`
4. **Update schema** if database changes needed
5. **Test locally** with `npm run dev`
6. **Update this README** with new endpoints
