# Requirements Document

## Introduction

The Upskilling module is Module 4 of StayQualifAI — an AI-powered career acceleration platform — branded in-product as the "Career Roadmap & Learning Engine." This module helps users close the gap between their current profile and a target career goal through three sub-features: a Role-Based Project Generator that suggests portfolio projects tailored to a target role, a Career Goal Roadmap that produces a step-by-step milestone timeline for a career transition, and a Course & Certificate Finder that surfaces learning recommendations from external learning-platform APIs.

The module follows the established platform architecture (Route → Controller → Service → Supabase client), is mounted under `/api/v1/upskilling/*`, and surfaces its frontend at `pages/Upskilling/`. AI generation uses a per-module Google Gemini provider wrapper (`upskilling.aiProvider.service.ts`) that mirrors the existing module pattern (lazy client, JSON-mode generation, Zod validation, `AbortController` timeout, failure → `AiProviderError`). All database tables are prefixed `upskilling_`, have Row Level Security enabled, and are accessed through the per-request JWT-scoped Supabase client so RLS is the source of truth for ownership. The module reuses the shared typed error hierarchy in `backend/src/utils/errors.ts` and the consistent `{ data, error, meta }` API envelope.

## Glossary

- **Upskilling_Module**: The backend Express service and frontend React pages responsible for portfolio project generation, career roadmap generation and tracking, and course/certificate discovery
- **Project_Generator_Service**: The backend service that uses the AI provider to produce portfolio project suggestions tailored to a target role
- **Roadmap_Service**: The backend service that uses the AI provider to generate a career-transition roadmap and that persists and tracks milestone completion
- **Course_Finder_Service**: The backend service that queries one or more external Learning_Platform_API sources and returns normalized course and certificate recommendations
- **Upskilling_AI_Provider**: The per-module Google Gemini wrapper used by the Project_Generator_Service and Roadmap_Service
- **Learning_Platform_API**: An external third-party course catalog API (e.g., a course/certificate provider) queried by the Course_Finder_Service
- **Target_Role**: A free-text job role the user is preparing for (for example, "Senior Backend Engineer")
- **Project_Suggestion**: A single generated portfolio project record containing a title, description, demonstrated skills, difficulty level, and estimated effort
- **Difficulty_Level**: A project complexity classification — one of Beginner, Intermediate, or Advanced
- **Career_Roadmap**: A persisted plan for moving from a current role to a Target_Role, composed of an ordered set of Milestones over a target duration
- **Milestone**: A single ordered step within a Career_Roadmap containing a sequence position, title, description, associated skills, estimated duration, and completion state
- **Course_Recommendation**: A normalized learning resource returned by the Course_Finder_Service containing a title, provider name, URL, cost classification, and optional rating
- **Saved_Course**: A Course_Recommendation that a user has bookmarked for later reference
- **Owner**: The authenticated user, identified by the Supabase JWT, who owns a given Project_Suggestion, Career_Roadmap, or Saved_Course record

## Requirements

### Requirement 1: Role-Based Project Generation

**User Story:** As a job seeker, I want AI-generated portfolio project ideas tailored to my target role, so that I can build relevant work samples that demonstrate the skills employers expect.

#### Acceptance Criteria

1. WHEN a user submits a project generation request with a Target_Role between 2 and 100 non-whitespace characters, THE Project_Generator_Service SHALL return between 3 and 5 Project_Suggestions and return the result within 20 seconds
2. THE Project_Generator_Service SHALL produce each Project_Suggestion with a title between 3 and 150 characters, a description between 50 and 1000 characters, a list of between 1 and 10 unique non-empty demonstrated skills where each skill is between 1 and 50 non-whitespace characters, a Difficulty_Level of one of Beginner, Intermediate, or Advanced, and an estimated effort expressed in whole hours between 1 and 500
3. WHERE a user includes an optional list of between 1 and 10 focus skills where each focus skill is between 1 and 50 non-whitespace characters, THE Project_Generator_Service SHALL produce Project_Suggestions whose combined demonstrated skills include at least one of the provided focus skills
4. IF a user submits a project generation request with a Target_Role shorter than 2 non-whitespace characters or longer than 100 characters, THEN THE Upskilling_Module SHALL reject the request with a validation error indicating the accepted Target_Role length range
5. IF a user submits a project generation request whose focus skills list contains more than 10 entries or any focus skill shorter than 1 non-whitespace character or longer than 50 characters, THEN THE Upskilling_Module SHALL reject the request with a validation error indicating the accepted focus skill count and length range
6. IF the Upskilling_AI_Provider fails, times out, or returns output that does not satisfy the expected schema, THEN THE Upskilling_Module SHALL return an AI provider error indicating that generation failed and that the user should retry

