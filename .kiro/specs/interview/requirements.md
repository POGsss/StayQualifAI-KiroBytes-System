# Requirements Document

## Introduction

This document specifies the requirements for **Module 2: Interview** of the StayQualifAI platform. The Interview module provides AI-powered interview preparation and coaching for job seekers. It comprises three connected capabilities:

1. **Custom Interview Simulator** — Generate a tailored set of interview questions driven by the user's resume and a target job description, across four difficulty tiers: Entry, Mid, Senior, and Lead. Users conduct a timed mock interview session by submitting text answers and receiving AI-evaluated feedback per question.
2. **Interview Performance Scorecard** — After a completed session, produce a multi-dimensional scorecard grading the candidate on answer quality, grammar and communication, response latency, and pressure handling. Each dimension yields a numeric score and a pass/fail tier indicator.
3. **Interview Story Organizer** — A STAR-framework (Situation, Task, Action, Result) scratchpad where users compose, save, and retrieve structured stories that can be referenced during and after interview sessions.

The module follows the platform architecture: an Express.js + TypeScript backend exposing `/api/v1/interview/*` endpoints through a Route → Controller → Service → Supabase flow, a React + TypeScript frontend that accesses data only through service files (`interview.service.ts`) and a Zustand store (`interview.store.ts`), PostgreSQL storage via Supabase with Row Level Security on every table (tables prefixed `interview_`), and Google Gemini (free tier) for question generation, answer evaluation, and coaching feedback.

This specification defines the requirements only. Design and implementation tasks are produced in later phases after user review and approval.

---

## Glossary

- **Interview_Module**: The complete Module 2 feature set covering the Simulator, Scorecard, and STAR Organizer.
- **Interview_API**: The Express.js backend service exposing endpoints under `/api/v1/interview/*`.
- **Question_Generator**: The backend component that uses the AI_Provider to produce interview questions tailored to a Structured_Resume and a Job_Description at a specified Difficulty_Tier.
- **Answer_Evaluator**: The backend component that uses the AI_Provider to score and provide textual feedback on a candidate's answer to a specific Interview_Question.
- **Scorecard_Engine**: The backend component that aggregates per-question evaluations for a completed Interview_Session into a multi-dimensional Performance_Scorecard.
- **STAR_Organizer**: The backend and frontend components that manage STAR_Story records for an Authenticated_User.
- **AI_Provider**: Google Gemini (free tier), accessed exclusively by the backend for question generation, answer evaluation, and feedback synthesis.
- **Interview_Session**: A persisted record representing one mock interview run, owned by a single Authenticated_User. It holds the configuration (resume reference, job description, difficulty tier), the ordered list of Interview_Questions, the user's submitted answers, and its Lifecycle_State.
- **Interview_Question**: A single question generated for an Interview_Session, identified by its position (1-based index) within that session.
- **Candidate_Answer**: The text submitted by an Authenticated_User in response to a specific Interview_Question within an active Interview_Session.
- **Answer_Evaluation**: The AI-produced assessment of a Candidate_Answer, containing a numeric Quality_Score (0–100), a Grammar_Score (0–100), and a textual Feedback_Comment.
- **Performance_Scorecard**: The aggregated result of a completed Interview_Session containing four dimension scores: Answer_Quality_Score (0–100), Grammar_Score (0–100), Latency_Score (0–100), and Pressure_Score (0–100), plus an Overall_Score (0–100) and a Pass_Fail_Tier.
- **Pass_Fail_Tier**: A categorical label derived from Overall_Score: `PASS` when Overall_Score ≥ 70, `FAIL` when Overall_Score < 70.
- **Difficulty_Tier**: One of four enumerated values — `ENTRY`, `MID`, `SENIOR`, `LEAD` — specifying the seniority level of generated questions.
- **Lifecycle_State**: The current state of an Interview_Session, one of: `PENDING` (created, not yet started), `ACTIVE` (questions generated, answering in progress), `COMPLETED` (all answers submitted), or `SCORED` (scorecard computed).
- **Question_Count**: The number of questions in a session, a positive integer between 5 and 15 inclusive (user-configurable at session creation).
- **Response_Latency**: The elapsed time in seconds between the moment a question is first presented to the user and the moment the user submits an answer, measured and stored per question.
- **Pressure_Handling**: A composite assessment of how well the candidate maintained answer quality and grammar as question difficulty or topic complexity increased across the session.
- **STAR_Story**: A structured record with four non-empty text fields — `situation`, `task`, `action`, and `result` — plus a `title` string, owned by a single Authenticated_User.
- **Structured_Resume**: The canonical resume content representation as defined in Module 1 (Resume). The Interview module reads resume content by reference to the Resume module's data; it does not import Resume module code.
- **Job_Description**: User-supplied plain text (1–5 000 characters) describing the target role, used by the Question_Generator.
- **API_Response**: The standard backend response envelope `{ data, error, meta }`.
- **Interview_Store**: The Supabase PostgreSQL persistence layer using tables prefixed `interview_` with Row Level Security enabled on every table.
- **Authenticated_User**: A user with a valid Supabase authentication session interacting with the Interview_Module.

