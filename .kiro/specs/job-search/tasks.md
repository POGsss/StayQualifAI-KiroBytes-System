# Implementation Plan: Job Search Module

## Overview

Implement the Job Search module (Module 3) for StayQualifAI, comprising a paginated/filterable job listings feed, a Kanban application tracker, and an AI-powered application/email writer. The implementation follows the established Route → Controller → Service → Supabase architecture with a single facade service delegating to focused sub-services.

## Tasks

- [x] 1. Set up database schema and shared types
  - [x] 1.1 Create Supabase migration for jobsearch tables
    - Create `jobsearch_listings`, `jobsearch_applications`, and `jobsearch_stage_history` tables
    - Add all columns, constraints, indexes, and RLS policies as defined in the design
    - Include composite index for deduplication lookups, work_mode filter index, and date_posted sort index
    - Enable RLS: listings readable by all authenticated users, applications scoped to owning user
    - _Requirements: 1.1, 3.1, 4.2, 5.5_

  - [x] 1.2 Create shared TypeScript types for backend
    - Create `backend/src/types/jobsearch.types.ts` with all interfaces: `IListing`, `IApplication`, `IApplicationDetail`, `IStageTransition`, `IListingIngestInput`, `IPaginationMeta`, `IListingFilters`, `WorkMode`, `Stage`, AI request/response types
    - _Requirements: 1.1, 4.2_

  - [x] 1.3 Create shared TypeScript types for frontend
    - Create `frontend/src/types/jobsearch.types.ts` mirroring the backend types
    - _Requirements: 1.1, 4.2_

- [x] 2. Implement deduplication utility and listing service
  - [x] 2.1 Implement the deduplication utility
    - Create `backend/src/utils/jobsearchDedup.ts`
    - Implement `normalizeForComparison`: lowercase, trim, collapse internal whitespace
    - Implement `isListingDuplicate`: compare normalized company, title, location
    - Implement `mergeDuplicateListings`: retain earliest datePosted, append sourceUrl, use most recent description/salary
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 2.2 Write property tests for normalization (Property 1)
    - **Property 1: Normalization is idempotent and case/whitespace invariant**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [ ]* 2.3 Write property tests for duplicate detection (Property 2)
    - **Property 2: Duplicate detection is symmetric and consistent**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5**

  - [ ]* 2.4 Write property tests for duplicate merge (Property 3)
    - **Property 3: Duplicate merge preserves earliest date and appends URL**
    - **Validates: Requirements 3.2**

  - [x] 2.5 Implement the listing service
    - Create `backend/src/services/jobsearchListing.service.ts`
    - Implement `getListings` with pagination, filters (workMode, location, keyword, company), and combined filter logic
    - Implement `ingestListing` with deduplication check and merge-or-create logic
    - Validate pagination params (page >= 1, pageSize 1–100) and filter values (non-empty, non-whitespace, <= 100 chars)
    - _Requirements: 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.6_

  - [ ]* 2.6 Write property tests for pagination metadata (Property 4)
    - **Property 4: Pagination metadata is mathematically consistent**
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 2.7 Write property tests for invalid pagination rejection (Property 5)
    - **Property 5: Invalid pagination parameters are rejected**
    - **Validates: Requirements 1.5**

  - [ ]* 2.8 Write property tests for work mode filter (Property 6)
    - **Property 6: Work mode filter returns only matching listings**
    - **Validates: Requirements 2.1**

  - [ ]* 2.9 Write property tests for substring filters (Property 7)
    - **Property 7: Substring filters are case-insensitive and complete**
    - **Validates: Requirements 2.2, 2.3, 2.4**

  - [ ]* 2.10 Write property tests for combined filters (Property 8)
    - **Property 8: Combined filters are conjunctive**
    - **Validates: Requirements 2.5**

  - [ ]* 2.11 Write property tests for invalid filter rejection (Property 9)
    - **Property 9: Invalid filter values are rejected**
    - **Validates: Requirements 2.7**

  - [ ]* 2.12 Write property tests for listing field validation (Property 18)
    - **Property 18: Listing field validation enforces constraints**
    - **Validates: Requirements 1.1**

