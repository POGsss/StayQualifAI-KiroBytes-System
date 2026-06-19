# Design Document

## Overview

This document describes the design for **Module 1: Resume** of the StayQualifAI platform. The module delivers three connected capabilities — ATS scanning and keyword optimization, AI resume building with semantic job matching, and resume version snapshot management — behind a single Express.js + TypeScript backend exposed under `/api/v1/resume/*`, a React + TypeScript frontend that talks only to that backend, and PostgreSQL storage via Supabase with Row Level Security on every table.

The design honors the platform steering rules:

- **Backend** follows a strict Route → Controller → Service → Supabase client flow with centralized typed error middleware, input validation middleware, explicit return types, and named exports.
- **Frontend** uses React with a Zustand store (`resume.store.ts`), Tailwind, presentational components in `components/`, pages in `pages/Resume/`, and a single data-access service file (`frontend/src/services/resume.service.ts`) that never imports the Supabase client.
- **Database** uses Supabase PostgreSQL with all DDL applied through `mcp_supabase_apply_migration`, RLS on every table, `resume_`-prefixed tables, and `snake_case` columns scoped per user.
- **AI** uses Google Gemini (free tier), accessed only from backend services.
- **Types** are mirrored between `backend/src/types/resume.types.ts` and `frontend/src/types/resume.types.ts`.
- Every endpoint returns the `{ data, error, meta }` envelope.

### Resolved Design Decisions

Three open questions from the requirements phase were resolved by the user and are baked into this design:

1. **Maximum resume upload file size = 5 MB.** Enforced by upload validation middleware before parsing (Requirement 1.3).
2. **Single active `Resume_Version` per `Authenticated_User`.** At most one version may be active at any time. Enforced both by application logic and by a database partial unique constraint (Requirement 10.3).
3. **Keyword matching strategy = normalized exact / stemmed matching for keyword suggestions; Gemini reserved for the separate semantic `Match_Score`.** Rationale below.

#### Keyword Matching Rationale (Requirement 4 vs Requirement 6)

The module performs two distinct kinds of comparison, and they intentionally use different techniques:

- **Keyword suggestions (Requirement 4)** must be *deterministic, explainable, fast, and free of external dependency*. A user needs to trust that a suggested keyword genuinely appears in the job description and genuinely does not appear in the resume. This is best served by **normalized lexical matching**: lowercase, strip punctuation, tokenize, remove stopwords, and reduce tokens to a stem (Porter stemmer). A term is "present" in the resume when its stem is present in the resume's stemmed token set. This is pure, unit-testable, and cheap to run on every keystroke or scan without burning the Gemini free-tier quota. It also keeps Requirement 4.2 ("exclude any term already present") and Requirement 4.3 ("empty list when all terms present") trivially verifiable as properties.
- **Semantic match score (Requirement 6)** is inherently fuzzy — it judges conceptual alignment ("led a team" ≈ "managed engineers") that lexical matching cannot capture. This is where **Gemini** adds value, returning a `Match_Score` plus matched/missing *concepts*.

Reserving Gemini for the semantic score keeps the high-frequency, must-be-correct keyword path off the network and within free-tier limits, while still giving users AI-grade semantic insight where it matters.

## Architecture

### System Context

```mermaid
flowchart LR
    subgraph Frontend [React Frontend]
        Pages[pages/Resume/*]
        Store[resume.store.ts (Zustand)]
        Svc[services/resume.service.ts]
    end

    subgraph Backend [Express API /api/v1/resume/*]
        Routes[routes/resume.ts]
        Ctrl[resume.controller.ts]
        Mw[middleware: auth / validation / error]
        SvcLayer[services/resume.service.ts]
        Parser[Resume_Parser]
        Serializer[Resume_Serializer]
        Scanner[ATS_Scanner]
        Matcher[Job_Matcher]
        Bullets[Bullet_Generator]
        VerMgr[Version_Manager]
    end

    subgraph External
        Supabase[(Supabase Postgres + Storage + Auth)]
        Gemini[Google Gemini API]
    end

    Pages --> Store --> Svc
    Svc -->|HTTPS JSON| Routes
    Routes --> Mw --> Ctrl --> SvcLayer
    SvcLayer --> Parser
    SvcLayer --> Serializer
    SvcLayer --> Scanner
    SvcLayer --> Matcher
    SvcLayer --> Bullets
    SvcLayer --> VerMgr
    SvcLayer -->|@supabase/supabase-js| Supabase
    Matcher --> Gemini
    Bullets --> Gemini
```

