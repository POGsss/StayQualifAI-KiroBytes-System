# Requirements Document

## Introduction

This document specifies the requirements for the **Interview Voice Redesign** — a reshaping of the existing **Module 2: Interview** Custom Interview Simulator into a single, continuous, **pure-voice** mock interview built around a resume the candidate uploads at the moment of setup.

The redesigned flow has four stages:

1. **Setup.** The candidate uploads a fresh resume file (`.pdf` or `.docx`) directly in the interview setup. The file is parsed to text and used as interview context, so the candidate does not have to pick a previously-saved resume version. The candidate also selects a Difficulty_Tier, provides a Job_Description, and chooses a Question_Count that is either an explicit integer or **Random**. When Random is chosen, the system picks a count within a difficulty-dependent band (harder tiers ask fewer, tougher questions; easier tiers ask more, lighter questions).
2. **Batch generation.** The AI generates **all** interview questions up front in a single generation from the resume text, Job_Description, and Difficulty_Tier, before the spoken interview begins. The questions are held in the Active_Session state for the duration of the interview and are not persisted at generation time. Question phrasing is natural, conversational, and continuous.
3. **Conversational conduct.** The interview is pure voice: the AI speaks (text-to-speech) and the candidate answers by speaking (speech recognition). The AI first delivers a short spoken Role_Intro describing the role and context, then asks each question one at a time with natural transitions, accepting one spoken answer per question until every pre-generated question is answered. The transcript and answer draft are reset for each new question and when a new session starts, so answers never accumulate across turns.
4. **Save and grade.** When every question has been answered, the completed session — its questions, the candidate's answers, the generated Interview_Summary, and the Interview_Grade — is persisted so the candidate can review it later in the Sessions tab. The Interview_Grade is both a numeric score (0–100) and a letter grade (A–F). The Interview_Summary calls out per-answer strengths and weaknesses plus overall feedback.

This redesign **supersedes** the older `interview-chat-voice` text/voice-toggle flow: there is no longer a text-mode/voice-mode selection, no requirement to reference a saved resume version, and questions are no longer persisted at generation time.

The redesign preserves the established architecture: Express + TypeScript backend with the Route → Controller → Service → Supabase flow, React + Zustand frontend whose data flows through service files, Supabase with Row Level Security as the source of truth for ownership, the `{ data, error, meta }` response envelope, the shared typed error hierarchy (including `AiProviderError`), the module-local Gemini AI wrapper, and browser-native Web Speech API hooks (`useSpeechRecognition` / `useSpeechSynthesis`). Question generation uses the Interview module's existing Gemini wrapper; it may benefit from the separate `ai-provider-key-failover` spec but does not depend on it.

This specification defines requirements only. Design and implementation tasks are produced in later phases after user review and approval.

---

## Glossary

