# Requirements Document

## Introduction

This document specifies the requirements for **Module 1: Resume** of the StayQualifAI platform — the first module in a phased, module-by-module build. The Resume module helps job seekers create, optimize, and manage targeted resume variants. It comprises three connected capabilities:

1. **ATS Resume Scanner & Keyword Optimizer** — Upload a resume (.pdf/.docx) and an optional job description, then receive an ATS compatibility score (0–100%) and keyword suggestions.
2. **AI Resume Builder with Job Matcher** — Build a resume from ATS-parseable templates, analyze semantic match against a job description, and generate achievement bullets in the X-Y-Z format.
3. **Resume Version Snapshot Manager** — Clone, rename, and switch between targeted resume variants so a user can tailor resumes per job application.

The module follows the platform architecture: an Express.js + TypeScript backend exposing `/api/v1/resume/*` endpoints through a Route → Controller → Service → Supabase flow, a React + TypeScript frontend that accesses data only through service files, PostgreSQL storage via Supabase with Row Level Security on every table (tables prefixed `resume_`), and Google Gemini (free tier) for AI generation and analysis.

This specification defines the requirements only. Design and implementation tasks are produced in later phases after user review and approval.

## Glossary

- **Resume_Module**: The complete Module 1 feature set covering scanning, building, and version management.
- **Resume_API**: The Express.js backend service exposing endpoints under `/api/v1/resume/*`.
- **Resume_Parser**: The backend component that extracts structured resume content from uploaded `.pdf` and `.docx` files.
- **Resume_Serializer**: The backend component that converts a structured resume between its stored representation and its in-memory object representation.
- **ATS_Scanner**: The backend component that computes an ATS compatibility score and keyword suggestions for a resume against an optional job description.
- **Resume_Builder**: The frontend and backend components that let a user compose a resume from ATS-parseable templates.
- **Job_Matcher**: The backend component that performs semantic match analysis between a resume and a job description using the AI_Provider.
- **Bullet_Generator**: The backend component that generates achievement statements in X-Y-Z format using the AI_Provider.
- **Version_Manager**: The backend and frontend components that clone, rename, switch, and list resume variants.
- **AI_Provider**: Google Gemini (free tier), accessed by the backend for generation and semantic analysis.
- **Resume_Store**: The Supabase PostgreSQL persistence layer using tables prefixed `resume_` with Row Level Security enabled.
- **Authenticated_User**: A user with a valid Supabase authentication session interacting with the Resume_Module.
- **ATS_Score**: An integer from 0 to 100 (inclusive) representing resume-to-job compatibility, where higher values indicate stronger compatibility.
- **Compatibility_Score**: Synonym for ATS_Score used in the context of ATS scanning.
- **Match_Score**: An integer from 0 to 100 (inclusive) representing semantic alignment between a resume and a job description.
- **Job_Description**: User-supplied text describing a target role used by the ATS_Scanner, Job_Matcher, and Bullet_Generator.
- **Resume_Version**: A stored, named snapshot of a resume's structured content owned by a single Authenticated_User.
- **Structured_Resume**: The canonical structured representation of a resume's content (contact, summary, experience, education, skills, and additional sections).
- **X_Y_Z_Bullet**: An achievement statement of the form "Accomplished [X] as measured by [Y] by doing [Z]".
- **Keyword_Suggestion**: A recommended term derived from a Job_Description that is absent from or under-represented in a resume.
- **API_Response**: The standard backend response envelope of shape `{ data, error, meta }`.
- **Supported_File**: An uploaded file with extension `.pdf` or `.docx` within the configured maximum file size.

## Requirements

### Requirement 1: Resume File Upload and Parsing

**User Story:** As a job seeker, I want to upload my existing resume as a PDF or Word document, so that the platform can read its content and analyze it.

#### Acceptance Criteria

1. WHEN an Authenticated_User submits a Supported_File to the upload endpoint, THE Resume_Parser SHALL extract the resume content into a Structured_Resume.
2. IF an uploaded file has an extension other than `.pdf` or `.docx`, THEN THE Resume_API SHALL reject the upload and return an API_Response with an error describing the unsupported file type.
3. IF an uploaded file exceeds the configured maximum file size, THEN THE Resume_API SHALL reject the upload and return an API_Response with an error describing the size limit.
4. IF an uploaded `.pdf` or `.docx` file cannot be parsed, THEN THE Resume_Parser SHALL return an API_Response with an error indicating the file could not be parsed.
5. WHEN the Resume_Parser produces a Structured_Resume, THE Resume_API SHALL return the Structured_Resume in the `data` field of an API_Response.

