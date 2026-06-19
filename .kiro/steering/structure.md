---
inclusion: always
---

# Project Structure & Architecture

## Repository Layout

```
StayQualifAI-KiroBytes-System/
├── backend/                # Express.js API (TypeScript)
│   ├── src/
│   │   ├── routes/         # API route handlers (grouped by module)
│   │   ├── controllers/    # Business logic controllers
│   │   ├── services/       # Service layer (Supabase, AI, external APIs)
│   │   ├── middleware/     # Auth, validation, error handling
│   │   ├── types/          # TypeScript type definitions
│   │   ├── utils/          # Shared utilities
│   │   └── index.ts        # App entry point
│   ├── tests/              # Backend test files
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # React application (TypeScript)
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page-level components (per module)
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API client and Supabase calls
│   │   ├── stores/         # Zustand state stores
│   │   ├── types/          # TypeScript type definitions
│   │   ├── utils/          # Frontend utilities
│   │   ├── styles/         # Global styles and Tailwind theme
│   │   └── App.tsx         # Root component
│   ├── public/             # Static assets
│   ├── package.json
│   └── tsconfig.json
├── .kiro/                  # Kiro IDE configuration
│   ├── settings/           # MCP and editor settings
│   ├── specs/              # Feature specifications
│   └── steering/           # Steering rules (this folder)
└── README.md
```

## File Placement Rules

When creating or modifying files, follow these placement conventions:

| File Type | Backend Location | Frontend Location |
|-----------|-----------------|-------------------|
| Route handlers | `backend/src/routes/{module}.ts` | — |
| Controllers | `backend/src/controllers/{module}.controller.ts` | — |
| Services | `backend/src/services/{module}.service.ts` | `frontend/src/services/{module}.service.ts` |
| Middleware | `backend/src/middleware/{name}.ts` | — |
| Types/Interfaces | `backend/src/types/{module}.types.ts` | `frontend/src/types/{module}.types.ts` |
| React pages | — | `frontend/src/pages/{Module}/` |
| React components | — | `frontend/src/components/{ComponentName}/` |
| Hooks | — | `frontend/src/hooks/use{Name}.ts` |
| Zustand stores | — | `frontend/src/stores/{module}.store.ts` |
| Tests | `backend/tests/{module}.test.ts` | `frontend/src/**/__tests__/` |

## Domain Modules

Each product module maps to isolated directories in both backend and frontend:

| Module ID | Domain | Backend Route Group | Frontend Page Dir |
|-----------|--------|--------------------|--------------------|
| resume | Resume Builder & Optimizer | `/api/v1/resume/*` | `pages/Resume/` |
| interview | Interview Prep & Coaching | `/api/v1/interview/*` | `pages/Interview/` |
| jobsearch | Job Discovery & Tracking | `/api/v1/jobsearch/*` | `pages/JobSearch/` |
| upskilling | Learning Paths & Skill Gaps | `/api/v1/upskilling/*` | `pages/Upskilling/` |
| benchmarking | Job Market Benchmarking | `/api/v1/benchmarking/*` | `pages/Benchmarking/` |

## Architecture Principles

- **Monorepo with split packages**: `backend/` and `frontend/` are independent Node packages sharing one repo
- **Domain isolation**: Each module owns its own routes, controllers, services, pages, and database tables — avoid cross-module imports
- **Request flow**: Route → Controller → Service → Supabase (never skip layers)
- **API boundary**: Frontend calls backend REST endpoints only; frontend never queries Supabase directly
- **Shared type mirroring**: Keep `backend/src/types/` and `frontend/src/types/` in sync for shared interfaces (duplicate rather than symlink)
- **Single responsibility**: One file = one controller, one service, or one route group per module

## Branching Strategy

| Branch Pattern | Purpose |
|----------------|---------|
| `main` | Stable, production-ready code |
| `feature/{module}` | Module development (e.g., `feature/resume`, `feature/interview`) |

Always branch from `main`. Merge back via pull request.

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files (backend) | kebab-case | `resume.controller.ts` |
| Files (frontend components) | PascalCase | `ResumeCard.tsx` |
| Files (frontend hooks) | camelCase with `use` prefix | `useResumeList.ts` |
| Files (frontend stores) | camelCase with `.store` suffix | `resume.store.ts` |
| Directories | camelCase (backend), PascalCase (frontend pages/components) | `routes/`, `Pages/Resume/` |
| Database tables | snake_case, prefixed by module | `resume_versions`, `interview_sessions` |
| API endpoints | kebab-case nouns | `/api/v1/resume/versions` |
| TypeScript interfaces | PascalCase with `I` prefix for interfaces | `IResumeVersion` |
| TypeScript types | PascalCase | `ResumeScore` |