### Request Flow

Every request passes through the same ordered pipeline (Requirements 11.2, 11.4, 12.1):

1. **Route** (`backend/src/routes/resume.ts`) — declares the HTTP method and path, attaches middleware, delegates to a controller method. No business logic.
2. **Auth middleware** (`backend/src/middleware/auth.ts`) — verifies the Supabase JWT from the `Authorization` header, attaches `req.user`. Rejects unauthenticated requests with a typed `AuthError` (Requirement 11.2).
3. **Validation middleware** (`backend/src/middleware/validate.ts`) — validates body, params, and query against a Zod schema for the route. Rejects with a typed `ValidationError` (Requirement 11.4).
4. **Controller** (`backend/src/controllers/resume.controller.ts`) — translates the validated request into service calls, shapes the `{ data, error, meta }` envelope. No direct Supabase or Gemini access.
5. **Service** (`backend/src/services/resume.service.ts`) — owns business logic, calls the Supabase client and Gemini, throws typed errors on failure.
6. **Error middleware** (`backend/src/middleware/error.ts`) — catches all thrown typed errors and serializes them into the `{ data: null, error, meta }` envelope with the correct HTTP status (Requirements 12.1, 12.3).

### Authentication and Tenancy

The backend creates a per-request Supabase client using the caller's JWT so that **Row Level Security is the source of truth** for ownership (Requirement 11.1). Because RLS scopes every query to `auth.uid()`, a query for a row owned by another user returns no rows, which the service maps to a `NotFoundError` (Requirements 8.3, 9.3, 10.4, 11.3) — never leaking the existence of other users' data.

## Components and Interfaces

### Backend Components

| Component | File | Responsibility | Requirements |
|-----------|------|----------------|--------------|
| Resume routes | `routes/resume.ts` | Endpoint declarations, middleware wiring | 11.2, 11.4, 12.1 |
| Resume controller | `controllers/resume.controller.ts` | Request orchestration, envelope shaping | 1.5, 3.4, 12.1–12.3 |
| Resume service | `services/resume.service.ts` | Business logic, Supabase + AI orchestration | all |
| Resume_Parser | `services/resumeParser.service.ts` | Extract Structured_Resume from `.pdf`/`.docx` | 1.1, 1.4 |
| Resume_Serializer | `utils/resumeSerializer.ts` | Structured_Resume ⇄ stored representation | 2.1–2.4 |
| ATS_Scanner | `services/atsScanner.service.ts` | Compatibility_Score + keyword suggestions | 3.x, 4.x |
| Job_Matcher | `services/jobMatcher.service.ts` | Semantic Match_Score via Gemini | 6.x |
| Bullet_Generator | `services/bulletGenerator.service.ts` | X-Y-Z bullets via Gemini | 7.x |
| Version_Manager | `services/versionManager.service.ts` | Clone / rename / list / switch versions | 8.x, 9.x, 10.x |
| Gemini client | `services/aiProvider.service.ts` | Wraps Gemini calls, normalizes failures | 6.4, 7.4 |
| Keyword utils | `utils/keywords.ts` | Normalize / tokenize / stem / diff | 4.1–4.3 |
| Auth middleware | `middleware/auth.ts` | JWT verification | 11.2 |
| Validation middleware | `middleware/validate.ts` | Zod request validation | 11.4 |
| Error middleware | `middleware/error.ts` | Typed error → envelope | 12.1, 12.3 |
| Upload middleware | `middleware/upload.ts` | Multipart parsing, size + type guard | 1.2, 1.3 |

