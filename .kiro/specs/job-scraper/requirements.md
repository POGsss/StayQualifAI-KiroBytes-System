# Requirements Document

## Introduction

The Job Scraper feature extends StayQualifAI's existing Job Search module (Module 3) with resume-matched job discovery. It reads the authenticated user's latest resume version, extracts relevant skills, job titles, and keywords, then queries the SerpAPI Google Jobs endpoint to find matching job postings. Scraped results are ingested into the existing `jobsearch_listings` table using the established deduplication pipeline. The feature is triggered manually via a "Find Jobs" button on the Listings tab — it does not run automatically on page load — and respects SerpAPI's free-tier rate limit (100 searches/month) by minimizing redundant API calls.

## Glossary

- **Scraper_Service**: The backend service responsible for extracting search terms from the user's resume, querying SerpAPI, mapping results to the listing ingest schema, and delegating ingestion to the existing Listing_Service
- **Keyword_Extractor**: The component within Scraper_Service that reads an IStructuredResume and produces a ranked list of search queries (skills, job titles, and keywords)
- **SerpAPI_Client**: The HTTP client component that sends search queries to the SerpAPI Google Jobs endpoint and returns raw job result objects
- **Listing_Service**: The existing backend service that handles job listing storage, deduplication, and retrieval (already implemented)
- **Resume_Version**: A stored snapshot of the user's parsed resume containing structured sections (contact, summary, experience, education, skills)
- **Search_Query**: A single keyword or phrase derived from the user's resume, sent to SerpAPI as the `q` parameter
- **Scrape_Result**: A single job posting object returned by SerpAPI, containing title, company, location, description, and metadata
- **Rate_Limit**: The maximum number of SerpAPI searches permitted within the free tier (100 per month)
- **Scrape_Endpoint**: The backend API endpoint (`POST /api/v1/jobsearch/scrape`) that triggers the full scraping pipeline
- **Find_Jobs_Button**: The frontend UI control on the Listings tab that initiates a scrape request

## Requirements

### Requirement 1: Resume Keyword Extraction

**User Story:** As a job seeker, I want the system to automatically extract relevant search terms from my latest resume, so that job searches are tailored to my skills and experience without manual input.

#### Acceptance Criteria

1. WHEN a scrape is triggered, THE Keyword_Extractor SHALL read the authenticated user's most recent active Resume_Version from the database, selecting the version where `isActive` is true with the latest `createdAt` timestamp
2. WHEN the Resume_Version is retrieved, THE Keyword_Extractor SHALL extract search terms from the skills array, experience section headings, experience section item text, and summary field of the Resume_Version
3. THE Keyword_Extractor SHALL produce between 1 and 5 distinct Search_Query values ranked by relevance, where each query is between 2 and 100 characters in length; relevance ranking SHALL prioritize terms in the following order: (1) job title terms from experience section headings, (2) hard skill terms from the skills array, (3) significant terms from experience item text, (4) terms from the summary field
4. WHEN search terms are extracted, THE Keyword_Extractor SHALL deduplicate them by performing case-insensitive comparison and removing queries that are substrings of another selected query before applying the relevance ranking
5. IF the user has no stored Resume_Version, THEN THE Scraper_Service SHALL return a validation error with a message indicating that a resume must be uploaded before searching for jobs
6. IF the active Resume_Version contains no extractable skills or experience data (empty skills array and no experience sections), THEN THE Scraper_Service SHALL return a validation error indicating that the resume lacks sufficient content for job searching
7. IF the user has multiple Resume_Versions with `isActive` set to true, THEN THE Keyword_Extractor SHALL select only the one with the most recent `createdAt` timestamp

### Requirement 2: SerpAPI Google Jobs Integration

**User Story:** As a job seeker, I want the system to search Google Jobs using my resume keywords, so that I receive real, current job postings that match my profile.

#### Acceptance Criteria