---

## Requirements

### Requirement 1: Interview Session Creation

**User Story:** As a job seeker, I want to create a new interview session by selecting a difficulty tier, providing a job description, and optionally referencing my resume, so that the simulator can generate role-relevant questions at the right seniority level.

#### Acceptance Criteria

1. WHEN an Authenticated_User submits a session-creation request with a valid Difficulty_Tier, a Job_Description of 1–5 000 characters, and a Question_Count between 5 and 15 inclusive, THE Interview_API SHALL create a new Interview_Session in `PENDING` state and return a session record in the `data` field of an API_Response containing the session identifier, Lifecycle_State (`PENDING`), Difficulty_Tier, Job_Description, Question_Count, and creation timestamp.
2. IF an Authenticated_User includes a resume reference in the session-creation request and that resume exists and is owned by the requesting user, THEN THE Interview_API SHALL store that reference on the Interview_Session so the Question_Generator can use it during question generation.
3. IF the session-creation request omits the Difficulty_Tier, THEN THE Interview_API SHALL reject the request and return an API_Response with an error identifying `difficulty_tier` as required.
4. IF the session-creation request omits or provides an empty Job_Description, THEN THE Interview_API SHALL reject the request and return an API_Response with an error identifying `job_description` as required.
5. IF the Job_Description exceeds 5 000 characters, THEN THE Interview_API SHALL reject the request and return an API_Response with an error stating the maximum length.
6. IF the session-creation request provides a Difficulty_Tier value other than `ENTRY`, `MID`, `SENIOR`, or `LEAD`, THEN THE Interview_API SHALL reject the request and return an API_Response with an error listing the valid values.
7. IF the session-creation request provides a Question_Count outside the range 5–15 inclusive, THEN THE Interview_API SHALL reject the request and return an API_Response with an error stating the valid range.
8. IF the session-creation request omits the Question_Count, THEN THE Interview_API SHALL reject the request and return an API_Response with an error identifying `question_count` as required.
9. IF the session-creation request includes a resume reference that does not exist or is not owned by the requesting Authenticated_User, THEN THE Interview_API SHALL reject the request and return an API_Response with a not-found error identifying the invalid resume reference.

---

### Requirement 2: Interview Question Generation

**User Story:** As a job seeker, I want the simulator to generate tailored interview questions from my resume and job description at my chosen difficulty tier, so that the practice is relevant to the specific role and level I am targeting.

#### Acceptance Criteria