- **Voice_Interview_Feature**: The complete redesigned Interview simulator defined by this document — resume upload, difficulty/count/job-description setup, batch question generation, pure-voice conduct, and end-of-interview save with summary and grade.
- **Authenticated_User**: A user with a valid Supabase authentication session interacting with the Voice_Interview_Feature.
- **Interview_Setup**: The pre-interview configuration step where the Authenticated_User uploads a resume file, selects a Difficulty_Tier, provides a Job_Description, and chooses a Question_Count_Selection before the interview is created and started.
- **Resume_File**: The `.pdf` or `.docx` file the Authenticated_User uploads in the Interview_Setup.
- **Resume_Parser**: The backend component that extracts text from a Resume_File for use as interview context.
- **Resume_Context**: The parsed text extracted from the Resume_File, supplied to question generation as candidate background.
- **Difficulty_Tier**: One of the enumerated seniority levels — `ENTRY`, `MID`, `SENIOR`, or `LEAD`.
- **Job_Description**: The free-text role description the Authenticated_User provides in the Interview_Setup.
- **Question_Count_Selection**: The Authenticated_User's choice of how many questions to ask, either an `EXPLICIT` integer or `RANDOM`.
- **Question_Count**: The resolved integer number of questions for the interview.
- **Count_Resolver**: The component that resolves the Question_Count from the Question_Count_Selection and the Difficulty_Tier.
- **Difficulty_Count_Band**: The inclusive integer range from which a `RANDOM` Question_Count is drawn for a given Difficulty_Tier — `ENTRY` 6–10, `MID` 5–8, `SENIOR` 3–5, `LEAD` 2–4.
- **Question_Generator**: The backend component that generates all interview questions in a single AI generation from the Resume_Context, Job_Description, and Difficulty_Tier.
- **Interview_Question**: A single generated question, identified by a 1-based position, with conversational question text.
- **Question_Set**: The complete ordered collection of Interview_Questions generated for an interview.
- **Active_Session**: The in-session client/runtime state that holds the Question_Set and accumulated answers while the interview is in progress, before end-of-interview persistence.
- **Voice_Conductor**: The frontend orchestration that delivers the Role_Intro and conducts the turn-by-turn spoken question-and-answer flow.
- **Role_Intro**: A short spoken introduction, delivered before the first Interview_Question, that describes the role and context of the interview.
- **Speech_Synthesizer**: The frontend wrapper over the browser-native `speechSynthesis` API (`useSpeechSynthesis`) that reads text aloud.
- **Speech_Recognizer**: The frontend wrapper over the browser-native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`, `useSpeechRecognition`) that transcribes the candidate's spoken audio.
- **Transcript**: The text produced by the Speech_Recognizer for the Current_Question.
- **Answer_Draft**: The editable answer text for the Current_Question, seeded by the Transcript and submittable as the Candidate_Answer.
- **Current_Question**: The single Interview_Question, ordered by ascending 1-based position, that the Voice_Conductor is presenting and accepting an answer for.
- **Candidate_Answer**: The answer text submitted for an Interview_Question.
- **Interview_Summary**: The end-of-interview narrative that states per-answer strengths and weaknesses and overall feedback.
- **Interview_Grade**: The end-of-interview result expressed as both a Numeric_Score and a Letter_Grade.
- **Numeric_Score**: An integer from 0 to 100 inclusive representing overall interview performance.
- **Letter_Grade**: One of `A`, `B`, `C`, `D`, or `F`, derived from the Numeric_Score.
- **Completed_Interview_Record**: The persisted record of a finished interview — its configuration, Question_Set, Candidate_Answers, Interview_Summary, and Interview_Grade — available for later review.
- **Sessions_View**: The Interview module's in-page tab that lists the Authenticated_User's Completed_Interview_Records for review.
- **AI_Provider**: The Interview module-local Gemini wrapper that performs JSON-mode generation with Zod validation and an `AbortController` timeout, normalizing failures to `AiProviderError`.
- **AiProviderError**: The shared typed error surfaced when an AI generation fails, times out, or returns an invalid/unparseable response.
- **Lifecycle_State**: The Interview_Session state, one of `PENDING`, `ACTIVE`, `COMPLETED`, or `SCORED`.

---

## Requirements

### Requirement 1: Resume File Upload in Setup

**User Story:** As a job seeker, I want to upload my resume file directly when I set up the interview, so that the questions are tailored to my background without my having to save a resume version first.

#### Acceptance Criteria

1. WHEN an Authenticated_User opens the Interview_Setup, THE Voice_Interview_Feature SHALL present a control to upload a single Resume_File.
2. WHERE a Resume_File has a `.pdf` or `.docx` extension and a size of at most 5,242,880 bytes, THE Voice_Interview_Feature SHALL accept the Resume_File for parsing.
3. IF an uploaded Resume_File has an extension other than `.pdf` or `.docx`, THEN THE Voice_Interview_Feature SHALL reject the upload with an UnsupportedFileTypeError and SHALL display a message stating that only `.pdf` and `.docx` files are accepted.
4. IF an uploaded Resume_File exceeds 5,242,880 bytes, THEN THE Voice_Interview_Feature SHALL reject the upload with a FileTooLargeError and SHALL display a message stating the 5 MB maximum.
5. WHEN an accepted Resume_File is uploaded, THE Resume_Parser SHALL extract the Resume_Context text from the Resume_File.
6. IF the Resume_Parser cannot extract text from the Resume_File, THEN THE Voice_Interview_Feature SHALL surface a ParseError and SHALL display a message stating that the resume could not be read, while keeping the Interview_Setup available so the Authenticated_User can upload a different Resume_File.
7. THE Voice_Interview_Feature SHALL require an accepted, successfully parsed Resume_File before the interview can be started.

---

### Requirement 2: Difficulty Selection

**User Story:** As a job seeker, I want to choose the difficulty of the interview, so that the questions match the seniority level I am preparing for.

#### Acceptance Criteria

1. WHEN an Authenticated_User opens the Interview_Setup, THE Voice_Interview_Feature SHALL present a Difficulty_Tier selection offering exactly `ENTRY`, `MID`, `SENIOR`, and `LEAD`.
2. THE Interview_Setup SHALL default the Difficulty_Tier to `ENTRY`.
3. WHEN an Authenticated_User selects a Difficulty_Tier, THE Voice_Interview_Feature SHALL retain the selected Difficulty_Tier as the value used for question generation.

---

### Requirement 3: Job Description Entry

**User Story:** As a job seeker, I want to provide the job description, so that the interview questions are relevant to the specific role.

#### Acceptance Criteria

1. WHEN an Authenticated_User opens the Interview_Setup, THE Voice_Interview_Feature SHALL present an input for the Job_Description.
2. WHEN an Authenticated_User submits the Interview_Setup with a Job_Description whose trimmed length is from 1 to 5,000 characters inclusive, THE Voice_Interview_Feature SHALL accept the Job_Description for question generation.
3. IF the Job_Description is empty or contains only whitespace, THEN THE Voice_Interview_Feature SHALL keep the start control disabled and SHALL display a message indicating that the Job_Description is required.
4. IF the trimmed Job_Description length exceeds 5,000 characters, THEN THE Voice_Interview_Feature SHALL keep the start control disabled and SHALL display a message stating the 5,000-character maximum.

---

### Requirement 4: Question Count Selection — Explicit or Random

**User Story:** As a job seeker, I want to choose exactly how many questions to answer or let the system decide based on difficulty, so that I can control the length of my practice or get a difficulty-appropriate set.

#### Acceptance Criteria

1. WHEN an Authenticated_User opens the Interview_Setup, THE Voice_Interview_Feature SHALL present a Question_Count_Selection offering an `EXPLICIT` integer count and a `RANDOM` option.
2. WHERE the Question_Count_Selection is `EXPLICIT` and the supplied integer is from 1 to 15 inclusive, THE Count_Resolver SHALL resolve the Question_Count to that integer.
3. IF the Question_Count_Selection is `EXPLICIT` and the supplied value is not an integer from 1 to 15 inclusive, THEN THE Voice_Interview_Feature SHALL keep the start control disabled and SHALL display a message stating the valid range is 1 to 15 inclusive.
4. WHERE the Question_Count_Selection is `RANDOM`, THE Count_Resolver SHALL resolve the Question_Count to an integer within the Difficulty_Count_Band for the selected Difficulty_Tier.
5. WHERE the Question_Count_Selection is `RANDOM` and the Difficulty_Tier is `ENTRY`, THE Count_Resolver SHALL resolve the Question_Count to an integer from 6 to 10 inclusive.
6. WHERE the Question_Count_Selection is `RANDOM` and the Difficulty_Tier is `MID`, THE Count_Resolver SHALL resolve the Question_Count to an integer from 5 to 8 inclusive.
7. WHERE the Question_Count_Selection is `RANDOM` and the Difficulty_Tier is `SENIOR`, THE Count_Resolver SHALL resolve the Question_Count to an integer from 3 to 5 inclusive.
8. WHERE the Question_Count_Selection is `RANDOM` and the Difficulty_Tier is `LEAD`, THE Count_Resolver SHALL resolve the Question_Count to an integer from 2 to 4 inclusive.

---

### Requirement 5: Batch Question Generation

**User Story:** As a job seeker, I want all my interview questions prepared at once before we begin, so that the interview flows continuously without pauses to generate each question.

#### Acceptance Criteria

1. WHEN an Authenticated_User starts the interview with an accepted Resume_Context, a valid Job_Description, a Difficulty_Tier, and a resolved Question_Count, THE Question_Generator SHALL generate the entire Question_Set in a single AI generation through the AI_Provider before the interview begins.
2. WHEN the Question_Generator generates the Question_Set, THE Question_Generator SHALL produce a number of Interview_Questions equal to the resolved Question_Count.
3. WHEN the Question_Generator generates the Question_Set, THE Question_Generator SHALL assign each Interview_Question a unique 1-based position and a non-empty question text that is unique within the Question_Set.
4. THE Question_Generator SHALL generate Interview_Question text that is natural, conversational, and continuous, including lead-ins and transitions between questions.
5. WHEN the Question_Generator generates the Question_Set, THE Question_Generator SHALL tailor the Interview_Questions to the Resume_Context, the Job_Description, and the selected Difficulty_Tier.
6. IF the AI generation fails, times out, or returns a response that does not contain the requested number of unique, non-empty Interview_Questions, THEN THE Question_Generator SHALL surface an AiProviderError and SHALL NOT begin the interview.

---

### Requirement 6: Holding the Question Set in Active-Session State

**User Story:** As a job seeker, I want my prepared questions to be ready instantly during the interview, so that there is no delay between answering one question and hearing the next.

#### Acceptance Criteria

1. WHEN the Question_Set is generated, THE Voice_Interview_Feature SHALL hold the Question_Set in the Active_Session state for the duration of the interview.
2. WHILE the interview is in progress, THE Voice_Interview_Feature SHALL serve each Interview_Question and accumulate each Candidate_Answer from the Active_Session state without persisting the Question_Set or the Candidate_Answers to storage.
3. WHILE the interview is in progress, THE Voice_Interview_Feature SHALL advance through the Question_Set from the Active_Session state in ascending 1-based position order.

---

### Requirement 7: Spoken Role Introduction

**User Story:** As a job seeker, I want the AI interviewer to introduce the role before asking questions, so that the session feels like a real interview and I have context.

#### Acceptance Criteria

1. WHEN the interview begins and the Speech_Synthesizer is available, THE Voice_Conductor SHALL speak the Role_Intro describing the role and context before presenting the first Interview_Question.
2. THE Voice_Conductor SHALL present the Role_Intro as visible text in addition to speaking it.
3. WHEN the Role_Intro finishes, THE Voice_Conductor SHALL present the Interview_Question at position 1 as the Current_Question.
4. IF the Speech_Synthesizer is unavailable, THEN THE Voice_Conductor SHALL present the Role_Intro as visible text and SHALL proceed to present the Interview_Question at position 1 as the Current_Question without audio playback.

---

### Requirement 8: Turn-by-Turn Spoken Question-and-Answer

**User Story:** As a job seeker, I want the AI to ask one question at a time and listen to my spoken answer before moving on, so that the interview proceeds as a natural conversation.

#### Acceptance Criteria

1. WHEN the Current_Question is presented AND the Speech_Synthesizer is available, THE Speech_Synthesizer SHALL read the Current_Question text aloud.
2. WHILE the Speech_Synthesizer is reading the Current_Question aloud, THE Voice_Conductor SHALL display the complete Current_Question text as visible text.
3. WHEN the Speech_Recognizer is available and the Current_Question has been presented, THE Speech_Recognizer SHALL transcribe the candidate's spoken answer into the Transcript for the Current_Question.
4. WHILE the Speech_Recognizer is transcribing, THE Voice_Conductor SHALL display the live Transcript as the Answer_Draft so the Authenticated_User can review and edit it.
5. WHEN an Authenticated_User submits the Candidate_Answer for the Current_Question with an Answer_Draft whose trimmed length is from 1 to 5,000 characters inclusive, THE Voice_Interview_Feature SHALL record the Candidate_Answer in the Active_Session state and SHALL advance to the lowest-positioned unanswered Interview_Question.
6. WHEN a Candidate_Answer is recorded and at least one unanswered Interview_Question remains, THE Voice_Conductor SHALL present the next Interview_Question with a natural spoken transition.
7. THE Voice_Conductor SHALL accept exactly one Candidate_Answer per Interview_Question and SHALL NOT present an Interview_Question that has already been answered.
8. IF the Answer_Draft is empty or contains only whitespace, THEN THE Voice_Interview_Feature SHALL keep the submit control disabled.
9. IF the Answer_Draft trimmed length exceeds 5,000 characters, THEN THE Voice_Interview_Feature SHALL keep the submit control disabled and SHALL display a message stating the 5,000-character maximum.
10. WHILE a Candidate_Answer submission for the Current_Question is in progress, THE Voice_Interview_Feature SHALL keep the submit control disabled until the submission completes, so that the same Candidate_Answer is recorded at most once.

---

### Requirement 9: Per-Question Transcript and Answer-Draft Reset

**User Story:** As a job seeker, I want each new question to start with a blank answer, so that my previous answer never carries over into the next one.

#### Acceptance Criteria

1. WHEN the Voice_Conductor presents a new Current_Question, THE Voice_Interview_Feature SHALL reset the Transcript to empty and the Answer_Draft to empty before transcription for that Current_Question begins.
2. WHEN a Candidate_Answer is recorded for the Current_Question, THE Voice_Interview_Feature SHALL clear the Transcript and the Answer_Draft so that no recorded answer text carries into the next Interview_Question.
3. WHEN a new interview session starts, THE Voice_Interview_Feature SHALL reset the Transcript, the Answer_Draft, and all per-question answer state to empty.
4. WHILE transcribing the Current_Question, THE Speech_Recognizer SHALL accumulate recognized text only for the Current_Question and SHALL NOT include any Transcript content from a previously-answered Interview_Question.

---

### Requirement 10: End-of-Interview Persistence for Review

**User Story:** As a job seeker, I want my finished interview saved, so that I can revisit my questions, answers, summary, and grade later.

#### Acceptance Criteria

1. WHEN the Candidate_Answer for the final unanswered Interview_Question is recorded, THE Voice_Interview_Feature SHALL persist the Completed_Interview_Record containing the interview configuration, the Question_Set, the Candidate_Answers, the Interview_Summary, and the Interview_Grade.
2. WHEN the Completed_Interview_Record is persisted, THE Voice_Interview_Feature SHALL transition the Interview_Session Lifecycle_State to a completed state that makes the record available in the Sessions_View.
3. WHEN an Authenticated_User opens the Sessions_View, THE Voice_Interview_Feature SHALL list the Authenticated_User's Completed_Interview_Records.
4. WHEN an Authenticated_User opens a Completed_Interview_Record from the Sessions_View, THE Voice_Interview_Feature SHALL display its Question_Set, Candidate_Answers, Interview_Summary, and Interview_Grade.
5. IF persistence of the Completed_Interview_Record fails, THEN THE Voice_Interview_Feature SHALL surface the error and SHALL allow the Authenticated_User to retry persistence without losing the Question_Set or the Candidate_Answers held in the Active_Session state.

---

### Requirement 11: Interview Summary and Grade Generation

**User Story:** As a job seeker, I want a summary of my performance with a clear score and letter grade, so that I understand my strengths, weaknesses, and overall result.

#### Acceptance Criteria

1. WHEN every Interview_Question has been answered, THE Voice_Interview_Feature SHALL generate the Interview_Summary and the Interview_Grade through the AI_Provider.
2. THE Interview_Summary SHALL state, for each answered Interview_Question, the strengths and weaknesses of the corresponding Candidate_Answer.
3. THE Interview_Summary SHALL state overall feedback covering the interview as a whole.
4. THE Interview_Grade SHALL include a Numeric_Score that is an integer from 0 to 100 inclusive.
5. THE Interview_Grade SHALL include a Letter_Grade that is one of `A`, `B`, `C`, `D`, or `F`.
6. THE Voice_Interview_Feature SHALL derive the Letter_Grade from the Numeric_Score using the mapping `A` for 90–100, `B` for 80–89, `C` for 70–79, `D` for 60–69, and `F` for 0–59.
7. IF the AI generation of the Interview_Summary or the Interview_Grade fails, times out, or returns a response that does not include a valid Numeric_Score and per-answer feedback, THEN THE Voice_Interview_Feature SHALL surface an AiProviderError and SHALL allow the Authenticated_User to retry generation.

---

### Requirement 12: Pure-Voice Interaction with Graceful Fallback

**User Story:** As a job seeker on any browser, I want the interview to work even when speech features are unavailable, so that I can always complete it.

#### Acceptance Criteria

1. THE Voice_Interview_Feature SHALL deliver questions through the Speech_Synthesizer and capture answers through the Speech_Recognizer as the primary interaction, using only the browser-native Web Speech API and `speechSynthesis`.
2. IF the Speech_Synthesizer is unavailable, THEN THE Voice_Interview_Feature SHALL present every Interview_Question and the Role_Intro as visible text and SHALL continue the interview without audio playback.
3. IF the Speech_Recognizer is unavailable or microphone permission is denied, THEN THE Voice_Interview_Feature SHALL present an editable Answer_Draft input so the Authenticated_User can type and submit the Candidate_Answer for every remaining Interview_Question.
4. WHEN the Voice_Interview_Feature falls back to typed answering, THE Voice_Interview_Feature SHALL retain the visible text of the Current_Question and any accumulated Answer_Draft so that no presented or in-progress content is lost.
5. THE Voice_Interview_Feature SHALL render every Interview_Question, the Role_Intro, and every Candidate_Answer as visible text so that no interview content is conveyed by audio alone.

---

### Requirement 13: Security, Ownership, and Error Surfacing

**User Story:** As a platform maintainer, I want the redesigned interview to honor the platform's security and error conventions, so that user data stays isolated and failures are reported consistently.

#### Acceptance Criteria

1. THE Voice_Interview_Feature SHALL scope every Completed_Interview_Record and every Resume_File access to the owning Authenticated_User through Row Level Security.
2. WHEN an Authenticated_User requests a Completed_Interview_Record that they do not own, THE Voice_Interview_Feature SHALL respond as if the record does not exist so that the existence of another user's data is not revealed.
3. THE Voice_Interview_Feature SHALL exclude API keys, tokens, and other secrets from every API response, log entry, and error message.
4. WHEN an AI generation fails during question generation or summary-and-grade generation, THE Voice_Interview_Feature SHALL surface the failure as an AiProviderError through the `{ data, error, meta }` response envelope.
5. THE Voice_Interview_Feature SHALL transmit only parsed resume text and answer text to the AI_Provider and SHALL NOT transmit raw candidate audio to the backend or any external speech service.

---

### Requirement 14: Supersession of the Prior Chat/Voice Flow

**User Story:** As a product owner, I want the new pure-voice flow to replace the old text/voice-toggle flow, so that the Interview simulator has one coherent experience.

#### Acceptance Criteria

1. THE Voice_Interview_Feature SHALL replace the `interview-chat-voice` text/voice-toggle simulator experience as the Interview module's simulator flow.
2. THE Voice_Interview_Feature SHALL NOT present a text-mode versus voice-mode selection in the Interview_Setup.
3. THE Voice_Interview_Feature SHALL NOT require the Authenticated_User to reference a previously-saved resume version to start an interview.
4. THE Voice_Interview_Feature SHALL use the Interview module-local Gemini AI_Provider wrapper for question generation and SHALL NOT import another module's AI wrapper.