1. WHEN Search_Query values are available, THE SerpAPI_Client SHALL send each query to the SerpAPI Google Jobs endpoint (`/search?engine=google_jobs`) with the `q` parameter set to the query text and SHALL process queries sequentially (one at a time)
2. THE SerpAPI_Client SHALL authenticate requests using the SERPAPI_API_KEY environment variable passed as the `api_key` query parameter
3. THE SerpAPI_Client SHALL set a request timeout of 10 seconds per SerpAPI call
4. IF the SERPAPI_API_KEY environment variable is not configured or is empty, THEN THE Scraper_Service SHALL return a configuration error with HTTP status 500 indicating that the SerpAPI key is missing
5. IF SerpAPI returns an HTTP 429 status (rate limit exceeded), THEN THE SerpAPI_Client SHALL stop processing remaining queries immediately and THE Scraper_Service SHALL return an error indicating the monthly search quota has been exceeded
6. IF SerpAPI returns an HTTP error status other than 429, THEN THE SerpAPI_Client SHALL skip that query, record it as failed, and continue processing remaining queries
7. IF SerpAPI returns a network timeout or connection error for a query, THEN THE SerpAPI_Client SHALL skip that query, record it as failed, and continue processing remaining queries
8. IF all queries fail due to errors, THEN THE Scraper_Service SHALL return an error indicating that no job results could be retrieved from the search provider
9. WHEN a location filter is provided by the caller, THE SerpAPI_Client SHALL include it as the `location` parameter in each SerpAPI request

### Requirement 3: Scrape Result Mapping and Ingestion

**User Story:** As a job seeker, I want scraped job postings ingested into my existing listings feed, so that I can browse, filter, and track them using the tools already available.

#### Acceptance Criteria

1. WHEN SerpAPI returns job results, THE Scraper_Service SHALL map each result to the IListingIngestInput schema using the following field mapping: SerpAPI `title` to listing `title`, `company_name` to `company`, `location` to `location`, `description` to `description`, and the job's apply link to `sourceUrl` (falling back to the SerpAPI result URL if no apply link is present)
2. WHEN a SerpAPI result does not include a location value, THE Scraper_Service SHALL default the location field to "Not specified"
3. WHEN a SerpAPI result includes location text containing "remote" (case-insensitive), THE Scraper_Service SHALL set the workMode to "Remote"; WHEN the location text does not contain "remote" but contains "hybrid" (case-insensitive), THE Scraper_Service SHALL set the workMode to "Hybrid"; WHEN the location text contains neither "remote" nor "hybrid", THE Scraper_Service SHALL set the workMode to "Onsite"
4. WHEN a SerpAPI result includes a `detected_extensions.posted_at` value that can be parsed as a relative time expression (e.g., "3 days ago", "1 hour ago") or an absolute date, THE Scraper_Service SHALL convert it to an ISO 8601 timestamp and set the datePosted field to that value; IF the `detected_extensions.posted_at` value is absent or cannot be parsed, THEN THE Scraper_Service SHALL set the datePosted field to the current UTC timestamp
5. IF the SerpAPI description exceeds 5000 characters, THEN THE Scraper_Service SHALL truncate the description field to the first 5000 characters
6. THE Scraper_Service SHALL delegate each mapped listing to the existing Listing_Service ingestListing function, which handles deduplication
7. IF the Listing_Service rejects an individual listing during ingestion (validation error or database error), THEN THE Scraper_Service SHALL skip that listing and continue processing remaining results
8. WHEN the scrape mapping and ingestion completes, THE Scraper_Service SHALL return a summary containing the total number of results received from SerpAPI, the number of new listings ingested, the number of duplicate listings merged, and the number of listings skipped due to errors

### Requirement 4: Scrape API Endpoint

**User Story:** As a frontend client, I want a single API endpoint that triggers the full scraping pipeline, so that the UI can initiate job discovery with one request.

#### Acceptance Criteria