### Requirement 2: Project Suggestion Persistence and Management

**User Story:** As a job seeker, I want to save and revisit generated project suggestions, so that I can track which portfolio projects I plan to build.

#### Acceptance Criteria

1. WHEN a user saves a Project_Suggestion, THE Upskilling_Module SHALL persist the Project_Suggestion as a record owned by the requesting user, including its Target_Role, title, description, demonstrated skills, Difficulty_Level, estimated effort, and a creation timestamp, and SHALL return the persisted record including a unique identifier
2. WHEN a user requests their saved Project_Suggestions, THE Upskilling_Module SHALL return only Project_Suggestions owned by the requesting user, sorted by creation timestamp in descending order and, for records sharing the same creation timestamp, by unique identifier in ascending order
3. WHEN a user requests their saved Project_Suggestions and owns no Project_Suggestions, THE Upskilling_Module SHALL return an empty list
4. WHEN a user requests deletion of a saved Project_Suggestion that they own, THE Upskilling_Module SHALL remove the record and return a success response with an empty data payload
5. IF a user requests or deletes a Project_Suggestion that does not exist or is not owned by the requesting user, THEN THE Upskilling_Module SHALL return a not-found error
6. IF a user submits a save request whose title, description, demonstrated skills, Difficulty_Level, or estimated effort falls outside the bounds defined in Requirement 1, THEN THE Upskilling_Module SHALL reject the request with a validation error indicating the offending field and its accepted range, and SHALL persist no record
7. THE Upskilling_Module SHALL associate every persisted Project_Suggestion with exactly one Owner

### Requirement 3: Career Goal Roadmap Generation

**User Story:** As a career changer, I want a step-by-step roadmap from my current role to my target role, so that I have a clear, time-bound plan for my transition.

#### Acceptance Criteria

1. WHEN a user submits a roadmap generation request with a current role between 2 and 100 non-whitespace characters, a Target_Role between 2 and 100 non-whitespace characters, and a target duration in whole months between 1 and 36, THE Roadmap_Service SHALL generate a Career_Roadmap containing between 3 and 12 ordered Milestones and return the result within 20 seconds
2. THE Roadmap_Service SHALL assign each generated Milestone a unique sequence position starting at 1 and increasing by 1 with no gaps, so that the Milestones form a contiguous ordered sequence
3. THE Roadmap_Service SHALL produce each Milestone with a title between 1 and 150 non-whitespace characters, a description between 20 and 1000 characters, a list of between 0 and 10 unique associated skills where each skill is between 1 and 50 non-whitespace characters, and an estimated duration in whole weeks between 1 and 156
4. THE Roadmap_Service SHALL produce a Career_Roadmap whose Milestones' combined estimated duration in weeks is greater than 0 and at most 156
5. IF a user submits a roadmap generation request with a target duration that is not a whole number or is outside the range of 1 to 36 months, OR with a current role or Target_Role shorter than 2 non-whitespace characters or longer than 100 characters, THEN THE Upskilling_Module SHALL reject the request with a validation error indicating the offending field and its accepted range, and SHALL generate no Career_Roadmap
6. IF the Upskilling_AI_Provider fails, exceeds 20 seconds, or returns output that does not satisfy the expected schema, THEN THE Upskilling_Module SHALL return an AI provider error indicating that roadmap generation failed and that the user should retry, and SHALL persist no partial Career_Roadmap

### Requirement 4: Career Roadmap Persistence and Milestone Tracking

