# Implementation Plan: Upskilling Module (Career Roadmap & Learning Engine)

## Overview

Implement Module 4 of StayQualifAI — the "Career Roadmap & Learning Engine" — comprising a Role-Based Project Generator, a Career Goal Roadmap with milestone tracking, and a Course & Certificate Finder. The implementation follows the established `Route → Controller → Service → Supabase client` architecture, mounts under `/api/v1/upskilling/*`, and surfaces its UI at `frontend/src/pages/Upskilling/`. The module is self-contained (no cross-module imports), defines its own Gemini wrapper by pattern reuse, reuses the shared `requireAuth`/`validate`/error middleware and the typed error hierarchy, and relies on RLS as the source of truth for ownership.

Property-based tests (fast-check, 100+ iterations) validate the 32 correctness properties; example, integration, smoke, and component tests cover the criteria the design classified as non-property. All test sub-tasks are marked optional with `*`.

## Tasks

- [x] 1. Set up database schema and shared types
  - [x] 1.1 Create Supabase migration for the four upskilling tables
    - Author `backend/supabase/migrations/<timestamp>_create_upskilling_tables.sql` and apply it via `mcp_supabase_apply_migration`
    - Create `upskilling_project_suggestions`, `upskilling_roadmaps`, `upskilling_milestones`, and `upskilling_saved_courses` with all columns, CHECK constraints, and defaults defined in the design (difficulty/cost enums, length and range checks, `completed` default false, `completed_at` nullable)
    - Add `UNIQUE (roadmap_id, sequence)` on milestones, `UNIQUE (user_id, normalized_url)` on saved courses, and the FK `roadmap_id → upskilling_roadmaps(id) ON DELETE CASCADE`
    - Add list-sort indexes: `(user_id, created_at DESC, id ASC)` on suggestions, `(user_id, created_at DESC)` on roadmaps, `(user_id, created_at DESC, url ASC)` on saved courses
    - Enable RLS on all four tables; scope suggestions/roadmaps/saved-courses to `auth.uid() = user_id`, and scope milestones via an `EXISTS` subquery against the parent roadmap's `user_id`
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 4.3, 4.9, 6.1, 6.3, 6.4, 7.5, 7.6_

  - [x] 1.2 Create shared backend TypeScript types
    - Create `backend/src/types/upskilling.types.ts` with all interfaces and unions from the design: `DifficultyLevel`, `CostClassification`, `IGenerateProjectsInput`, `IProjectSuggestion`, `IGenerateRoadmapInput`, `IMilestone`, `IRoadmapDraft`, `IRoadmap`, `IRoadmapSummary`, `IRoadmapDetail`, `ISearchCoursesInput`, `ICourseRecommendation`, `ISavedCourse`, and `ILearningPlatformAdapter`
    - _Requirements: 1.2, 2.1, 3.3, 4.1, 5.2, 6.1_

  - [x] 1.3 Create mirrored frontend TypeScript types
    - Create `frontend/src/types/upskilling.types.ts` mirroring the backend interfaces (excluding the backend-only `ILearningPlatformAdapter`)
    - _Requirements: 1.2, 3.3, 5.2, 6.1_

- [x] 2. Implement the AI provider wrapper and pure course utilities
  - [x] 2.1 Implement the per-module Gemini provider wrapper
    - Create `backend/src/services/upskilling.aiProvider.service.ts` following the `interview.aiProvider.service.ts` pattern: lazy/key-rotating client, JSON-mode generation, `AbortController` timeout, strict Zod validation of output
    - Expose `generateJson<T>({ prompt, schema, systemInstruction?, timeoutMs? })` that translates ANY failure (missing key, network error, timeout, empty/non-JSON response, schema mismatch) into a typed `AiProviderError`
    - Do not import any other module's AI wrapper
    - _Requirements: 1.6, 3.6_

  - [x] 2.2 Implement the course dedup/normalization utility
    - Create `backend/src/utils/upskillingCourseDedup.ts` with `normalizeUrl` (lowercase scheme/host, strip trailing slash and default ports), `dedupeByNormalizedUrl` (keep first occurrence per normalized URL), and `orderRecommendations` (Free before Paid, then title case-insensitive ascending)
    - _Requirements: 5.4, 5.9, 6.4_

  - [ ]* 2.3 Write property test for URL dedup (Property 24)
    - **Property 24: Recommendations are deduplicated by normalized URL**
    - **Validates: Requirements 5.4**

  - [ ]* 2.4 Write property test for deterministic ordering (Property 25)
    - **Property 25: Recommendations are returned in deterministic order**
    - **Validates: Requirements 5.9**

