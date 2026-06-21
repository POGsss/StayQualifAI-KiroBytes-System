# Requirements Document

## Introduction

The Job Search module is Module 3 of StayQualifAI — an AI-powered career acceleration platform. This module provides users with a unified job discovery and application management experience comprising three sub-features: a smart job listings feed with filters and direct-apply links, a visual Kanban-style application tracker, and an AI-powered application and email writer. The module follows the established architecture (Route → Controller → Service → Supabase) and integrates with Google Gemini for AI-generated content.

## Glossary

- **Job_Search_Module**: The backend Express service and frontend React pages responsible for job listing management, application tracking, and AI-generated application content
- **Listing_Service**: The backend service that fetches, deduplicates, and stores job listings from external scraped sources
- **Application_Tracker**: The Kanban-based UI and backend service that manages a user's job applications across lifecycle stages
- **AI_Writer_Service**: The backend service that uses Google Gemini to generate cover letters, LinkedIn outreach messages, and follow-up email templates
- **Kanban_Board**: The frontend drag-and-drop interface displaying application cards across columns (Wishlist, Applied, Interviewing, Offer, Rejected)
- **Listing**: A single job posting record containing title, company, location, work mode, URL, and metadata
- **Application**: A user's tracked relationship with a specific job listing, including stage, notes, and timestamps
- **Work_Mode**: The employment arrangement classification — one of Remote, Hybrid, or Onsite
- **Stage**: An application lifecycle phase — one of Wishlist, Applied, Interviewing, Offer, or Rejected
- **Deduplication**: The process of identifying and merging duplicate job listings based on matching company, title, and location

## Requirements

### Requirement 1: Job Listing Storage and Retrieval

**User Story:** As a job seeker, I want to browse a feed of job listings relevant to my search criteria, so that I can discover new opportunities in one place.

#### Acceptance Criteria

1. THE Job_Search_Module SHALL store each Listing with the following fields: unique identifier, title (maximum 255 characters), company name (maximum 255 characters), location (maximum 255 characters), Work_Mode, description (maximum 5000 characters), source URL, salary range (optional, numeric values between 0 and 999,999,999), date posted, and date scraped
2. WHEN a user requests job listings without specifying a page size parameter, THE Listing_Service SHALL return a paginated list of at most 20 Listings sorted by date posted in descending order
3. WHEN a user requests job listings with a page size parameter between 1 and 100, THE Listing_Service SHALL return at most the specified number of Listings per page and include pagination metadata containing total listing count, current page number, total page count, and whether a next page exists
4. WHEN a Listing has a source URL, THE Job_Search_Module SHALL provide the URL so the user can navigate to the original posting for direct application
5. IF a user requests job listings with a page size parameter less than 1 or greater than 100 or a page number less than 1, THEN THE Listing_Service SHALL return an error message indicating the invalid parameter and its accepted range

### Requirement 2: Job Listing Smart Filters

**User Story:** As a job seeker, I want to filter job listings by work mode, location, keyword, and company, so that I can quickly narrow down opportunities that match my preferences.

#### Acceptance Criteria

1. WHEN a user applies a Work_Mode filter (Remote, Hybrid, or Onsite), THE Listing_Service SHALL return only Listings matching the selected Work_Mode
2. WHEN a user applies a location filter, THE Listing_Service SHALL perform a case-insensitive substring match against the Listing location field and return only Listings that contain the specified location text
3. WHEN a user applies a keyword filter with a value between 1 and 100 characters, THE Listing_Service SHALL perform a case-insensitive substring match against the Listing title and description fields and return only Listings where at least one field contains the specified keyword
4. WHEN a user applies a company filter, THE Listing_Service SHALL perform a case-insensitive substring match against the Listing company name field and return only Listings that contain the specified company text
5. WHEN a user applies multiple filters simultaneously, THE Listing_Service SHALL return only Listings satisfying all active filter conditions
6. WHEN no Listings match the active filters, THE Listing_Service SHALL return an empty list with zero-count pagination metadata
7. IF a user submits a filter value that is empty, contains only whitespace, or exceeds 100 characters, THEN THE Listing_Service SHALL reject the request with an error message indicating the filter value must be between 1 and 100 non-whitespace characters

### Requirement 3: Job Listing Deduplication

**User Story:** As a job seeker, I want the listings feed to be free of duplicates, so that I do not waste time reviewing the same position posted on multiple sources.

#### Acceptance Criteria