**User Story:** As a career changer, I want to save my roadmap and mark milestones complete, so that I can track my progress toward my target role over time.

#### Acceptance Criteria

1. WHEN a user saves a generated Career_Roadmap, THE Upskilling_Module SHALL persist the Career_Roadmap and its Milestones as records owned by the requesting user, including the current role, Target_Role, target duration in whole months, and a creation timestamp, preserving the generated Milestone count and contiguous sequence ordering
2. THE Upskilling_Module SHALL persist each Milestone with a completion state that defaults to not completed and a completion timestamp that defaults to empty
3. WHEN a user requests their saved Career_Roadmaps, THE Upskilling_Module SHALL return only Career_Roadmaps owned by the requesting user, sorted by creation timestamp in descending order
4. WHEN a user marks an owned Milestone whose completion state is not completed as completed, THE Upskilling_Module SHALL set that Milestone's completion state to completed and record the completion timestamp
5. WHEN a user marks an owned Milestone that is already completed as completed, THE Upskilling_Module SHALL leave that Milestone's completion state and completion timestamp unchanged
6. WHEN a user marks an owned completed Milestone as not completed, THE Upskilling_Module SHALL set that Milestone's completion state to not completed and clear the completion timestamp
7. WHEN a user views an owned Career_Roadmap, THE Upskilling_Module SHALL return the count of completed Milestones, which is between 0 and the total Milestone count, and the total Milestone count for that Career_Roadmap
8. IF a user requests, updates, or deletes a Career_Roadmap or Milestone that does not exist or is not owned by the requesting user, THEN THE Upskilling_Module SHALL return a not-found error and SHALL leave the targeted record unchanged
9. WHEN a user deletes an owned Career_Roadmap, THE Upskilling_Module SHALL remove the Career_Roadmap and all of its associated Milestones and return a success response with an empty data payload

### Requirement 5: Course and Certificate Finding

**User Story:** As a learner, I want course and certificate recommendations for a given skill or topic, so that I can find concrete learning resources to close my skill gaps.

#### Acceptance Criteria

1. WHEN a user submits a course search with a query between 2 and 100 non-whitespace characters, THE Course_Finder_Service SHALL query at least one Learning_Platform_API and return a list of between 0 and 50 normalized Course_Recommendations within 15 seconds
2. THE Course_Finder_Service SHALL produce each Course_Recommendation with a title between 1 and 200 characters, a provider name between 1 and 100 characters, a URL using the HTTPS scheme, and a cost classification of one of Free or Paid
3. WHERE a user applies a cost filter of Free or Paid, THE Course_Finder_Service SHALL return only Course_Recommendations matching the selected cost classification
4. WHEN the Course_Finder_Service receives Course_Recommendations from more than one Learning_Platform_API source, THE Course_Finder_Service SHALL exclude duplicate recommendations that share the same normalized URL
5. WHEN no Course_Recommendations match the submitted query and filters, THE Course_Finder_Service SHALL return an empty list
6. IF a user submits a course search with a query shorter than 2 non-whitespace characters or longer than 100 non-whitespace characters, THEN THE Upskilling_Module SHALL reject the request with a validation error indicating the accepted query length range
7. IF a Learning_Platform_API is unavailable, returns an error, or exceeds its per-source response timeout of 10 seconds, THEN THE Course_Finder_Service SHALL exclude that source from the results and return recommendations from any remaining sources
8. IF every queried Learning_Platform_API is unavailable, returns an error, or exceeds its per-source response timeout of 10 seconds, THEN THE Upskilling_Module SHALL return an error indicating that course recommendations are temporarily unavailable and that the user should retry
9. THE Course_Finder_Service SHALL return Course_Recommendations in a deterministic order: Free recommendations before Paid recommendations, and within the same cost classification by title in case-insensitive ascending order

### Requirement 6: Saved Course Management

**User Story:** As a learner, I want to bookmark courses I find, so that I can return to my chosen learning resources later.

#### Acceptance Criteria