1. WHEN an Authenticated_User starts an Interview_Session in `PENDING` state, THE Question_Generator SHALL call the AI_Provider with the Job_Description, the Difficulty_Tier, the Question_Count, and (where present) the Structured_Resume content, and SHALL generate exactly the requested Question_Count of Interview_Questions; IF the AI_Provider returns a count of questions that does not equal the requested Question_Count, THEN THE Question_Generator SHALL treat the response as an AI_Provider error, leave the session in `PENDING` state, and return an API_Response with an error indicating question generation failed.
2. WHEN the Question_Generator produces the correct Question_Count of Interview_Questions, THE Interview_API SHALL store all questions in the Interview_Store ordered by their 1-based position index, transition the Interview_Session to `ACTIVE` state, and return the list of Interview_Questions ordered by position index in the `data` field of an API_Response.
3. THE Question_Generator SHALL produce questions appropriate to the specified Difficulty_Tier: `ENTRY` questions SHALL target foundational concepts, `MID` questions SHALL target applied problem-solving, `SENIOR` questions SHALL target systems design and leadership, and `LEAD` questions SHALL target strategic decision-making and cross-functional impact.
4. IF the AI_Provider is unavailable, returns an error, or does not respond within 30 seconds during question generation, THEN THE Question_Generator SHALL leave the Interview_Session in `PENDING` state, SHALL NOT persist partial question sets, and SHALL return an API_Response with an error indicating question generation failed.
5. IF an Authenticated_User attempts to start an Interview_Session that is not in `PENDING` state, THEN THE Interview_API SHALL reject the request and return an API_Response with an error stating the current Lifecycle_State of the session.
6. WHEN the Question_Generator stores Interview_Questions, each question SHALL have non-empty text, and no two questions in the same session SHALL have identical text; IF the AI_Provider returns any empty or duplicate question text, THEN THE Question_Generator SHALL treat the response as an AI_Provider error per Criterion 4.

---

### Requirement 3: Answer Submission

**User Story:** As a job seeker, I want to submit my text answer to each interview question during an active session, so that my responses are captured for evaluation and scoring.

#### Acceptance Criteria

1. WHEN an Authenticated_User submits a Candidate_Answer of 1–5 000 characters for an Interview_Question in an `ACTIVE` Interview_Session, THE Interview_API SHALL persist the Candidate_Answer and the Response_Latency (a non-negative number of seconds from question presentation to submission) in the Interview_Store.
2. WHEN the Interview_API successfully persists a Candidate_Answer, THE Interview_API SHALL return the updated question record including the stored answer text and Response_Latency in the `data` field of an API_Response.
3. IF a submitted Candidate_Answer is empty, contains only whitespace, or exceeds 5 000 characters, THEN THE Interview_API SHALL reject the submission and return an API_Response with an error indicating the answer content constraints.
4. IF an Authenticated_User submits an answer to a question that already has a Candidate_Answer stored, THEN THE Interview_API SHALL reject the submission and return an API_Response with an error indicating the question has already been answered.
5. WHEN a Candidate_Answer submission passes content validation (non-empty, within length, not previously answered), IF the Interview_Session is not in `ACTIVE` state, THEN THE Interview_API SHALL reject the submission and return an API_Response with an error stating the current Lifecycle_State and indicating the session must be active to accept answers.
6. IF an Authenticated_User submits an answer for a question that does not belong to their session, THEN THE Interview_API SHALL return an API_Response with a not-found error.
7. WHEN all Interview_Questions in an `ACTIVE` Interview_Session have received a Candidate_Answer, THE Interview_API SHALL transition the Interview_Session to `COMPLETED` state; IF the state transition fails due to a system error, THEN THE Interview_API SHALL treat the entire answer-submission operation as failed, SHALL return an API_Response with an error indicating the transition could not be completed, and SHALL leave the Interview_Session in `ACTIVE` state.

---

### Requirement 4: Per-Question Answer Evaluation