### Requirement 2: Structured Resume Round-Trip Integrity

**User Story:** As a job seeker, I want my resume content to be stored and reloaded without changes, so that I can trust the platform preserves my information accurately.

#### Acceptance Criteria

1. THE Resume_Serializer SHALL convert a Structured_Resume into a stored representation suitable for the Resume_Store.
2. THE Resume_Serializer SHALL convert a stored representation back into a Structured_Resume.
3. WHEN a well-formed Structured_Resume is serialized and then deserialized, THE Resume_Serializer SHALL produce a Structured_Resume equivalent to the original (round-trip property).
4. IF a stored representation is malformed, THEN THE Resume_Serializer SHALL return an error indicating the content could not be deserialized.

### Requirement 3: ATS Compatibility Scoring

**User Story:** As a job seeker, I want an ATS compatibility score for my resume, so that I know how well it will pass automated screening.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests an ATS scan for a Structured_Resume, THE ATS_Scanner SHALL compute a Compatibility_Score between 0 and 100 inclusive.
2. WHERE a Job_Description is provided with the scan request, THE ATS_Scanner SHALL compute the Compatibility_Score relative to that Job_Description.
3. WHERE no Job_Description is provided with the scan request, THE ATS_Scanner SHALL compute the Compatibility_Score using ATS formatting and parseability criteria only.
4. WHEN the ATS_Scanner completes a scan, THE Resume_API SHALL return the Compatibility_Score and the contributing factors in the `data` field of an API_Response.
5. IF the Structured_Resume contains no extractable text content, THEN THE ATS_Scanner SHALL return a Compatibility_Score of 0 and an explanatory factor.

### Requirement 4: Keyword Optimization Suggestions

**User Story:** As a job seeker, I want keyword suggestions based on a job description, so that I can tailor my resume to the role.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests keyword optimization with a Structured_Resume and a Job_Description, THE ATS_Scanner SHALL return a list of Keyword_Suggestions that appear in the Job_Description and are absent from the Structured_Resume.
2. THE ATS_Scanner SHALL exclude from the Keyword_Suggestions any term already present in the Structured_Resume.
3. WHERE the Structured_Resume already contains every significant term in the Job_Description, THE ATS_Scanner SHALL return an empty list of Keyword_Suggestions.
4. IF the keyword optimization request omits a Job_Description, THEN THE Resume_API SHALL reject the request and return an API_Response with an error indicating a Job_Description is required.

### Requirement 5: AI Resume Building from ATS-Parseable Templates

**User Story:** As a job seeker, I want to build a resume from ATS-parseable templates, so that my resume is both well-structured and machine-readable.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests the available templates, THE Resume_API SHALL return the set of ATS-parseable templates in the `data` field of an API_Response.
2. WHEN an Authenticated_User creates a resume from a selected template, THE Resume_Builder SHALL produce a Structured_Resume populated with the template's section structure.
3. WHEN an Authenticated_User saves a built resume, THE Resume_API SHALL persist the Structured_Resume as a Resume_Version in the Resume_Store.
4. IF a required resume section is empty when the user saves, THEN THE Resume_API SHALL return an API_Response with an error identifying the missing section.

### Requirement 6: Semantic Job Match Analysis

**User Story:** As a job seeker, I want to see how well my resume semantically matches a job description, so that I can decide what to improve before applying.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests a match analysis with a Structured_Resume and a Job_Description, THE Job_Matcher SHALL compute a Match_Score between 0 and 100 inclusive using the AI_Provider.
2. WHEN the Job_Matcher completes an analysis, THE Resume_API SHALL return the Match_Score and the matched and missing concepts in the `data` field of an API_Response.
3. IF the match analysis request omits a Job_Description, THEN THE Resume_API SHALL reject the request and return an API_Response with an error indicating a Job_Description is required.
4. IF the AI_Provider is unavailable or returns an error, THEN THE Job_Matcher SHALL return an API_Response with an error indicating the analysis could not be completed.