- [x] 3. Implement application tracker service
  - [x] 3.1 Implement the tracker service
    - Create `backend/src/services/jobsearchTracker.service.ts`
    - Implement `listApplications`: fetch user's applications with denormalized listing fields, ordered by dateStageChanged desc per stage
    - Implement `addApplication`: create in Wishlist stage, check for duplicate user+listing pair (ConflictError on unique violation)
    - Implement `updateStage`: atomic stage update, record timestamp, insert into stage_history
    - Implement `getApplicationDetail`: fetch application with full listing and stage history (reverse chronological)
    - Implement `updateNotes`: validate 2000 char limit, persist notes
    - Implement `deleteApplication`: remove application record (cascade deletes history)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 4.9, 5.1, 5.2, 5.3, 5.5, 9.2, 9.4_

  - [ ]* 3.2 Write property tests for default Wishlist stage (Property 10)
    - **Property 10: New applications always start in Wishlist stage**
    - **Validates: Requirements 4.3**

  - [ ]* 3.3 Write property tests for duplicate application prevention (Property 11)
    - **Property 11: Duplicate application tracking is prevented**
    - **Validates: Requirements 4.4**

  - [ ]* 3.4 Write property tests for stage transition timestamps (Property 12)
    - **Property 12: Stage transitions update the timestamp**
    - **Validates: Requirements 4.5**

  - [ ]* 3.5 Write property tests for column counts (Property 13)
    - **Property 13: Column counts equal actual application counts**
    - **Validates: Requirements 4.7, 9.5**

  - [ ]* 3.6 Write property tests for card ordering (Property 14)
    - **Property 14: Applications within a stage are ordered by date_stage_changed descending**
    - **Validates: Requirements 4.9**

  - [ ]* 3.7 Write property tests for stage history ordering (Property 15)
    - **Property 15: Stage history is in reverse chronological order**
    - **Validates: Requirements 5.5**

  - [ ]* 3.8 Write property tests for notes character limit (Property 16)
    - **Property 16: Notes are constrained to 2000 characters**
    - **Validates: Requirements 5.3**

- [x] 4. Implement AI writer service
  - [x] 4.1 Implement the AI writer service
    - Create `backend/src/services/jobsearchAiWriter.service.ts`
    - Implement `generateCoverLetter`: fetch user's latest resume + listing description, call Gemini with prompt for 250–500 word cover letter referencing ≥2 listing requirements mapped to resume qualifications, enforce 15s timeout
    - Implement `generateLinkedInOutreach`: call Gemini with prompt constrained to ≤300 characters, include recipient name/role if provided, enforce 15s timeout
    - Implement `generateFollowUpEmail`: validate stage is Applied or Interviewing (throw ValidationError otherwise), generate stage-appropriate email via Gemini, enforce 15s timeout
    - Handle errors: no resume → ValidationError, empty listing description → ValidationError, Gemini timeout/API error → AiProviderError
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.5, 8.6_

  - [ ]* 4.2 Write property tests for follow-up email stage restriction (Property 17)
    - **Property 17: Follow-up emails are restricted to Applied and Interviewing stages**
    - **Validates: Requirements 8.5**

- [x] 5. Implement backend API layer (routes, controller, facade)
  - [x] 5.1 Add ConflictError to error utilities
    - Add `ConflictError` class extending `AppError` with httpStatus 409 to `backend/src/utils/errors.ts`
    - _Requirements: 4.4_

  - [x] 5.2 Create Zod validation schemas for jobsearch routes
    - Create `backend/src/routes/jobsearch.schemas.ts`
    - Define schemas for: listing query params (pagination + filters), listing ingest body, application stage update body, notes update body, AI writer request bodies
    - _Requirements: 1.5, 2.7, 5.3_

  - [x] 5.3 Create the service facade
    - Create `backend/src/services/jobsearch.service.ts`
    - Delegate to `jobsearchListing.service`, `jobsearchTracker.service`, and `jobsearchAiWriter.service`
    - _Requirements: All_

  - [x] 5.4 Create the controller
    - Create `backend/src/controllers/jobsearch.controller.ts`
    - Implement handler methods for all 11 endpoints, extract auth context, invoke facade, shape `{ data, error, meta }` envelope responses
    - _Requirements: All_

  - [x] 5.5 Create the route file and register routes
    - Create `backend/src/routes/jobsearch.ts`
    - Wire all endpoints with `requireAuth` middleware, Zod validation middleware, and controller methods
    - Register the route group in `backend/src/index.ts` under `/api/v1/jobsearch`
    - _Requirements: All_

- [x] 6. Checkpoint — Backend verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement frontend service and store
  - [x] 7.1 Create the frontend API service
    - Create `frontend/src/services/jobsearch.service.ts`
    - Implement HTTP client methods for all backend endpoints (listings CRUD, applications CRUD, AI generation)
    - _Requirements: All_

  - [x] 7.2 Create the Zustand store
    - Create `frontend/src/stores/jobsearch.store.ts`
    - Implement state shape: listings, listingsMeta, filters, applications, selectedApplication, generatedContent, activeTab, status, error
    - Implement actions: fetchListings, setFilters, fetchApplications, addApplication, updateStage (optimistic), deleteApplication, updateNotes (debounced), generateContent, setActiveTab
    - Handle optimistic stage updates with revert on failure
    - _Requirements: 4.5, 4.6, 5.2, 5.4, 10.2, 10.4_