**User Story:** As a job seeker, I want AI feedback on each of my answers, so that I know specifically where each response was strong or weak.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests evaluation of a Candidate_Answer for a question in a `COMPLETED` or `SCORED` Interview_Session, THE Answer_Evaluator SHALL call the AI_Provider with the Interview_Question text and the Candidate_Answer text, and SHALL return an Answer_Evaluation containing a Quality_Score (integer 0–100), a Grammar_Score (integer 0–100), and a non-empty Feedback_Comment of 1–2 000 characters.
2. WHEN the AI_Provider returns a valid Answer_Evaluation, THE Answer_Evaluator SHALL store the Answer_Evaluation in the Interview_Store, associated with the specific Interview_Question, overwriting any previously stored Answer_Evaluation for that question.
3. IF an Authenticated_User requests evaluation for a question that has no Candidate_Answer, THEN THE Interview_API SHALL reject the request and return an API_Response with an error indicating no answer has been submitted for that question.
4. WHEN an Authenticated_User requests evaluation for a question in a session and the request is otherwise valid, IF the Interview_Session is in `PENDING` or `ACTIVE` state, THEN THE Interview_API SHALL reject the request and return an API_Response with an error indicating the session must be completed before evaluations can be requested.
5. IF the AI_Provider is unavailable or returns an error during evaluation, THEN THE Answer_Evaluator SHALL NOT persist a partial Answer_Evaluation and SHALL return an API_Response with an error indicating evaluation could not be completed.
6. IF the Candidate_Answer submitted for evaluation exceeds 5 000 characters, THEN THE Interview_API SHALL reject the evaluation request before calling the AI_Provider and return an API_Response with an error stating the answer length limit.

---

### Requirement 5: Interview Performance Scorecard

**User Story:** As a job seeker, I want a comprehensive performance scorecard after completing my mock interview, so that I know my overall performance across multiple dimensions.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests a scorecard for an Interview_Session in `COMPLETED` or `SCORED` state, THE Scorecard_Engine SHALL aggregate all Answer_Evaluations for that session and return the computed Performance_Scorecard in the `data` field of an API_Response.
2. THE Scorecard_Engine SHALL compute the Answer_Quality_Score as the arithmetic mean of all Quality_Scores across all Interview_Questions in the session, rounded to the nearest integer.
3. THE Scorecard_Engine SHALL compute the Grammar_Score as the arithmetic mean of all Grammar_Scores across all Interview_Questions in the session, rounded to the nearest integer.
4. THE Scorecard_Engine SHALL compute the Latency_Score as an integer between 0 and 100 using the following rule: responses submitted within 60 seconds score 100; responses submitted after 180 seconds or more score 0; responses between 60 and 180 seconds score linearly interpolated between 100 and 0, rounded to the nearest integer. The session Latency_Score is the mean of all per-question latency scores, rounded to the nearest integer.
5. WHEN computing the Pressure_Score, THE Scorecard_Engine SHALL call the AI_Provider with the ordered sequence of per-question Quality_Scores and Grammar_Scores (indexed by 1-based question position) and the instruction to assess whether performance was sustained or improved across the session; the AI_Provider SHALL return an integer between 0 and 100 where 100 means performance was fully sustained or improved throughout and 0 means performance consistently declined, with intermediate values linearly interpolated; THE Scorecard_Engine SHALL clamp the returned value to the integer range [0, 100].
6. THE Scorecard_Engine SHALL compute the Overall_Score as the arithmetic mean of Answer_Quality_Score, Grammar_Score, Latency_Score, and Pressure_Score, rounded to the nearest integer.
7. THE Scorecard_Engine SHALL set Pass_Fail_Tier to `PASS` when the Overall_Score is greater than or equal to 70, and to `FAIL` when the Overall_Score is less than 70.
8. WHEN the Scorecard_Engine successfully computes a Performance_Scorecard, THE Interview_API SHALL transition the Interview_Session to `SCORED` state and persist the scorecard in the Interview_Store.
9. IF an Authenticated_User requests a scorecard for a session in `PENDING` or `ACTIVE` state, THEN THE Interview_API SHALL reject the request and return an API_Response with an error stating the session must be completed before scoring.
10. IF the session has one or more Interview_Questions without an Answer_Evaluation, THEN THE Scorecard_Engine SHALL request evaluation for each unevaluated question before computing the scorecard; IF any evaluation fails, THEN THE Scorecard_Engine SHALL return an API_Response with an error identifying the failed question indices.
11. WHEN a Performance_Scorecard already exists for a `SCORED` session and the Authenticated_User requests the scorecard again, THE Interview_API SHALL return the existing scorecard without recomputing it.
12. IF the AI_Provider is unavailable or returns an error during Pressure_Score computation, THEN THE Scorecard_Engine SHALL NOT persist a partial Performance_Scorecard and SHALL return an API_Response with an error indicating scorecard computation could not be completed.
13. IF the Overall_Score computation fails or produces a value outside the integer range [0, 100], THEN THE Scorecard_Engine SHALL NOT set a Pass_Fail_Tier, SHALL NOT persist the Performance_Scorecard, and SHALL return an API_Response with an error indicating scorecard computation could not be completed.