### Frontend Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Resume service | `services/resume.service.ts` | All HTTP calls to `/api/v1/resume/*`; unwraps envelope |
| Resume store | `stores/resume.store.ts` | Zustand state: versions, active version, scan results, async status |
| Upload page | `pages/Resume/ResumeUploadPage.tsx` | Upload + scan workflow |
| Builder page | `pages/Resume/ResumeBuilderPage.tsx` | Template selection + section editing |
| Versions page | `pages/Resume/ResumeVersionsPage.tsx` | List / clone / rename / switch |
| Match panel | `components/MatchPanel/` | Displays Match_Score + concepts |
| Score gauge | `components/ScoreGauge/` | Renders ATS / match score 0–100 |
| Keyword list | `components/KeywordList/` | Shows keyword suggestions |

The frontend service is the only place HTTP envelopes are unwrapped: it returns `data` on success and throws a typed client error carrying `error` on failure, so the store and components work with plain domain objects.

### Backend Service Interface (representative signatures)

```typescript
// services/resume.service.ts — explicit return types, named exports
export async function parseUpload(file: UploadedFile): Promise<StructuredResume>;
export async function scanResume(input: ScanInput): Promise<AtsScanResult>;
export async function suggestKeywords(input: KeywordInput): Promise<KeywordSuggestion[]>;
export async function listTemplates(): Promise<ResumeTemplate[]>;
export async function buildFromTemplate(templateId: string): Promise<StructuredResume>;
export async function saveVersion(userId: string, version: NewResumeVersion): Promise<ResumeVersion>;
export async function matchJob(input: MatchInput): Promise<MatchResult>;
export async function generateBullets(input: BulletInput): Promise<XyzBullet[]>;
export async function cloneVersion(userId: string, sourceId: string): Promise<ResumeVersion>;
export async function renameVersion(userId: string, id: string, name: string): Promise<ResumeVersion>;
export async function listVersions(userId: string): Promise<ResumeVersion[]>;
export async function setActiveVersion(userId: string, id: string): Promise<ResumeVersion>;
```

## Data Models

### TypeScript Types (mirrored backend ⇄ frontend)

These are duplicated in `backend/src/types/resume.types.ts` and `frontend/src/types/resume.types.ts`.

```typescript
export type ResumeSectionType =
  | 'contact' | 'summary' | 'experience' | 'education' | 'skills' | 'additional';

export interface IResumeSection {
  type: ResumeSectionType;
  heading: string;
  items: string[]; // serialized section content lines
}

export interface IStructuredResume {
  contact: { name: string; email: string; phone?: string; location?: string; links: string[] };
  summary: string;
  experience: IResumeSection[];
  education: IResumeSection[];
  skills: string[];
  additional: IResumeSection[];
}

export interface IResumeVersion {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  content: IStructuredResume;
  createdAt: string;
  updatedAt: string;
}

export interface IAtsScanResult {
  score: number;               // 0..100 inclusive (Compatibility_Score)
  factors: IScoreFactor[];     // contributing factors
  keywordSuggestions: IKeywordSuggestion[];
}

export interface IScoreFactor { label: string; impact: number; detail: string }
export interface IKeywordSuggestion { term: string; reason: string }

export interface IMatchResult {
  score: number;               // 0..100 inclusive (Match_Score)
  matchedConcepts: string[];
  missingConcepts: string[];
}

export type XyzBullet = string; // "Accomplished X as measured by Y by doing Z"

export interface IResumeTemplate {
  id: string;
  name: string;
  sections: ResumeSectionType[];
}

// API envelope
export interface IApiResponse<T> {
  data: T | null;
  error: IApiError | null;
  meta: { requestId: string; timestamp: string } & Record<string, unknown>;
}

export interface IApiError { type: string; message: string; details?: unknown }
```