- [x] 8. Implement frontend pages and components
  - [x] 8.1 Create the Job Search root page with tab navigation
    - Create `frontend/src/pages/JobSearch/JobSearchPage.tsx`
    - Render three tabs (Listings, Tracker, AI Writer) with active tab indicator (bottom border in primary purple)
    - Default to Listings tab on load
    - Ensure keyboard navigability with visible focus indicators
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 8.2 Create the Listings tab with filter bar
    - Create `frontend/src/pages/JobSearch/ListingsTab.tsx`
    - Create `frontend/src/components/JobSearch/FilterBar.tsx` with work mode, location, keyword, company filter inputs
    - Create `frontend/src/components/JobSearch/ListingCard.tsx` displaying title, company, location, work mode, salary range, date posted, and direct-apply link
    - Implement pagination controls (next/prev based on metadata)
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 8.3 Create the Tracker tab with Kanban board
    - Create `frontend/src/pages/JobSearch/TrackerTab.tsx`
    - Create `frontend/src/components/JobSearch/KanbanColumn.tsx` with stage name, count header, and card list
    - Create `frontend/src/components/JobSearch/ApplicationCard.tsx` displaying title, company, dateStageChanged; make draggable
    - Implement drag-and-drop between columns with optimistic update and revert on failure
    - Display five columns in order: Wishlist, Applied, Interviewing, Offer, Rejected
    - Cards ordered by dateStageChanged descending within each column
    - _Requirements: 4.1, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 8.4 Create the Application Detail dialog
    - Create `frontend/src/components/JobSearch/ApplicationDetailDialog.tsx` using native `<dialog>`
    - Display full listing details, application metadata, notes editor with auto-save (debounce 1s), and stage history
    - Show character count and prevent input beyond 2000 characters
    - Display stage transition history in reverse chronological order
    - Include delete button with confirmation prompt
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 9.1, 9.2, 9.3, 9.5_

  - [x] 8.5 Create the AI Writer tab
    - Create `frontend/src/pages/JobSearch/AiWriterTab.tsx`
    - Create `frontend/src/components/JobSearch/AiOutputPanel.tsx` with generated text display and copy-to-clipboard button
    - Implement form for selecting application, choosing content type (cover letter, LinkedIn outreach, follow-up email)
    - For LinkedIn outreach: optional recipient name and role fields
    - Display loading state during generation and error messages on failure
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 7.1, 7.3, 7.4, 7.5, 8.1, 8.4, 8.6_

- [x] 9. Wire frontend routing and navigation
  - [x] 9.1 Register the Job Search page in the app router
    - Add route for the Job Search module in `frontend/src/App.tsx`
    - Add sidebar navigation entry for Job Search
    - _Requirements: 10.1_

- [x] 10. Checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Write unit and integration tests
  - [x]* 11.1 Write backend unit tests
    - Create `backend/tests/jobsearch.unit.test.ts`
    - Test: default pagination returns max 20, source URL included in response, AI error handling, no resume validation error, empty description validation error, deletion returns 404 for non-existent application
    - _Requirements: 1.2, 1.4, 6.4, 6.6, 6.7, 7.4, 8.6, 9.4_

  - [x]* 11.2 Write backend integration tests
    - Create `backend/tests/jobsearch.integration.test.ts`
    - Test: full listing ingest with deduplication, AI generation within timeout, LinkedIn message ≤300 chars, cover letter 250–500 words, database error during dedup rejects ingestion, stage update failure handling
    - _Requirements: 3.1, 3.2, 3.6, 4.6, 6.1, 6.3, 7.1, 7.2, 8.1_
 
  - [x]* 11.3 Write frontend component tests
    - Create tests in `frontend/src/pages/JobSearch/__tests__/`
    - Test: tab rendering and navigation, Kanban drag-and-drop with optimistic update and rollback, filter bar interactions, clipboard copy functionality, keyboard navigation and focus indicators
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 4.6, 6.5, 7.5, 8.4_

- [x] 12. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check` (already installed)
- Unit tests validate specific examples and edge cases
- The project uses Vitest for testing (`backend/vitest.config.ts` already exists)
- All property-based tests go in `backend/tests/jobsearch.property.test.ts`
- Frontend uses Zustand for state, Tailwind CSS for styling, and native HTML `<dialog>` for modals

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.1", "4.1"] },
    { "id": 3, "tasks": ["2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "4.2"] },
    { "id": 4, "tasks": ["5.2", "5.3"] },
    { "id": 5, "tasks": ["5.4"] },
    { "id": 6, "tasks": ["5.5"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["8.1", "9.1"] },
    { "id": 10, "tasks": ["8.2", "8.3", "8.5"] },
    { "id": 11, "tasks": ["8.4"] },
    { "id": 12, "tasks": ["11.1", "11.2", "11.3"] }
  ]
}
```