---

### Requirement 6: Session Listing and Retrieval

**User Story:** As a job seeker, I want to list and review my past interview sessions and their scorecards, so that I can track my improvement over time.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests the list of their Interview_Sessions, THE Interview_API SHALL return all Interview_Sessions owned by that user ordered by creation date descending in the `data` field of an API_Response, where each entry includes the session identifier, Lifecycle_State, Difficulty_Tier, creation timestamp, and (if present) the Overall_Score and Pass_Fail_Tier from the associated Performance_Scorecard; IF the user has no sessions, THE Interview_API SHALL return an empty array in the `data` field.
2. WHEN an Authenticated_User requests a specific Interview_Session by its identifier, THE Interview_API SHALL return the full session record in the `data` field of an API_Response including the session configuration fields, the ordered list of Interview_Questions with their Candidate_Answers, Response_Latencies, and Answer_Evaluations where present, and the Performance_Scorecard if present.
3. IF an Authenticated_User requests a session that does not exist or is not owned by that user, THEN THE Interview_API SHALL return an API_Response with a not-found error.

---

### Requirement 7: STAR Story Creation

**User Story:** As a job seeker, I want to create structured STAR stories in a scratchpad, so that I have a personal library of ready-to-use interview answers following the Situation, Task, Action, Result framework.

#### Acceptance Criteria

1. WHEN an Authenticated_User submits a STAR_Story creation request with a non-empty `title`, a non-empty `situation`, a non-empty `task`, a non-empty `action`, and a non-empty `result`, THE STAR_Organizer SHALL persist the STAR_Story linked to the Authenticated_User's identity in the Interview_Store and return the created record in the `data` field of an API_Response containing `id`, `title`, `situation`, `task`, `action`, `result`, and `created_at`.
2. IF any of the five required fields (`title`, `situation`, `task`, `action`, `result`) are absent or contain only whitespace in a creation request, THEN THE Interview_API SHALL reject the request and return an API_Response with an error identifying every missing or blank field.
3. IF the `title` field exceeds 200 characters, THEN THE Interview_API SHALL stop validation at this first error, reject the request without checking the remaining fields, and return an API_Response with an error stating the maximum length.
4. THE Interview_API SHALL validate that none of the four STAR fields (`situation`, `task`, `action`, `result`) individually exceed 2 000 characters as an unconditional precondition of persistence, such that no STAR_Story with oversized field content is ever persisted; IF any of the four STAR fields individually exceed 2 000 characters, THEN THE Interview_API SHALL reject the request and return an API_Response with an error identifying each field that exceeds the limit.
5. IF the Authenticated_User already owns a STAR_Story with the same `title` (exact character match), THEN THE Interview_API SHALL reject the creation request and return an API_Response with a conflict error stating that a story with that title already exists.

---

### Requirement 8: STAR Story Retrieval and Listing