### Database Schema (Supabase PostgreSQL)

All DDL is applied via `mcp_supabase_apply_migration` during the implementation phase — **no migrations are applied at design time**. Tables are `resume_`-prefixed with `snake_case` columns and RLS enabled.

#### Table: `resume_versions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `user_id` | `uuid` | FK → `auth.users(id)`, not null |
| `name` | `text` | not null, `check (length(btrim(name)) > 0)` |
| `is_active` | `boolean` | not null, default `false` |
| `content` | `jsonb` | not null — serialized Structured_Resume |
| `source_version_id` | `uuid` | nullable, FK → `resume_versions(id)` (clone provenance) |
| `created_at` | `timestamptz` | not null, default `now()` |
| `updated_at` | `timestamptz` | not null, default `now()` |

Constraints / indexes:
- `create index on resume_versions (user_id);`
- **Single active version invariant (Requirement 10.3):** `create unique index resume_versions_one_active_per_user on resume_versions (user_id) where is_active;` — a partial unique index guarantees at most one active row per user at the database layer.

#### Table: `resume_templates`

A small reference table of ATS-parseable templates (Requirement 5.1). Read-only to users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `name` | `text` | not null |
| `sections` | `jsonb` | ordered list of `ResumeSectionType` |
| `is_active` | `boolean` | template availability flag |

#### Storage

Uploaded `.pdf`/`.docx` files are stored in a Supabase Storage bucket `resume-uploads` with per-user RLS path scoping (`{user_id}/...`). Parsing reads from the bucket; the durable artifact of record is the parsed `content` JSON in `resume_versions`.

### RLS Policy Intent

`resume_versions` — RLS enabled; all four policies keyed on `auth.uid() = user_id` (Requirements 11.1, 11.3):
- `select`: `using (auth.uid() = user_id)`
- `insert`: `with check (auth.uid() = user_id)`
- `update`: `using (auth.uid() = user_id) with check (auth.uid() = user_id)`
- `delete`: `using (auth.uid() = user_id)`

`resume_templates` — RLS enabled; `select` policy `using (is_active = true)` for all authenticated users; no client insert/update/delete.

Storage bucket `resume-uploads` — RLS policies restrict object access to paths beginning with the caller's `auth.uid()`.

## API Endpoint Catalog

All endpoints are under `/api/v1/resume`, require authentication (Requirement 11.2), run validation middleware (Requirement 11.4), and return the `{ data, error, meta }` envelope (Requirement 12.1).

| Method | Path | Purpose | Request | Success `data` | Requirements |
|--------|------|---------|---------|----------------|--------------|
| POST | `/uploads` | Upload + parse a resume file | multipart file | `IStructuredResume` | 1.1–1.5 |
| POST | `/scans` | Compute ATS score (+ optional JD) | `{ content, jobDescription? }` | `IAtsScanResult` | 3.1–3.5 |
| POST | `/keyword-suggestions` | Keyword gap suggestions | `{ content, jobDescription }` | `IKeywordSuggestion[]` | 4.1–4.4 |
| GET | `/templates` | List ATS-parseable templates | — | `IResumeTemplate[]` | 5.1 |
| POST | `/versions` | Save a built/edited resume version | `{ name, content, templateId? }` | `IResumeVersion` | 5.2–5.4 |
| GET | `/versions` | List the user's versions | — | `IResumeVersion[]` | 10.1 |
| POST | `/versions/:id/clone` | Clone a version | — | `IResumeVersion` | 8.1–8.3 |
| PATCH | `/versions/:id` | Rename a version | `{ name }` | `IResumeVersion` | 9.1–9.3 |
| POST | `/versions/:id/activate` | Set a version active | — | `IResumeVersion` | 10.2–10.4 |
| POST | `/match` | Semantic match analysis | `{ content, jobDescription }` | `IMatchResult` | 6.1–6.4 |
| POST | `/bullets` | Generate X-Y-Z bullets | `{ experience }` | `XyzBullet[]` | 7.1–7.4 |