### Requirement 7: X-Y-Z Achievement Bullet Generation

**User Story:** As a job seeker, I want the platform to rewrite my experience as X-Y-Z achievement bullets, so that my impact is clear and quantified.

#### Acceptance Criteria

1. WHEN an Authenticated_User submits an experience description for rewriting, THE Bullet_Generator SHALL return one or more X_Y_Z_Bullet statements using the AI_Provider.
2. THE Bullet_Generator SHALL format each generated bullet to include an accomplishment, a measurable outcome, and the action taken.
3. IF the submitted experience description is empty or contains only whitespace, THEN THE Resume_API SHALL reject the request and return an API_Response with an error indicating input is required.
4. IF the AI_Provider is unavailable or returns an error, THEN THE Bullet_Generator SHALL return an API_Response with an error indicating bullet generation could not be completed.

### Requirement 8: Resume Version Cloning

**User Story:** As a job seeker, I want to clone an existing resume version, so that I can create a tailored variant without altering the original.

#### Acceptance Criteria

1. WHEN an Authenticated_User clones a Resume_Version, THE Version_Manager SHALL create a new Resume_Version containing content equivalent to the source Resume_Version.
2. WHEN the Version_Manager clones a Resume_Version, THE Version_Manager SHALL assign the new Resume_Version a distinct identifier and leave the source Resume_Version unchanged.
3. IF an Authenticated_User attempts to clone a Resume_Version that does not exist or is not owned by that user, THEN THE Resume_API SHALL return an API_Response with a not-found error.

### Requirement 9: Resume Version Renaming

**User Story:** As a job seeker, I want to rename a resume version, so that I can identify which variant targets which role.

#### Acceptance Criteria

1. WHEN an Authenticated_User renames a Resume_Version with a non-empty name, THE Version_Manager SHALL update the name of that Resume_Version and preserve its content.
2. IF an Authenticated_User submits an empty or whitespace-only name, THEN THE Resume_API SHALL reject the request and return an API_Response with an error indicating a name is required.
3. IF an Authenticated_User attempts to rename a Resume_Version that does not exist or is not owned by that user, THEN THE Resume_API SHALL return an API_Response with a not-found error.

### Requirement 10: Resume Version Listing and Switching

**User Story:** As a job seeker, I want to list and switch between my resume versions, so that I can work on the variant relevant to a specific application.

#### Acceptance Criteria

1. WHEN an Authenticated_User requests the resume version list, THE Version_Manager SHALL return all Resume_Versions owned by that Authenticated_User.
2. WHEN an Authenticated_User selects a Resume_Version as active, THE Version_Manager SHALL record that Resume_Version as the active version for that Authenticated_User.
3. THE Version_Manager SHALL maintain at most one active Resume_Version per Authenticated_User at any time.
4. IF an Authenticated_User attempts to switch to a Resume_Version that does not exist or is not owned by that user, THEN THE Resume_API SHALL return an API_Response with a not-found error.

### Requirement 11: Data Ownership and Access Control

**User Story:** As a job seeker, I want my resume data to be private to me, so that no other user can read or modify it.

#### Acceptance Criteria

1. THE Resume_Store SHALL enforce Row Level Security so that each Authenticated_User can access only Resume_Versions that the user owns.
2. WHEN an unauthenticated request is made to any `/api/v1/resume/*` endpoint, THE Resume_API SHALL reject the request and return an API_Response with an authentication error.
3. WHEN an Authenticated_User requests a Resume_Version owned by a different user, THE Resume_API SHALL return an API_Response with a not-found error.
4. THE Resume_API SHALL validate the request body, path parameters, and query parameters of every endpoint before processing.

### Requirement 12: Consistent API Response Envelope

**User Story:** As a frontend developer, I want every endpoint to return a consistent response shape, so that the client can handle results and errors uniformly.

#### Acceptance Criteria

1. THE Resume_API SHALL return every response in the API_Response envelope shape `{ data, error, meta }`.
2. WHEN a request succeeds, THE Resume_API SHALL populate the `data` field and set the `error` field to null.
3. IF a request fails, THEN THE Resume_API SHALL populate the `error` field with a typed error and set the `data` field to null.