1. WHEN a user saves a Course_Recommendation whose title is between 1 and 150 characters, whose provider name is between 1 and 100 characters, whose URL uses the HTTPS scheme and is at most 2048 characters, and whose cost classification is one of Free or Paid, THE Upskilling_Module SHALL persist it as a Saved_Course owned by the requesting user, including its title, provider name, URL, cost classification, and a creation timestamp
2. IF a user submits a save request that is missing a title, provider name, URL, or cost classification, OR whose URL does not use the HTTPS scheme, OR whose cost classification is not one of Free or Paid, OR whose title, provider name, or URL exceeds its maximum length, THEN THE Upskilling_Module SHALL reject the request with a validation error indicating the offending field and its accepted value or length range, and SHALL persist no record
3. WHEN a user requests their Saved_Courses, THE Upskilling_Module SHALL return only Saved_Courses owned by the requesting user, sorted by creation timestamp in descending order and, for records sharing the same creation timestamp, by URL in ascending order
4. IF a user attempts to save a Course_Recommendation whose normalized URL already exists among that user's Saved_Courses, THEN THE Upskilling_Module SHALL reject the request with a conflict error indicating the course is already saved, and SHALL leave the existing Saved_Course unchanged
5. WHEN a user requests deletion of a Saved_Course that they own, THE Upskilling_Module SHALL remove the record and return a success response with an empty data payload
6. IF a user requests deletion of a Saved_Course that does not exist or is not owned by the requesting user, THEN THE Upskilling_Module SHALL return a not-found error

### Requirement 7: Module Authentication and Ownership Isolation

**User Story:** As a platform user, I want my upskilling data protected and scoped to my account, so that no other user can read or modify my projects, roadmaps, or saved courses.

#### Acceptance Criteria

1. IF a request to any `/api/v1/upskilling/*` route omits the Authorization header or supplies a malformed Bearer token, THEN THE Upskilling_Module SHALL reject the request with an authentication error before any controller logic runs, SHALL NOT read or modify any persisted data, and SHALL indicate to the caller that authentication failed
2. IF a request to any `/api/v1/upskilling/*` route supplies a Bearer token that is expired or fails signature verification, THEN THE Upskilling_Module SHALL reject the request with an authentication error before any controller logic runs, SHALL NOT read or modify any persisted data, and SHALL indicate to the caller that authentication failed
3. THE Upskilling_Module SHALL access all `upskilling_` database tables through the per-request JWT-scoped Supabase client so Row Level Security enforces per-Owner access
4. WHEN an authenticated user performs a read, update, or delete operation referencing a persisted record owned by a different user, THE Upskilling_Module SHALL return a not-found error rather than an authorization error, SHALL leave the targeted record unchanged, so the existence of other users' records is not revealed
5. WHEN an authenticated user creates an `upskilling_` record, THE Upskilling_Module SHALL set the record's Owner to the authenticated user's identity derived from the verified JWT
6. THE Upskilling_Module SHALL enable Row Level Security on every `upskilling_` table

### Requirement 8: Upskilling Module Navigation

**User Story:** As a user, I want tab-based navigation within the Upskilling module, so that I can switch between the project generator, career roadmap, and course finder.

#### Acceptance Criteria

1. THE Upskilling_Module SHALL provide three in-page tabs displayed in left-to-right order: Projects, Roadmap, and Courses
2. WHEN a user selects a tab, THE Upskilling_Module SHALL, within 300 milliseconds and without a full page reload, display only the selected tab's sub-feature content and hide the previously active tab's content
3. THE Upskilling_Module SHALL visually indicate the currently active tab using a bottom border in the primary purple color, while the two inactive tabs display no bottom border
4. WHEN the Upskilling module is loaded, THE Upskilling_Module SHALL display the Projects tab as the default active view with its content visible and the Roadmap and Courses content hidden
5. THE Upskilling_Module SHALL ensure that exactly one of the three tabs is in the active state at any time
6. WHILE keyboard focus is on one of the three tabs, THE Upskilling_Module SHALL render a visible focus indicator on the focused tab that is distinct from the active-tab bottom border
7. WHEN a tab has keyboard focus and the user presses the Enter or Space key, THE Upskilling_Module SHALL activate the focused tab and display its corresponding sub-feature content