**User Story:** As a job seeker, I want to list and view my saved STAR stories, so that I can reference them when preparing for or reflecting on interviews.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests the list of their STAR_Stories, THE STAR_Organizer SHALL return all STAR_Stories owned by that user ordered by creation date descending in the `data` field of an API_Response; IF the user owns no STAR_Stories, THE STAR_Organizer SHALL return an empty array in the `data` field.
2. WHEN an Authenticated_User requests a specific STAR_Story by its identifier, THE STAR_Organizer SHALL return the full STAR_Story record in the `data` field of an API_Response including the `id`, `title`, `situation`, `task`, `action`, `result`, and `created_at` fields.
3. IF an Authenticated_User requests a STAR_Story that does not exist or is not owned by that user, THEN THE Interview_API SHALL return an API_Response with a not-found error.

---

### Requirement 9: STAR Story Update

**User Story:** As a job seeker, I want to update my STAR stories, so that I can refine my narratives as my experience evolves.

#### Acceptance Criteria

1. WHEN an Authenticated_User submits an update request for an existing STAR_Story supplying one or more of the fields `title`, `situation`, `task`, `action`, or `result`, THE STAR_Organizer SHALL update only the supplied fields, preserve all other fields unchanged, and return the updated record in the `data` field of an API_Response.
2. WHERE an update request supplies one or more of the five updatable fields, IF any supplied field value is an empty string or contains only whitespace, THEN THE Interview_API SHALL reject the request and return an API_Response with an error identifying each supplied field that is blank.
3. IF a supplied `title` in an update request exceeds 200 characters, THEN THE Interview_API SHALL reject the request and return an API_Response with an error stating the maximum length.
4. IF any supplied STAR field in an update request exceeds 2 000 characters, THEN THE Interview_API SHALL reject the request and return an API_Response with an error identifying each field that exceeds the limit.
5. IF an Authenticated_User attempts to update a STAR_Story that does not exist or is not owned by that user, THEN THE Interview_API SHALL return an API_Response with a not-found error.
6. IF an update request body supplies none of the five updatable fields (`title`, `situation`, `task`, `action`, `result`), THEN THE Interview_API SHALL reject the request and return an API_Response with an error indicating at least one field must be supplied.

---

### Requirement 10: STAR Story Deletion

**User Story:** As a job seeker, I want to delete STAR stories I no longer need, so that my library stays organized.

#### Acceptance Criteria

1. WHEN an Authenticated_User deletes a STAR_Story that they own and the deletion succeeds, THE STAR_Organizer SHALL remove the STAR_Story from the Interview_Store such that a subsequent GET request for that story's identifier returns a not-found error, and THE Interview_API SHALL return an API_Response with a null `data` field and a null `error` field.
2. IF a STAR_Story deletion fails due to a system error such as a database failure, THEN THE Interview_API SHALL return an API_Response with the `error` field populated with a typed error object and the `data` field set to null, and the STAR_Story SHALL remain retrievable in the Interview_Store.
3. IF an Authenticated_User attempts to delete a STAR_Story that does not exist or is not owned by that user, THEN THE Interview_API SHALL return an API_Response with a not-found error.

---

### Requirement 11: STAR Story Round-Trip Integrity

**User Story:** As a job seeker, I want my STAR story content stored and reloaded without changes, so that I can trust the platform preserves my narratives accurately.

#### Acceptance Criteria

1. WHEN the STAR_Organizer persists a STAR_Story, it SHALL serialize all five fields (`title`, `situation`, `task`, `action`, `result`) to the Interview_Store without modification to their character content, length, or encoding.
2. WHEN the STAR_Organizer retrieves a stored STAR_Story, it SHALL deserialize the stored representation back into a STAR_Story object whose five fields are character-for-character identical to the values that were originally submitted, with no trimming, encoding mutation, or truncation applied to any field.
3. IF the stored representation of a STAR_Story is malformed or cannot be deserialized into a valid STAR_Story object, THEN THE STAR_Organizer SHALL return an error indicating the content could not be deserialized.

---

### Requirement 12: Data Ownership and Access Control

**User Story:** As a job seeker, I want all my interview data to be private to me, so that no other user can read, modify, or delete it.

#### Acceptance Criteria

