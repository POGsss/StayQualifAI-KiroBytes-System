# Implementation Plan: Job Scraper

## Overview

Implement resume-matched job discovery for the existing Job Search module. The scraper reads the user's active resume, extracts search keywords, queries SerpAPI Google Jobs, maps results to the listing schema, and ingests them via the existing deduplication pipeline. A new "Find Jobs" button on the Listings tab triggers the flow. The implementation follows the established Route → Controller → Service → Supabase architecture, adding a `Scraper_Service` sub-service under the Job Search facade.

## Tasks

- [x] 1. Implement keyword extractor and scrape mapper utilities
  - [x] 1.1 Create the keyword extractor utility
    - Create `backend/src/utils/jobsearchKeywordExtractor.ts`
    - Implement `ISearchQuery` interface with `text`, `source`, and `score` fields
    - Implement `extractSearchQueries(resume: IStructuredResume): ISearchQuery[]` that:
      - Extracts terms from experience section headings (source: 'title'), skills array (source: 'skill'), experience item text (source: 'experience'), and summary field (source: 'summary')
      - Ranks by priority: title > skill > experience > summary; within priority, multi-word phrases and named technologies rank higher than single generic terms
      - Deduplicates case-insensitively and removes substring queries
      - Returns 1–5 queries, each 2–100 characters
    - Throw `ValidationError` if resume lacks extractable content (empty skills and no experience)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 5.2_

  - [x] 1.2 Create the scrape result mapper utility
    - Create `backend/src/utils/jobsearchScrapeMapper.ts`
    - Implement `mapSerpResultToListing(result: ISerpApiJobResult): IListingIngestInput` with:
      - Field mapping: `title` → `title`, `company_name` → `company`, `location` → `location` (default "Not specified"), `description` → `description` (truncated to 5000 chars)
      - `sourceUrl`: first `apply_options[].link`, fallback to `share_link`
    - Implement `detectWorkMode(location: string): WorkMode` — "remote" → Remote, "hybrid" → Hybrid, else → Onsite (case-insensitive)
    - Implement `parseDatePosted(postedAt: string | undefined): string` — parse relative time ("3 days ago") or absolute dates to ISO 8601; fall back to current UTC
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 1.3 Write property tests for keyword extraction (Properties 2, 3, 4)
    - **Property 2: Keyword Extraction Source Coverage** — extracted queries only contain terms from skills, experience headings, experience items, or summary
    - **Property 3: Query Output Constraints and Ranking** — output is 1–5 distinct queries, each 2–100 chars, ranked by priority
    - **Property 4: Query Deduplication Invariant** — no two output queries are case-insensitively equal, and no query is a substring of another
    - **Validates: Requirements 1.2, 1.3, 1.4, 5.2**

  - [x]* 1.4 Write property tests for scrape mapper (Properties 5, 6, 7)
    - **Property 5: SerpAPI Result Mapping Correctness** — mapped output matches field mapping rules, description ≤ 5000 chars, sourceUrl from apply link or share_link
    - **Property 6: WorkMode Classification** — "remote" → Remote, "hybrid" (no "remote") → Hybrid, else → Onsite
    - **Property 7: datePosted Parsing** — valid relative/absolute dates produce ISO 8601; unparseable strings produce current UTC
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 2. Implement SerpAPI client and scraper service
  - [x] 2.1 Create the SerpAPI HTTP client
    - Create `backend/src/utils/jobsearchSerpApiClient.ts`
    - Implement `ISerpApiJobResult` and `ISerpApiSearchResult` interfaces
    - Implement `searchGoogleJobs(query: string, apiKey: string, location?: string): Promise<ISerpApiSearchResult>` with:
      - HTTP GET to `https://serpapi.com/search?engine=google_jobs&q={query}&api_key={apiKey}&location={location}`
      - 10-second timeout per request using `AbortController`
      - On HTTP 429: throw a recognizable rate-limit error (stop processing)
      - On other HTTP errors or timeout: return `{ query, jobs: [], success: false, error: message }`
    - Process queries sequentially (one at a time)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.9_

  - [x] 2.2 Create the scraper service
    - Create `backend/src/services/jobsearchScraper.service.ts`
    - Implement in-memory cooldown tracking (`Map<string, number>`) with 60-minute window
    - Implement in-memory concurrency lock (`Set<string>`) with `finally` cleanup
    - Implement `runScrape(supabase, userId, location?): Promise<IScrapeSummary>`:
      1. Check concurrency lock → 409 ConflictError if active
      2. Check cooldown → return cooldown info if within 60 minutes
      3. Fetch user's active resume version (most recent `isActive: true`)
      4. Call `extractSearchQueries` on the resume
      5. Take top 3 queries (cap SerpAPI calls at 3)
      6. Call `searchGoogleJobs` sequentially; stop on 429, skip other failures
      7. Map results via `mapSerpResultToListing`
      8. Ingest each via existing `ingestListing`, skip individual failures
      9. Return `IScrapeSummary` with counts and warnings
      10. Abort if total time exceeds 30 seconds, return partial results
    - Validate SERPAPI_API_KEY is set (InternalError if missing)
    - _Requirements: 1.1, 1.5, 1.7, 2.4, 2.5, 2.6, 2.7, 2.8, 3.6, 3.7, 3.8, 4.7, 4.8, 5.1, 5.3, 5.4, 5.5, 7.1, 7.3_

  - [x]* 2.3 Write property tests for resume version selection (Property 1)
    - **Property 1: Resume Version Selection** — given multiple versions with varying `isActive` and `createdAt`, the selected version is the one where `isActive` is true with the most recent `createdAt`
    - **Validates: Requirements 1.1, 1.7**

  - [x]* 2.4 Write property tests for summary count consistency and max calls (Properties 8, 9)
    - **Property 8: Summary Count Consistency** — `totalResults >= newListings + duplicatesMerged + skipped`, and `newListings + duplicatesMerged + skipped` equals total attempted ingestions
    - **Property 9: Maximum SerpAPI Calls Per Scrape** — regardless of query count (1-5), total SerpAPI HTTP calls never exceed 3
    - **Validates: Requirements 3.8, 5.1**