RESTful naming notes: `versions` is the primary resource; `clone` and `activate` are action sub-resources on a version; `uploads`, `scans`, `match`, `bullets`, and `keyword-suggestions` are processing resources that accept input and return a computed result without necessarily persisting.

## AI Integration Approach

### AI_Provider (Gemini) Wrapper

`aiProvider.service.ts` is the single point of contact with Gemini (free tier). It:
- Reads the API key from an environment variable (never hardcoded).
- Sends a structured prompt and requests JSON-shaped output.
- Validates and parses the model response with a Zod schema; a malformed or empty response is treated as a provider failure.
- Translates any network error, timeout, quota error, or schema-validation failure into a typed `AiProviderError` so callers can satisfy Requirements 6.4 and 7.4 uniformly.

### Job_Matcher (Requirement 6)

Input: `IStructuredResume` + `Job_Description`. The service composes a prompt instructing Gemini to return `{ score: 0..100, matchedConcepts: string[], missingConcepts: string[] }`. The returned score is clamped to the inclusive `[0, 100]` range as a defensive invariant before being returned. If `Job_Description` is missing, validation middleware rejects the request before the service runs (Requirement 6.3). If Gemini fails, `AiProviderError` propagates to a typed envelope (Requirement 6.4).

### Bullet_Generator (Requirement 7)

Input: an experience description. The service prompts Gemini to rewrite it into one or more X-Y-Z bullets of the form "Accomplished [X] as measured by [Y] by doing [Z]". Empty/whitespace input is rejected by validation middleware (Requirement 7.3). The service post-validates that each returned bullet is non-empty; provider failure yields `AiProviderError` (Requirement 7.4).

### Cost / Quota Discipline

Only `Job_Matcher` and `Bullet_Generator` call Gemini. The high-frequency ATS scan and keyword paths are pure, deterministic, in-process computations (see Keyword Matching Rationale), keeping the platform within free-tier limits.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The following properties were derived from the acceptance-criteria prework. Redundant criteria were consolidated so each property provides unique validation value. AI-dependent properties (P6) use a mocked `AI_Provider` so the property exercises our clamping/validation logic, not Gemini itself.

### Property 1: Structured resume serialization round-trip

*For any* well-formed `Structured_Resume`, serializing it to its stored representation and then deserializing it produces a `Structured_Resume` equivalent to the original.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: ATS compatibility score is bounded

*For any* `Structured_Resume` and any optional `Job_Description`, the `Compatibility_Score` produced by the ATS_Scanner is an integer in the inclusive range 0 to 100.

**Validates: Requirements 3.1**

### Property 3: Keyword suggestions equal the JD-minus-resume term difference

*For any* `Structured_Resume` and `Job_Description`, every returned `Keyword_Suggestion` has a normalized stem that appears among the job description's significant stems and does not appear among the resume's stems; and when the resume's stems contain every significant stem of the job description, the suggestion list is empty.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 4: Built resume matches its template's section structure

*For any* ATS-parseable template, the `Structured_Resume` produced by `Resume_Builder` from that template contains exactly the section types declared by the template.

**Validates: Requirements 5.2**

### Property 5: Cloning preserves content, assigns a new identity, and leaves the source unchanged

*For any* `Resume_Version`, cloning it yields a new `Resume_Version` whose content is equivalent to the source, whose identifier differs from the source's identifier, while the source `Resume_Version` content and name remain unchanged.

**Validates: Requirements 8.1, 8.2**

### Property 6: Match score is bounded