- [x] 3. Implement the Project Generator service
  - [x] 3.1 Implement `upskilling.projectGenerator.service.ts`
    - Implement `generateProjects` (build Gemini prompt with optional focus skills, call `generateJson` with the project Zod schema at a 20s timeout, return 3–5 bounded suggestions; enforce focus-skill coverage)
    - Implement `saveProject` (persist owned suggestion), `listProjects` (owner-scoped, `created_at` DESC then `id` ASC), and `deleteProject` (zero rows → `NotFoundError`)
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 7.5_

  - [ ]* 3.2 Write property test for generation count bound (Property 1)
    - **Property 1: Project generation count is bounded**
    - **Validates: Requirements 1.1**

  - [ ]* 3.3 Write property test for suggestion field bounds (Property 2)
    - **Property 2: Every generated Project_Suggestion satisfies its field bounds**
    - **Validates: Requirements 1.2, 2.6**

  - [ ]* 3.4 Write property test for focus-skill coverage (Property 3)
    - **Property 3: Focus skills are covered by generated suggestions**
    - **Validates: Requirements 1.3**

  - [ ]* 3.5 Write property test for generation input validation (Property 4)
    - **Property 4: Project generation input validation**
    - **Validates: Requirements 1.4, 1.5**

  - [ ]* 3.6 Write property test for AI failure surfacing (Property 5)
    - **Property 5: AI provider failure is surfaced uniformly (projects)**
    - **Validates: Requirements 1.6**

  - [ ]* 3.7 Write property test for persistence round-trip (Property 6)
    - **Property 6: Project suggestion persistence round-trip with owner**
    - **Validates: Requirements 2.1, 2.7, 7.5**

  - [ ]* 3.8 Write property test for owner-scoped listing (Property 7)
    - **Property 7: Saved project list is owner-scoped and ordered**
    - **Validates: Requirements 2.2, 2.3**

- [x] 4. Implement the Roadmap service
  - [x] 4.1 Implement `upskilling.roadmap.service.ts`
    - Implement `generateRoadmap` (call `generateJson` with the roadmap Zod schema at a 20s timeout; produce 3–12 milestones with contiguous sequence 1..n, per-milestone field bounds, total duration in `(0, 156]` weeks)
    - Implement `saveRoadmap` (persist roadmap + milestones with completion default false / null timestamp, preserving count and ordering), `listRoadmaps` (owner-scoped, `created_at` DESC), `getRoadmap` (milestones plus `completedCount`/`totalCount`)
    - Implement `setMilestoneCompletion` (idempotent complete; uncomplete clears timestamp) and `deleteRoadmap` (cascade-deletes milestones); zero rows → `NotFoundError`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 7.5_

  - [ ]* 4.2 Write property test for roadmap count bound (Property 8)
    - **Property 8: Roadmap generation count is bounded**
    - **Validates: Requirements 3.1**

  - [ ]* 4.3 Write property test for contiguous sequence (Property 9)
    - **Property 9: Generated Milestones form a contiguous ordered sequence**
    - **Validates: Requirements 3.2**

  - [ ]* 4.4 Write property test for milestone field bounds (Property 10)
    - **Property 10: Every generated Milestone satisfies its field bounds**
    - **Validates: Requirements 3.3**

  - [ ]* 4.5 Write property test for total duration bound (Property 11)
    - **Property 11: Roadmap total duration is bounded**
    - **Validates: Requirements 3.4**

  - [ ]* 4.6 Write property test for roadmap input validation (Property 12)
    - **Property 12: Roadmap generation input validation**
    - **Validates: Requirements 3.5**

  - [ ]* 4.7 Write property test for AI failure / no partial persist (Property 13)
    - **Property 13: AI provider failure is surfaced uniformly with no partial persistence (roadmaps)**
    - **Validates: Requirements 3.6**

  - [ ]* 4.8 Write property test for roadmap round-trip + defaults (Property 14)
    - **Property 14: Roadmap persistence round-trip with owner and default completion**
    - **Validates: Requirements 4.1, 4.2, 7.5**

  - [ ]* 4.9 Write property test for owner-scoped roadmap listing (Property 15)
    - **Property 15: Saved roadmap list is owner-scoped and ordered**
    - **Validates: Requirements 4.3**

  - [ ]* 4.10 Write property test for completion idempotence (Property 16)
    - **Property 16: Marking completion is idempotent**
    - **Validates: Requirements 4.4, 4.5**

  - [ ]* 4.11 Write property test for complete-then-uncomplete (Property 17)
    - **Property 17: Complete-then-uncomplete restores the uncompleted state**
    - **Validates: Requirements 4.6**

  - [ ]* 4.12 Write property test for completed-count consistency (Property 18)
    - **Property 18: Completed count is consistent and bounded**
    - **Validates: Requirements 4.7**

  - [ ]* 4.13 Write property test for cascade delete (Property 19)
    - **Property 19: Deleting a roadmap removes all its milestones**
    - **Validates: Requirements 4.9**