- [x] 3. Checkpoint — Core backend logic verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Wire backend API layer (route, controller, facade)
  - [x] 4.1 Add scrape body validation schema
    - Extend `backend/src/routes/jobsearch.schemas.ts` with `scrapeBodySchema`:
      - Optional `location` field: string, trimmed, 1–100 chars, non-whitespace-only
    - _Requirements: 4.2, 4.3_

  - [x] 4.2 Add scrape handler to the controller
    - Add `scrapeHandler` to `backend/src/controllers/jobsearch.controller.ts`:
      - Extract `userId`, `supabase`, and optional `location` from request
      - Call `runScrape` on the facade
      - Handle cooldown case: return 429 with `Retry-After` header and cooldown expiry in error body
      - Return 200 with `IScrapeSummary` in standard envelope on success
      - Respect 30-second timeout constraint
    - _Requirements: 4.1, 4.4, 4.5, 4.6, 4.7, 4.8, 5.3, 5.5_

  - [x] 4.3 Add `runScrape` delegation to the facade service
    - Add `runScrape` import and re-export to `backend/src/services/jobsearch.service.ts`
    - Delegate to `jobsearchScraper.service.ts`
    - _Requirements: 4.1_

  - [x] 4.4 Register the POST /scrape route
    - Add `POST /scrape` route to `backend/src/routes/jobsearch.ts`
    - Wire: `requireAuth` → `validate({ body: scrapeBodySchema })` → `scrapeHandler`
    - _Requirements: 4.1_

  - [x] 4.5 Update `.env.example` with SerpAPI key placeholder
    - Add `SERPAPI_API_KEY=your_serpapi_key_here` to `backend/.env.example`
    - _Requirements: 7.2_

  - [x]* 4.6 Write property test for location validation (Property 10)
    - **Property 10: Location Validation** — accepts trimmed strings 1–100 chars (non-whitespace-only); rejects empty, whitespace-only, or >100 char strings
    - **Validates: Requirements 4.2, 4.3**

- [x] 5. Checkpoint — Backend API layer verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement frontend Find Jobs button
  - [x] 6.1 Create the FindJobsButton component
    - Create `frontend/src/components/FindJobsButton/FindJobsButton.tsx`
    - Implement states:
      - Idle: primary action button with label "Find Jobs"
      - Loading: disabled button with spinner and "Searching…" text
      - No resume: display message "Upload a resume to find matched jobs" with link to Resume module
    - Accept `hasResume` prop and `onScrapeComplete` callback
    - Call `POST /api/v1/jobsearch/scrape` on click
    - Display success notification with new jobs count on completion
    - Display error notification with message on failure
    - Handle 429 cooldown response: show remaining time notification
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 6.2 Integrate FindJobsButton into ListingsTab
    - Add `FindJobsButton` to `frontend/src/pages/JobSearch/ListingsTab.tsx` above the filter bar
    - On scrape completion, re-fetch listings from page 1 with current filters
    - Pass `hasResume` state (check if user has an uploaded resume)
    - _Requirements: 6.1, 6.4_

- [x] 7. Write unit and integration tests
  - [x]* 7.1 Write backend unit tests for scraper
    - Create `backend/tests/jobscraper.unit.test.ts`
    - Test: no resume → ValidationError, empty resume content → ValidationError, missing SERPAPI_API_KEY → InternalError, SerpAPI 429 stops processing, all queries fail → 502, cooldown enforcement (mock timestamps), concurrency lock (409 on concurrent scrape), location filter passed to SerpAPI, keyword extraction edge cases
    - _Requirements: 1.5, 1.6, 2.4, 2.5, 2.8, 4.7, 5.3, 7.1, 7.3_

  - [x]* 7.2 Write backend integration tests for scraper
    - Create `backend/tests/jobscraper.integration.test.ts`
    - Test: full pipeline with mocked SerpAPI (happy path), partial failure (2/3 queries succeed), listings ingested after scrape, 30-second timeout returns partial results, deduplication merges correctly
    - _Requirements: 3.6, 3.7, 3.8, 4.5, 4.6, 4.8_

  - [x]* 7.3 Write frontend component tests for FindJobsButton
    - Create `frontend/src/components/FindJobsButton/__tests__/FindJobsButton.test.tsx`
    - Test: renders button when resume exists, shows no-resume message when no resume, shows loading state during scrape, displays success notification on completion, displays error on failure, handles 429 cooldown display
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 8. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check` (v3.23.2, already installed)
- Unit tests validate specific examples and edge cases
- All property-based tests go in `backend/tests/jobscraper.property.test.ts`
- The scraper reuses the existing `ingestListing` from `jobsearchListing.service.ts` — no new DB tables needed
- Cooldown and concurrency are in-memory (acceptable for single-process Express server)
- The SerpAPI client uses native `fetch` with `AbortController` for timeouts (no new HTTP library needed)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5", "4.6"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3"] }
  ]
}
```