*For any* mocked `AI_Provider` response (including out-of-range or malformed numeric values), the `Match_Score` returned by `Job_Matcher` is an integer in the inclusive range 0 to 100.

**Validates: Requirements 6.1**

### Property 7: At most one active resume version per user

*For any* set of `Resume_Versions` owned by a single `Authenticated_User` and any sequence of activation operations over them, after the sequence completes at most one version is active, and the active version (if any) is the one most recently activated.

**Validates: Requirements 10.2, 10.3**

### Property 8: All responses conform to the API envelope

*For any* request outcome, the response is an `API_Response` of shape `{ data, error, meta }` where on success `data` is populated and `error` is null, and on failure `error` is a typed error and `data` is null.

**Validates: Requirements 12.1, 12.2, 12.3**

### Property 9: Empty-content resume scores zero

*For any* `Structured_Resume` whose extractable text content is empty or whitespace-only, the ATS_Scanner returns a `Compatibility_Score` of 0 together with an explanatory factor.

**Validates: Requirements 3.5**

### Property 10: Renaming preserves content

*For any* `Resume_Version` and any non-empty name, renaming the version updates its name to the new value while leaving its `Structured_Resume` content unchanged.

**Validates: Requirements 9.1**

## Error Handling

### Typed Error Hierarchy

Services throw typed errors; the centralized error middleware maps them to envelope responses and HTTP status codes (Requirements 12.1, 12.3).

| Error type | HTTP status | Raised when | Requirements |
|------------|-------------|-------------|--------------|
| `ValidationError` | 400 | Body/param/query fails Zod schema; missing JD; empty name; empty experience; missing required section | 1.2, 1.3, 4.4, 5.4, 6.3, 7.3, 9.2, 11.4 |
| `UnsupportedFileTypeError` | 400 | Upload extension not `.pdf`/`.docx` | 1.2 |
| `FileTooLargeError` | 413 | Upload exceeds 5 MB | 1.3 |
| `ParseError` | 422 | `.pdf`/`.docx` cannot be parsed | 1.4 |
| `DeserializationError` | 422 | Stored representation malformed | 2.4 |
| `AuthError` | 401 | Missing/invalid Supabase JWT | 11.2 |
| `NotFoundError` | 404 | Version absent or not owned by caller | 8.3, 9.3, 10.4, 11.3 |
| `AiProviderError` | 502 | Gemini unavailable, errors, times out, or returns malformed output | 6.4, 7.4 |
| `InternalError` | 500 | Unexpected failure (fallback) | — |

### Error Handling Principles

- **Ownership errors return 404, not 403** (Requirements 8.3, 9.3, 10.4, 11.3) so the API never reveals that another user's resource exists. RLS naturally yields "no rows", which the service maps to `NotFoundError`.
- **Validation runs before business logic** so malformed requests never reach services or the database (Requirement 11.4).
- **AI failures are isolated** behind `AiProviderError` so match and bullet endpoints fail predictably without leaking provider internals (Requirements 6.4, 7.4).
- **Every error path still returns the envelope** with `data: null` and a typed `error` (Requirements 12.1, 12.3).

## Testing Strategy

The module uses a dual approach: **property-based tests** for universal correctness and **example/unit/integration tests** for concrete behavior, edge cases, and infrastructure.

### Property-Based Testing

- Library: **fast-check** (with Vitest) on the backend — the project's TypeScript test runner. Property tests are not implemented from scratch.
- Each property test runs a **minimum of 100 iterations**.
- Each property test is tagged with a comment referencing this design, in the format:
  `// Feature: resume, Property {number}: {property text}`
- Generators: an `arbStructuredResume` generator drives P1, P2, P9; token-set generators drive P3; a template iterator drives P4; version generators drive P5, P7, P10; a numeric/garbage generator with a mocked `AI_Provider` drives P6; a handler-outcome generator drives P8.
- Properties P1–P10 each map to exactly one property-based test.

### Unit and Integration Testing