1. THE Interview_Store SHALL enforce Row Level Security on every `interview_` table using a `user_id` column such that each Authenticated_User can read and write only rows where `user_id` equals `auth.uid()`; a query executed under a different user's JWT SHALL return zero rows for any row owned by a different user.
2. IF a database query against any `interview_` table is executed by a user whose JWT does not match the `user_id` of the target row, THEN the Interview_Store RLS policy SHALL deny access and return zero rows for that query.
3. WHEN an unauthenticated request is made to any `/api/v1/interview/*` endpoint, THE Interview_API SHALL reject the request and return an API_Response with an authentication error.
4. WHEN an Authenticated_User requests any resource (session, question, scorecard, STAR story) owned by a different user via read, write, or delete operation, THE Interview_API SHALL return an API_Response with a not-found error and SHALL leave the target resource unmodified.
5. WHEN an Authenticated_User submits any request to a `/api/v1/interview/*` endpoint, THE Interview_API SHALL validate the request body, path parameters, and query parameters before processing.
6. IF any request parameter fails validation — including missing required fields, wrong data types, or out-of-range values — THEN THE Interview_API SHALL reject the request and return an API_Response with a validation error identifying each invalid parameter.

---

### Requirement 13: Consistent API Response Envelope

**User Story:** As a frontend developer, I want every interview endpoint to return a consistent response shape, so that the `interview.service.ts` client can handle results and errors uniformly.

#### Acceptance Criteria

1. THE Interview_API SHALL return every response in the API_Response envelope shape `{ data, error, meta }` where exactly one of `data` or `error` is non-null at any time; on single-resource responses `meta` SHALL be null; on list responses `meta` SHALL contain a `total` integer representing the total count of items in the list.
2. WHEN a request succeeds, THE Interview_API SHALL populate the `data` field with the result payload and set the `error` field to null.
3. IF a request fails, THEN THE Interview_API SHALL populate the `error` field with a typed error object containing a `code` string identifying the error category and a `message` string describing the failure reason, and set the `data` field to null.
4. THE Interview_API SHALL return HTTP status code 200 for successful read and update responses, 201 for successful resource creation, 400 for validation errors, 401 for authentication errors, 404 for not-found and cross-user access errors, 409 for conflict errors, and 500 for unexpected server errors including AI_Provider failures.

---

### Requirement 14: Frontend Interview State Management

**User Story:** As a frontend developer, I want a Zustand store and a service file for the Interview module, so that all interview state is managed consistently and all data flows through the backend API.

#### Acceptance Criteria

1. THE Interview_Module frontend SHALL expose a single Zustand store (`interview.store.ts`) that holds the active Interview_Session, the list of Interview_Sessions, the current Performance_Scorecard, the list of STAR_Stories, an `isLoading` boolean indicating whether an async operation is in progress, and a nullable `error` field holding the last error, as its state.
2. THE Interview_Module frontend SHALL expose a service file (`interview.service.ts`) that actively contains and uses an API-calling function for every `/api/v1/interview/*` endpoint; a service file that exists but contains no API-calling functions SHALL be considered non-compliant; no other frontend file — including `interview.store.ts` — SHALL call those endpoints directly.
3. IF any frontend file in the Interview_Module imports `@supabase/supabase-js` or calls the Supabase client directly, THEN that file SHALL be considered non-conformant; all interview data access SHALL go through `interview.service.ts` exclusively.
4. WHEN an action in `interview.store.ts` is invoked, THE store SHALL set `isLoading` to true and `error` to null before calling `interview.service.ts`; on success THE store SHALL update the relevant state slice and set `isLoading` to false; on failure THE store SHALL set `error` to the received error, set `isLoading` to false, and preserve the existing state data unchanged.
5. THE Interview_Module frontend SHALL be composed only from pages under `frontend/src/pages/Interview/` and components under `frontend/src/components/`; it SHALL NOT import files from `frontend/src/pages/Resume/`, `frontend/src/pages/JobSearch/`, `frontend/src/pages/Upskilling/`, or `frontend/src/pages/Benchmarking/`.