1. WHEN a new Listing is ingested, THE Listing_Service SHALL check for existing Listings with the same company name, title, and location
2. WHEN a duplicate Listing is detected, THE Listing_Service SHALL merge the new source URL into the existing Listing record instead of creating a new entry, and SHALL retain the earliest date_posted and the most recently scraped description and salary values from either record
3. THE Listing_Service SHALL treat company name comparison as case-insensitive and whitespace-normalized (leading and trailing whitespace trimmed, consecutive internal whitespace collapsed to a single space) during Deduplication
4. THE Listing_Service SHALL treat title comparison as case-insensitive and whitespace-normalized (leading and trailing whitespace trimmed, consecutive internal whitespace collapsed to a single space) during Deduplication
5. THE Listing_Service SHALL treat location comparison as case-insensitive and whitespace-normalized (leading and trailing whitespace trimmed, consecutive internal whitespace collapsed to a single space) during Deduplication
6. IF the Listing_Service encounters a database error during the Deduplication check, THEN THE Listing_Service SHALL reject the ingestion of the new Listing and return an error message indicating the deduplication check failed

### Requirement 4: Visual Application Tracker — Kanban Board

**User Story:** As a job seeker, I want to visually track my applications on a Kanban board, so that I can see the status of all my applications at a glance and manage my pipeline.

#### Acceptance Criteria

1. THE Kanban_Board SHALL display five columns in left-to-right order representing the Stages: Wishlist, Applied, Interviewing, Offer, and Rejected
2. THE Application_Tracker SHALL store each Application with: unique identifier, associated Listing reference, current Stage, user notes (optional, maximum 2000 characters), date added, and date of last stage change
3. WHEN a user adds a Listing to the tracker, THE Application_Tracker SHALL create a new Application in the Wishlist Stage by default
4. IF a user attempts to add a Listing that already exists in the tracker, THEN THE Application_Tracker SHALL reject the addition and display a message indicating the Listing is already tracked
5. WHEN a user drags an Application card to a different Stage column, THE Application_Tracker SHALL update the Application's Stage and record the timestamp of the change
6. IF a Stage update fails due to a server or network error, THEN THE Application_Tracker SHALL revert the card to its previous Stage column and display an error message indicating the update was unsuccessful
7. WHEN a user views the Kanban_Board, THE Application_Tracker SHALL display the count of Applications in each Stage column header
8. THE Kanban_Board SHALL display each Application card with the job title, company name, and the date of the last stage change
9. THE Kanban_Board SHALL order Application cards within each Stage column by date of last stage change in descending order, with most recently changed cards appearing first

### Requirement 5: Application Notes and Details

**User Story:** As a job seeker, I want to add notes and view details for each tracked application, so that I can record interview dates, contact names, and personal reminders.

#### Acceptance Criteria

1. WHEN a user opens an Application card, THE Application_Tracker SHALL display the full Listing details (title, company, location, Work_Mode, description, source URL) alongside the Application metadata (current Stage, date added, date of last stage change, and notes)
2. WHEN a user edits the notes field on an Application and the input loses focus or 1 second elapses since the last keystroke, THE Application_Tracker SHALL persist the updated notes within 2 seconds
3. IF the notes field content exceeds 2000 characters, THEN THE Application_Tracker SHALL prevent further input and display an indicator showing the character limit has been reached
4. IF the Application_Tracker fails to persist updated notes due to a network or server error, THEN THE Application_Tracker SHALL display an error message indicating the save failed and retain the unsaved content in the editor
5. WHEN a user views an Application, THE Application_Tracker SHALL display the complete Stage transition history sorted in reverse chronological order, showing the Stage name and the timestamp of each transition

### Requirement 6: AI Cover Letter Generator

**User Story:** As a job seeker, I want AI-generated cover letters tailored to a specific job listing, so that I can quickly produce high-quality application documents.

#### Acceptance Criteria

1. WHEN a user requests a cover letter for a specific Application, THE AI_Writer_Service SHALL generate a cover letter between 250 and 500 words using the Listing description and the user's most recent resume version data
2. THE AI_Writer_Service SHALL produce cover letters that reference at least 2 specific requirements from the Listing description and map them to qualifications from the user's resume
3. WHEN the AI_Writer_Service generates a cover letter, THE Job_Search_Module SHALL return the generated text within 15 seconds
4. IF the AI_Writer_Service fails to generate content due to an API error, THEN THE Job_Search_Module SHALL return an error message indicating the type of failure encountered and that the user should retry
5. WHEN a user receives a generated cover letter, THE Job_Search_Module SHALL allow the user to copy the full generated text to the clipboard
6. IF the user has no stored resume version when requesting a cover letter, THEN THE Job_Search_Module SHALL return a validation error indicating that a resume must be uploaded before generating a cover letter
7. IF the Application's associated Listing has an empty or missing description, THEN THE Job_Search_Module SHALL return a validation error indicating that a Listing description is required for cover letter generation