- [x] 5. Implement the Course Finder service
  - [x] 5.1 Implement Learning_Platform_API adapters and `upskilling.courseFinder.service.ts`
    - Implement two or more `ILearningPlatformAdapter` source adapters, each normalizing catalog results into `ICourseRecommendation`
    - Implement `searchCourses` (fan out to adapters concurrently with per-source 10s `AbortController` timeouts, normalize, apply optional cost filter, dedupe by normalized URL, order deterministically, cap at 50; exclude failed/timed-out sources; raise `AiProviderError` only when every source fails)
    - Implement `saveCourse` (persist bookmark; duplicate normalized URL → `ConflictError`), `listSavedCourses` (owner-scoped, `created_at` DESC then `url` ASC), and `deleteSavedCourse` (zero rows → `NotFoundError`)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9, 6.1, 6.3, 6.4, 6.5, 6.6, 7.5_

  - [ ]* 5.2 Write property test for result count cap (Property 21)
    - **Property 21: Course search result count is capped**
    - **Validates: Requirements 5.1**

  - [ ]* 5.3 Write property test for recommendation field bounds (Property 22)
    - **Property 22: Every Course_Recommendation satisfies its field bounds**
    - **Validates: Requirements 5.2**

  - [ ]* 5.4 Write property test for cost filter (Property 23)
    - **Property 23: Cost filter returns only matching recommendations**
    - **Validates: Requirements 5.3**

  - [ ]* 5.5 Write property test for partial source failure (Property 26)
    - **Property 26: Partial source failure still returns surviving sources**
    - **Validates: Requirements 5.7**

  - [ ]* 5.6 Write property test for query validation (Property 27)
    - **Property 27: Course search query validation**
    - **Validates: Requirements 5.6**

  - [ ]* 5.7 Write property test for saved-course round-trip (Property 28)
    - **Property 28: Saved course persistence round-trip with owner**
    - **Validates: Requirements 6.1, 7.5**

  - [ ]* 5.8 Write property test for saved-course save validation (Property 29)
    - **Property 29: Saved course save validation**
    - **Validates: Requirements 6.2**

  - [ ]* 5.9 Write property test for owner-scoped saved-course listing (Property 30)
    - **Property 30: Saved course list is owner-scoped and ordered**
    - **Validates: Requirements 6.3**

  - [ ]* 5.10 Write property test for duplicate-URL conflict (Property 31)
    - **Property 31: Duplicate saved-course URL is rejected as a conflict**
    - **Validates: Requirements 6.4**

  - [ ]* 5.11 Write example tests for empty/all-failed cases
    - No-match search returns an empty list (5.5); all-sources-failed returns the temporarily-unavailable `AiProviderError` (5.8)
    - _Requirements: 5.5, 5.8_

- [ ] 6. Cross-user isolation tests
  - [ ]* 6.1 Write property test for cross-user not-found behavior (Property 20)
    - **Property 20: Cross-user access returns not-found and mutates nothing**
    - **Validates: Requirements 2.4, 2.5, 4.8, 6.6, 7.4**

- [x] 7. Implement the backend API layer (schemas, facade, controller, routes)
  - [x] 7.1 Create Zod validation schemas
    - Create `backend/src/routes/upskilling.schemas.ts` with body/params/query schemas for all endpoints: project generate/save, roadmap generate/save, milestone update params + body, course search query, saved-course save/delete, and id params
    - Each schema enforces the bounds in the design so issues identify the offending field and accepted range
    - _Requirements: 1.4, 1.5, 2.6, 3.5, 5.6, 6.2_

  - [x] 7.2 Create the service facade
    - Create `backend/src/services/upskilling.service.ts` re-exporting/delegating to the project generator, roadmap, and course finder sub-services
    - _Requirements: 1.1, 3.1, 5.1_

  - [x] 7.3 Create the controller
    - Create `backend/src/controllers/upskilling.controller.ts` with `asyncHandler`-wrapped handlers for all 14 endpoints; narrow `req.user`/`req.supabase`, invoke the facade, and shape the `{ data, error, meta }` envelope (list responses set `meta.total`; action/DELETE responses return `{ data: null, error: null, meta: null }`)
    - _Requirements: 2.4, 4.9, 6.5, 7.4, 7.5_

  - [x] 7.4 Create the route file and register routes
    - Create `backend/src/routes/upskilling.ts` wiring every endpoint with `requireAuth → validate → handler` in fixed order
    - Register the router under `/api/v1/upskilling` in `backend/src/index.ts`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 7.5 Write integration tests for auth gating and live timeouts
    - Missing/malformed header → 401 (7.1) and expired/invalid token → 401 (7.2) with no controller side effects; project/roadmap generation 20s and course search 15s / per-source 10s timeout behavior via controllable slow stubs
    - _Requirements: 1.1, 3.1, 5.1, 7.1, 7.2_

  - [ ]* 7.6 Write smoke/configuration checks
    - Assert RLS is enabled on all four `upskilling_` tables and `user_id` is `NOT NULL` (via Supabase advisors/migration inspection)
    - _Requirements: 7.3, 7.6_