- **Unit / example tests** cover: file parsing over real `.pdf`/`.docx` fixtures (1.1, 1.5), parse failures (1.4), score modes with/without JD (3.2, 3.3, 3.4), template listing (5.1), match/bullet envelope shape and AI-failure mapping with mocked Gemini (6.2, 6.4, 7.1, 7.2, 7.4), and auth rejection (11.2).
- **Edge-case tests** cover: invalid extensions (1.2), size boundary at 5 MB (1.3), malformed stored blobs (2.4), missing-JD validation (4.4, 6.3), empty required section (5.4), whitespace experience (7.3), whitespace name (9.2).
- **Integration tests** (against a Supabase test project / branch) cover: persistence on save (5.3), per-user listing isolation (10.1), RLS ownership enforcement and not-found semantics (8.3, 9.3, 10.4, 11.1, 11.3). These run with 1–3 representative cases — RLS behavior does not vary meaningfully with input volume.
- **Frontend tests** cover the `resume.service.ts` envelope unwrapping (success returns `data`, failure throws typed client error) and store state transitions; presentational components use example-based render tests.

### Why integration over PBT for data access

Per-user listing and RLS enforcement test Supabase configuration and policy wiring, not input-varying logic. Running them 100 times adds no coverage over 1–3 representative cases, so they are integration tests rather than property tests.

## Requirements Traceability

| Requirement | Design element(s) | Verification |
|-------------|-------------------|--------------|
| 1.1 | Resume_Parser, `POST /uploads` | Example (fixtures) |
| 1.2 | Upload middleware, `UnsupportedFileTypeError` | Edge-case |
| 1.3 | Upload middleware (5 MB limit), `FileTooLargeError` | Edge-case |
| 1.4 | Resume_Parser, `ParseError` | Example |
| 1.5 | Controller envelope | Example |
| 2.1–2.3 | Resume_Serializer | **Property 1** |
| 2.4 | `DeserializationError` | Edge-case |
| 3.1 | ATS_Scanner | **Property 2** |
| 3.2, 3.3, 3.4 | ATS_Scanner modes, controller | Example |
| 3.5 | ATS_Scanner empty-content path | **Property 9** |
| 4.1, 4.2, 4.3 | Keyword utils (stemmed set difference) | **Property 3** |
| 4.4 | Validation middleware | Edge-case |
| 5.1 | `GET /templates`, `resume_templates` | Example |
| 5.2 | Resume_Builder | **Property 4** |
| 5.3 | `resume_versions` persistence + RLS | Integration |
| 5.4 | Validation (required sections) | Edge-case |
| 6.1 | Job_Matcher score clamping | **Property 6** |
| 6.2 | Controller envelope | Example |
| 6.3 | Validation middleware | Edge-case |
| 6.4 | AI_Provider wrapper, `AiProviderError` | Example |
| 7.1, 7.2 | Bullet_Generator | Example (mocked AI) |
| 7.3 | Validation middleware | Edge-case |
| 7.4 | `AiProviderError` | Example |
| 8.1, 8.2 | Version_Manager.clone | **Property 5** |
| 8.3 | RLS + `NotFoundError` | Integration |
| 9.1 | Version_Manager.rename | **Property 10** |
| 9.2 | Validation middleware | Edge-case |
| 9.3 | RLS + `NotFoundError` | Integration |
| 10.1 | Version_Manager.list + RLS | Integration |
| 10.2, 10.3 | Version_Manager.activate, partial unique index | **Property 7** |
| 10.4 | RLS + `NotFoundError` | Integration |
| 11.1 | RLS policies on `resume_versions` | Integration |
| 11.2 | Auth middleware, `AuthError` | Example |
| 11.3 | RLS + `NotFoundError` (no 403) | Integration |
| 11.4 | Validation middleware | Example (per route) |
| 12.1, 12.2, 12.3 | Controller + error middleware envelope | **Property 8** |