### Requirement 7: AI LinkedIn Outreach Message Generator

**User Story:** As a job seeker, I want AI-generated LinkedIn connection request messages, so that I can network effectively with hiring managers and recruiters.

#### Acceptance Criteria

1. WHEN a user requests a LinkedIn outreach message for a specific Application, THE AI_Writer_Service SHALL generate a connection request message referencing the target role and company from the associated Listing, and return the generated text within 15 seconds
2. THE AI_Writer_Service SHALL constrain LinkedIn outreach messages to a maximum of 300 characters to comply with LinkedIn connection request limits
3. WHEN the user provides a recipient name or role, THE AI_Writer_Service SHALL include the recipient's name in the greeting and reference their role within the generated message
4. IF the AI_Writer_Service fails to generate a LinkedIn outreach message due to an API error, THEN THE Job_Search_Module SHALL return a descriptive error message indicating the failure reason
5. WHEN a user receives a generated LinkedIn outreach message, THE Job_Search_Module SHALL allow the user to copy the text to the clipboard

### Requirement 8: AI Follow-Up Email Generator

**User Story:** As a job seeker, I want AI-generated follow-up emails for different stages of my application, so that I can maintain professional communication throughout the process.

#### Acceptance Criteria

1. WHEN a user requests a follow-up email for an Application, THE AI_Writer_Service SHALL generate an email that references the Listing's company name and job title, tailored to the Application's current Stage, and return the generated text within 15 seconds
2. WHEN the Application Stage is Applied, THE AI_Writer_Service SHALL generate a post-application follow-up email that expresses continued interest in the role and references the company and position title from the associated Listing
3. WHEN the Application Stage is Interviewing, THE AI_Writer_Service SHALL generate a post-interview thank-you email that references the company and position title from the associated Listing
4. WHEN a user receives a generated email, THE Job_Search_Module SHALL allow the user to copy the text to the clipboard
5. IF the AI_Writer_Service receives a request for a follow-up email for a Stage other than Applied or Interviewing, THEN THE AI_Writer_Service SHALL return a validation error indicating follow-up emails are only available for Applied and Interviewing stages
6. IF the AI_Writer_Service fails to generate a follow-up email due to an API error, THEN THE Job_Search_Module SHALL return a descriptive error message indicating the failure reason

### Requirement 9: Application Deletion

**User Story:** As a job seeker, I want to remove applications from my tracker, so that I can keep my pipeline clean and focused on active opportunities.

#### Acceptance Criteria

1. WHEN a user requests deletion of an Application, THE Application_Tracker SHALL display a confirmation prompt before executing the deletion
2. IF the user confirms the deletion, THEN THE Application_Tracker SHALL remove the Application record from the database and remove the Application card from the Kanban_Board without requiring a page refresh
3. IF the user declines the deletion confirmation, THEN THE Application_Tracker SHALL retain the Application record unchanged and dismiss the confirmation prompt
4. IF a deletion request targets an Application that does not exist, THEN THE Application_Tracker SHALL return an error message indicating the Application was not found
5. WHEN an Application is successfully deleted, THE Application_Tracker SHALL update the affected Stage column's Application count in the Kanban_Board column header

### Requirement 10: Job Search Module Navigation

**User Story:** As a user, I want tab-based navigation within the Job Search module, so that I can switch between the listings feed, application tracker, and AI writer.

#### Acceptance Criteria

1. THE Job_Search_Module SHALL provide three in-page tabs displayed in left-to-right order: Listings, Tracker, and AI Writer
2. WHEN a user selects a tab, THE Job_Search_Module SHALL display only the corresponding sub-feature content without a full page reload, hiding the previously active tab's content
3. THE Job_Search_Module SHALL visually indicate the currently active tab using a bottom border in the primary purple color, while inactive tabs display no bottom border
4. WHEN the Job Search module is loaded, THE Job_Search_Module SHALL display the Listings tab as the default active view with its content visible
5. THE Job_Search_Module SHALL ensure that exactly one tab is active at any time, and all three tabs remain keyboard-navigable with a visible focus indicator