- [x] 8. Checkpoint — Backend verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement the frontend service and store
  - [x] 9.1 Create the frontend API service client
    - Create `frontend/src/services/upskilling.service.ts` with methods for all backend endpoints (projects generate/save/list/delete, roadmaps generate/save/list/get/delete, milestone update, course search, saved-course save/list/delete), attaching the Bearer token
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

  - [x] 9.2 Create the Zustand store
    - Create `frontend/src/stores/upskilling.store.ts` with `activeTab` (default `Projects`) plus per-feature state (generated/saved projects, current roadmap, milestone progress, search results, saved courses) and their actions
    - Implement tab-selection logic that guarantees exactly one active tab after every action
    - _Requirements: 8.1, 8.4, 8.5_

  - [ ]* 9.3 Write property test for the navigation invariant (Property 32)
    - **Property 32: Exactly one navigation tab is active**
    - **Validates: Requirements 8.5**

- [x] 10. Implement the frontend pages and components
  - [x] 10.1 Create the Upskilling root page with tabbed navigation
    - Create `frontend/src/pages/Upskilling/UpskillingPage.tsx` rendering an underline-style tab bar (Projects | Roadmap | Courses, left-to-right), defaulting to Projects, applying a purple bottom border to the active tab only, switching content client-side within 300ms without reload, a visible keyboard focus indicator distinct from the active border, and Enter/Space activation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7_

  - [x] 10.2 Create the Projects tab and components
    - Create `frontend/src/pages/Upskilling/ProjectsTab.tsx` and presentational cards under `frontend/src/components/Upskilling/`
    - Implement target-role + optional focus-skills input, generate action, suggestion list with save/delete, loading and error states
    - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.4_

  - [x] 10.3 Create the Roadmap tab and components
    - Create `frontend/src/pages/Upskilling/RoadmapTab.tsx` and a milestone-list component under `frontend/src/components/Upskilling/`
    - Implement current/target role + duration input, generate + save actions, roadmap list/detail, milestone completion toggles, and completed/total progress display
    - _Requirements: 3.1, 4.1, 4.3, 4.4, 4.6, 4.7_

  - [x] 10.4 Create the Courses tab and components
    - Create `frontend/src/pages/Upskilling/CoursesTab.tsx` and recommendation/saved-course cards under `frontend/src/components/Upskilling/`
    - Implement query input with optional Free/Paid cost filter, results list (deterministic order preserved from API), save/delete bookmarks, empty-state and error states
    - _Requirements: 5.1, 5.3, 5.5, 6.1, 6.3, 6.5_

- [x] 11. Wire frontend routing and navigation
  - [x] 11.1 Register the Upskilling page in the app router and sidebar
    - Add the Upskilling route in `frontend/src/App.tsx` and a sidebar navigation entry for the module
    - _Requirements: 8.1_

- [x] 12. Checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Write frontend component tests
  - [ ]* 13.1 Write tab navigation component tests
    - Create tests under `frontend/src/pages/Upskilling/__tests__/`: tab structure/order (8.1), switching shows only active content without reload (8.2), active-tab purple border / inactive none (8.3), default Projects view (8.4), focus indicator distinct from active border (8.6), Enter/Space activation (8.7)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7_

- [x] 14. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 32 universal correctness properties from the design using `fast-check` (100+ iterations each), tagged `// Feature: upskilling, Property {number}: {property_text}`
- AI-dependent property tests mock the `Upskilling_AI_Provider`; course-finder property tests mock `ILearningPlatformAdapter` implementations; persistence/ownership properties run against an RLS-faithful test harness seeded with multiple owners; pure-utility properties target `upskillingCourseDedup.ts` directly
- Backend property tests live in `backend/tests/upskilling.property.test.ts`; example/integration/smoke tests in sibling `backend/tests/upskilling.*.test.ts` files
- All DDL is applied via `mcp_supabase_apply_migration`; never run DDL manually
- Frontend uses Zustand for state and Tailwind CSS for styling; no Supabase client is imported in the frontend

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.1", "4.1", "5.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "6.1"] },
    { "id": 4, "tasks": ["7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3"] },
    { "id": 6, "tasks": ["7.4"] },
    { "id": 7, "tasks": ["7.5", "7.6"] },
    { "id": 8, "tasks": ["9.1"] },
    { "id": 9, "tasks": ["9.2"] },
    { "id": 10, "tasks": ["9.3", "10.1"] },
    { "id": 11, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 12, "tasks": ["11.1"] },
    { "id": 13, "tasks": ["13.1"] }
  ]
}
```
