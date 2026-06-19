---
inclusion: always
---

# Tech Stack & Conventions

## Stack Overview

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL via Supabase |
| Backend | Express.js (TypeScript, strict mode) |
| Frontend | React (TypeScript, strict mode) |
| Runtime | Node.js |
| AI | Google Gemini (free tier) |

Supabase project ref: `mlnhocdsbwlaeqemluvp`

## Backend Rules

- Express.js with TypeScript in strict mode
- Use `@supabase/supabase-js` client for all database, auth, storage, and realtime operations
- Use Supabase Edge Functions for isolated serverless logic (webhooks, scheduled tasks, heavy AI calls)
- Never query Supabase directly from frontend — all data flows through the Express API layer
- Request flow: Route → Controller → Service → Supabase client (never skip layers)
- All routes use `/api/v1/` prefix with RESTful resource naming

## Frontend Rules

- React with TypeScript in strict mode
- State management: Zustand (one store per domain module)
- Styling: Tailwind CSS utility classes; avoid inline styles and CSS modules
- Component architecture: presentational components in `components/`, page-level composition in `pages/`
- All data fetching goes through service files that call the backend API — never import Supabase client in frontend

## Supabase Rules

- Use `mcp_supabase_apply_migration` for ALL schema/DDL changes — never run DDL manually
- Always enable Row Level Security (RLS) on every new table
- Use parameterized queries exclusively; never interpolate user input into SQL strings
- Prefer Supabase client libraries over raw REST/PostgREST calls
- Storage buckets: use RLS policies to scope file access per user

## Security & Environment

- All secrets and configuration values go in environment variables (`.env` files, never committed)
- Never hardcode API keys, tokens, or connection strings in source code
- Use input validation middleware on all route handlers (validate request body, params, query)
- Sanitize all user-provided content before storage or rendering

## Code Style

- ESLint + Prettier enforced across both packages
- Prefer `async/await` over raw Promises or callbacks
- Use explicit return types on all exported functions
- Prefer named exports over default exports
- Error handling: use centralized Express error middleware; throw typed errors from services
- No `any` type unless unavoidable — prefer `unknown` and narrow with type guards

## Commands

```bash
# Backend
cd backend && npm install
cd backend && npm run dev        # Start Express dev server
cd backend && npm run build      # Compile TypeScript
cd backend && npm run test       # Run tests

# Frontend
cd frontend && npm install
cd frontend && npm run dev       # Start React dev server
cd frontend && npm run build     # Production build
cd frontend && npm run test      # Run tests
```

## Key Decisions

- Monorepo with independent `backend/` and `frontend/` packages (no shared workspace linking)
- Types are mirrored between backend and frontend `types/` directories (duplicated, not symlinked)
- One controller, one service, one route file per domain module — no cross-module imports
- Database tables use `snake_case` prefixed by module (e.g., `resume_versions`, `interview_sessions`)
- API responses follow consistent envelope: `{ data, error, meta }` shape