1. THE Scrape_Endpoint SHALL be accessible at `POST /api/v1/jobsearch/scrape` and require authentication via the existing requireAuth middleware
2. THE Scrape_Endpoint SHALL accept an optional JSON body with a `location` field (string, 1–100 characters, trimmed, non-whitespace-only) to pass as a location filter to SerpAPI
3. IF the request body contains a `location` field that is empty after trimming or exceeds 100 characters, THEN THE Scrape_Endpoint SHALL return HTTP status 400 with a validation error indicating the location constraint violated
4. WHEN the scrape completes successfully, THE Scrape_Endpoint SHALL return HTTP status 200 with the scrape summary in the `data` field of the standard `{ data, error, meta }` envelope, where `data` contains `totalResults` (number of results received from SerpAPI), `newListings` (number of new listings ingested), and `duplicatesMerged` (number of duplicate listings detected)
5. WHEN the scrape completes with partial results (some queries failed but at least one succeeded), THE Scrape_Endpoint SHALL return HTTP status 200 with the summary in `data` and include a `warnings` array inside `data` listing each failed query and its failure reason
6. IF the scrape fails entirely (no results from any query), THEN THE Scrape_Endpoint SHALL return an error response with HTTP status 502 and a message describing the failure reason
7. THE Scrape_Endpoint SHALL enforce that only one scrape operation executes per user at a time; IF a scrape is already in progress for the authenticated user, THEN THE Scrape_Endpoint SHALL return HTTP status 409 with a message indicating a scrape is already running
8. THE Scrape_Endpoint SHALL respond within 30 seconds; IF the scraping pipeline exceeds 30 seconds, THEN THE Scrape_Endpoint SHALL abort remaining SerpAPI calls and return the results collected so far as a partial-result response

### Requirement 5: Rate Limit Awareness

**User Story:** As a job seeker on the free tier, I want the system to use my limited SerpAPI searches efficiently, so that I do not exhaust my monthly quota on redundant searches.

#### Acceptance Criteria

1. THE Scraper_Service SHALL limit each scrape invocation to a maximum of 3 SerpAPI search calls regardless of the number of extracted Search_Query values
2. THE Keyword_Extractor SHALL rank Search_Query values by specificity, prioritizing multi-word phrases and named technologies over single generic terms, so that the top-ranked queries sent to SerpAPI yield the most role-relevant results
3. WHEN a user triggers a scrape and a previous successful scrape occurred within the last 60 minutes, THE Scraper_Service SHALL reject the request without making API calls and return an HTTP 429 response with a message indicating the cooldown period remaining in minutes
4. THE Scraper_Service SHALL log each SerpAPI call with the user identifier and timestamp to enable usage monitoring
5. IF a scrape is rejected due to the 60-minute cooldown, THEN THE Scraper_Service SHALL include the cooldown expiry timestamp in the error response so the client can display the remaining wait time

### Requirement 6: Find Jobs Button and Loading State

**User Story:** As a job seeker, I want a visible "Find Jobs" button on the Listings tab that shows progress while scraping, so that I know when the system is working and when results are ready.

#### Acceptance Criteria

1. THE Find_Jobs_Button SHALL be displayed on the Listings tab above the filter bar, styled as a primary action button with the label "Find Jobs"
2. WHEN a user clicks the Find_Jobs_Button, THE Job_Search_Module SHALL send a POST request to the Scrape_Endpoint
3. WHILE the scrape request is in progress, THE Find_Jobs_Button SHALL display a loading spinner and the text "Searching…", and SHALL be disabled to prevent duplicate requests
4. WHEN the scrape request completes successfully, THE Job_Search_Module SHALL re-fetch the listings feed from page 1 with the current filters applied to display the newly ingested results, and display a success notification showing the number of new jobs found
5. IF the scrape request returns an error, THEN THE Job_Search_Module SHALL display an error notification with the error message from the response and re-enable the Find_Jobs_Button
6. IF the user has no uploaded resume, THEN THE Find_Jobs_Button area SHALL display a message indicating "Upload a resume to find matched jobs" with a link to the Resume module, instead of the button
7. IF the scrape request returns an HTTP 429 cooldown error, THEN THE Job_Search_Module SHALL display a notification indicating the remaining cooldown time and the Find_Jobs_Button SHALL remain enabled but not re-send the request

### Requirement 7: Environment Configuration

**User Story:** As a developer, I want the SerpAPI key stored as an environment variable with a documented placeholder, so that the secret is never committed to source control.

#### Acceptance Criteria

1. THE Scraper_Service SHALL read the SerpAPI API key exclusively from the `SERPAPI_API_KEY` environment variable
2. THE backend `.env.example` file SHALL include a placeholder entry: `SERPAPI_API_KEY=your_serpapi_key_here`
3. IF the SERPAPI_API_KEY environment variable is not set or is an empty string at service initialization, THEN THE Scraper_Service SHALL log a warning at the "warn" level indicating the SerpAPI integration is not configured, and SHALL continue to start without terminating the process
4. THE backend `.gitignore` file SHALL include an entry for `.env` to prevent the actual secrets file from being committed to source control
