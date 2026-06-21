# Requirements Document

## Introduction

This document specifies the requirements for the **Interview Chat & Voice** feature — a frontend-focused enhancement of the existing **Module 2: Interview** (the Custom Interview Simulator). It reshapes the simulator's presentation into a simplified, chat-style conversation with an AI panelist and adds a choice of answering by typing (**text mode**) or by speaking (**voice mode**), alongside the existing difficulty-tier and question-count selection. It also refreshes the Scorecard, Sessions, and STAR Organizer screens into a cohesive layout and introduces skeleton loading states across the module.

The feature is purely a frontend refactor and addition. It MUST reuse the existing Interview backend lifecycle and `/api/v1/interview/*` endpoints unchanged: a session still progresses through `PENDING → ACTIVE → COMPLETED → SCORED`; questions are still generated server-side; answers are still submitted one per question with a client-measured response latency; evaluation and the multi-dimensional scorecard are still computed by the backend. No change to the scoring algorithm, the STAR organizer's backend, or the backend domain is in scope.

Voice capability is delivered with **browser-native Web APIs only** — the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) for speech-to-text and `speechSynthesis` for text-to-speech — so the feature requires no new backend secrets, no API keys, and no third-party services. When a browser does not support these APIs, or the user denies microphone permission, the feature degrades gracefully to text mode. Cloud text-to-speech providers, an audio-reactive orb, a waveform visualizer, and microphone recording playback are explicitly out of the core scope and are captured only as clearly-marked optional enhancements.

This specification defines requirements only. Design and implementation tasks are produced in later phases after user review and approval.

---

## Glossary

- **Interview_Chat_Feature**: The complete frontend feature set defined by this document — the chat-style interview presentation, text and voice answering modes, the refreshed Scorecard/Sessions/STAR layouts, and skeleton loading states.
- **Chat_View**: The React page (within `pages/Interview/`) that presents an Interview_Session as a conversation thread and hosts the answer composer and voice controls. It replaces the prior simulator presentation while preserving the underlying session lifecycle.
- **Chat_Thread**: The ordered, scrollable list of Chat_Messages rendered by the Chat_View representing the back-and-forth between the AI panelist and the candidate.
- **Chat_Message**: A single entry in the Chat_Thread, with a role of either `assistant` (an Interview_Question) or `user` (a submitted Candidate_Answer).
- **Interview_Mode**: The answering mode chosen at session start, one of two enumerated values — `text` (type answers) or `voice` (speak answers).
- **Session_Setup**: The Chat_View's pre-session configuration step where the candidate selects Interview_Mode, Difficulty_Tier, and Question_Count, supplies the Job_Description, and optionally references a resume version, before creating and starting the Interview_Session.
- **Answer_Composer**: The Chat_View control through which the candidate composes and sends a Candidate_Answer for the Current_Question.
- **Speech_Recognizer**: The frontend wrapper over the browser-native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) that converts the candidate's spoken audio into a Transcript during voice mode.
- **Speech_Synthesizer**: The frontend wrapper over the browser-native `speechSynthesis` API that reads an Interview_Question aloud during voice mode.
- **Transcript**: The text produced by the Speech_Recognizer, comprising finalized recognized text and any pending interim recognized text.
- **Voice_Turn**: One voice-mode cycle for a single Interview_Question: the Speech_Synthesizer reads the question aloud, the candidate dictates an answer that the Speech_Recognizer transcribes, the candidate reviews/edits the Transcript, and sends.
- **Current_Question**: The single unanswered Interview_Question, ordered by 1-based position, that the Chat_View is presenting and accepting an answer for.
- **Response_Latency**: The elapsed time in seconds between the moment the Current_Question is first presented and the moment its Candidate_Answer is sent, measured client-side and submitted with the answer (consistent with the existing Interview module).
- **Caption_Text**: The always-present visible text of an Interview_Question (and, for voice mode, the live Transcript) rendered in the Chat_Thread so that no content is conveyed by audio alone.
- **Support_Detection**: The Chat_View's runtime determination of whether the current browser exposes the Web Speech API and `speechSynthesis`.
- **Interview_Mode_Fallback**: The behavior of switching to, or restricting selection to, `text` Interview_Mode when voice capability is unavailable or microphone permission is denied.
- **Sessions_Page**: The existing `pages/Interview/InterviewSessionsPage.tsx` that lists the user's past Interview_Sessions.
- **Scorecard_Page**: The existing `pages/Interview/InterviewScorecardPage.tsx` that displays a Performance_Scorecard.
- **Star_Page**: The existing `pages/Interview/StarOrganizerPage.tsx` STAR scratchpad (create/list/view/update/delete).
- **Skeleton_Placeholder**: A non-interactive, content-shaped loading placeholder shown while data is being fetched or computed, conveyed to assistive technology as a busy/loading state rather than as real content.
- **Interview_Service**: The existing frontend data-access module `services/interview.service.ts` that calls `/api/v1/interview/*`. Reused unchanged.
- **Interview_Store**: The existing Zustand store `stores/interview.store.ts` that owns interview client state and delegates to the Interview_Service. Reused, extended only with frontend-local voice/chat UI state.
- **Interview_Session / Interview_Question / Candidate_Answer / Difficulty_Tier / Question_Count / Job_Description / Performance_Scorecard / Lifecycle_State**: As defined by the existing Interview module. Reused by reference.
- **Authenticated_User**: A user with a valid Supabase authentication session interacting with the Interview_Chat_Feature.

---

## Requirements

### Requirement 1: Session Setup with Mode, Difficulty, and Question Count

**User Story:** As a job seeker, I want to choose how I will answer (typing or speaking) along with the difficulty and number of questions before I begin, so that the mock interview matches how I want to practice.

#### Acceptance Criteria

1. WHEN an Authenticated_User opens the Chat_View without an active Interview_Session, THE Chat_View SHALL present a Session_Setup that offers selection of an Interview_Mode (`text` or `voice`), a Difficulty_Tier (`ENTRY`, `MID`, `SENIOR`, or `LEAD`), a Question_Count (an integer from 5 to 15 inclusive), and an input for the Job_Description.
2. THE Session_Setup SHALL default the Interview_Mode to `text`, the Difficulty_Tier to `ENTRY`, and the Question_Count to 5.
3. WHEN an Authenticated_User submits the Session_Setup with a selected Interview_Mode, a valid Difficulty_Tier, a Question_Count within 5 to 15 inclusive, and a Job_Description whose trimmed length is 1 to 5,000 characters inclusive, THE Chat_View SHALL create an Interview_Session through the Interview_Store and SHALL retain the selected Interview_Mode in frontend state for the duration of the session.
4. WHERE an Authenticated_User supplies a resume version reference in the Session_Setup, THE Chat_View SHALL include that reference in the session-creation request through the Interview_Store.
5. IF the Job_Description is empty or contains only whitespace, THEN THE Chat_View SHALL keep the create control disabled and SHALL display a message indicating the Job_Description is required.
6. IF the Question_Count is outside the range 5 to 15 inclusive, THEN THE Chat_View SHALL keep the create control disabled and SHALL display a message stating the valid range is 5 to 15 inclusive.
7. WHEN an Interview_Session is created successfully, THE Chat_View SHALL start the session through the Interview_Store so that Interview_Questions are generated and the session transitions to `ACTIVE`.
8. IF session creation or session start fails, THEN THE Chat_View SHALL display the error message surfaced by the Interview_Store, SHALL keep the Session_Setup available with the previously entered Interview_Mode, Difficulty_Tier, Question_Count, and Job_Description preserved, and SHALL re-enable the create control so the Authenticated_User can retry.
9. IF the Job_Description trimmed length exceeds 5,000 characters, THEN THE Chat_View SHALL keep the create control disabled and SHALL display a message stating the 5,000-character maximum.

---

### Requirement 2: Chat-Thread Presentation of the Interview

**User Story:** As a job seeker, I want the interview to look like a chat with an AI interviewer, so that the experience feels simple and conversational.

#### Acceptance Criteria

1. WHILE an Interview_Session is in `ACTIVE` state, THE Chat_View SHALL render a Chat_Thread in which each presented Interview_Question appears as an `assistant` Chat_Message and each submitted Candidate_Answer appears as a `user` Chat_Message.
2. THE Chat_View SHALL present Interview_Questions one at a time, ordered by ascending 1-based position, advancing to the next unanswered Interview_Question only after the Current_Question has received a Candidate_Answer.
3. WHEN an Interview_Session transitions to `ACTIVE` state, THE Chat_View SHALL present the Interview_Question at position 1 as an `assistant` Chat_Message and SHALL set that Interview_Question as the Current_Question.
4. WHEN a Candidate_Answer is accepted by the Interview_Store for the Current_Question and at least one unanswered Interview_Question remains, THE Chat_View SHALL append the corresponding `user` Chat_Message to the Chat_Thread and SHALL then append the lowest-positioned unanswered Interview_Question as a new `assistant` Chat_Message that becomes the Current_Question.
5. WHEN a Candidate_Answer is accepted by the Interview_Store for the Current_Question and no unanswered Interview_Question remains, THE Chat_View SHALL append the corresponding `user` Chat_Message to the Chat_Thread and SHALL NOT append any further `assistant` Chat_Message.
6. WHILE an Interview_Session is in `ACTIVE` state, THE Chat_View SHALL display a progress indicator showing the count of answered Interview_Questions and the total Question_Count, and SHALL increment the answered count each time a Candidate_Answer is accepted by the Interview_Store.
7. WHEN a new Chat_Message is appended, THE Chat_View SHALL scroll the Chat_Thread so the most recent Chat_Message is fully visible within the Chat_Thread viewport.
8. WHEN an Authenticated_User reopens an Interview_Session in `ACTIVE` state, THE Chat_View SHALL reconstruct the Chat_Thread from the session's stored Interview_Questions and Candidate_Answers by rendering each already-answered Interview_Question and its Candidate_Answer in ascending 1-based position order, and SHALL present the lowest-positioned unanswered Interview_Question as the Current_Question.

---

### Requirement 3: Text-Mode Answering

**User Story:** As a job seeker who prefers typing, I want to type my answer into a chat composer and send it, so that my response is recorded and evaluated exactly as before.

#### Acceptance Criteria

1. WHILE the Interview_Mode is `text` and an Interview_Session is `ACTIVE`, THE Answer_Composer SHALL provide a text input for the Current_Question and a send control.
2. WHEN an Authenticated_User activates the send control with a Candidate_Answer whose text, after trimming leading and trailing whitespace, has a character count between 1 and 5,000 inclusive for the Current_Question, THE Chat_View SHALL submit that Candidate_Answer and its Response_Latency for that question through the Interview_Store.
3. IF the composed answer is empty or, after trimming leading and trailing whitespace, has a character count of 0, THEN THE Answer_Composer SHALL keep the send control disabled.
4. IF the composed answer's character count exceeds 5,000 characters, THEN THE Answer_Composer SHALL keep the send control disabled and SHALL display a message stating that the maximum length is 5,000 characters.
5. WHEN a Candidate_Answer is sent successfully, THE Answer_Composer SHALL clear its text input for the next Interview_Question.
6. IF an answer submission fails, THEN THE Chat_View SHALL display the error message surfaced by the Interview_Store and SHALL preserve the composed answer text so the Authenticated_User can retry.
7. WHILE a Candidate_Answer submission for the Current_Question is in progress, THE Answer_Composer SHALL keep the send control disabled until the Interview_Store reports the submission as succeeded or failed, so that the same Candidate_Answer is submitted at most once.

---

### Requirement 4: Voice-Mode Question Playback

**User Story:** As a job seeker practicing for a spoken interview, I want the AI's question read aloud, so that the session feels like a real conversation.

#### Acceptance Criteria

1. WHEN the Current_Question is first presented WHILE the Interview_Mode is `voice` and the Speech_Synthesizer is available, THE Speech_Synthesizer SHALL begin reading the Interview_Question text aloud within 2 seconds of the question being presented.
2. WHERE the Interview_Question text exceeds 200 characters, THE Speech_Synthesizer SHALL divide the text into sequential chunks of at most 200 characters each, split on sentence or word boundaries, and synthesize them in order so that the entire question is spoken with no omitted or duplicated text.
3. WHEN the Current_Question audio is available, THE Chat_View SHALL display a replay control that restarts playback from the beginning of the Current_Question.
4. WHILE the Speech_Synthesizer is reading a question aloud, THE Chat_View SHALL display a stop control that halts playback within 1 second of activation.
5. WHILE the Speech_Synthesizer is reading a question aloud, THE Chat_View SHALL continue to display the complete Caption_Text of that question so the full content is available without audio.
6. IF the Speech_Synthesizer is unavailable in the current browser, THEN THE Chat_View SHALL present the Interview_Question as Caption_Text only and SHALL continue the Voice_Turn without audio playback.
7. IF the Speech_Synthesizer fails after playback has begun, THEN THE Chat_View SHALL present the complete Interview_Question as Caption_Text, SHALL display an indication that audio playback failed, and SHALL continue the Voice_Turn without audio playback.

---

### Requirement 5: Voice-Mode Answer Capture and Transcription

**User Story:** As a job seeker, I want to tap a mic control, speak my answer, and have it transcribed into text I can review, so that I can answer by voice and still verify what was captured.

#### Acceptance Criteria

1. WHILE the Interview_Mode is `voice` and the Speech_Recognizer is available, THE Answer_Composer SHALL provide a microphone control that starts and stops speech capture for the Current_Question.
2. WHEN the Authenticated_User starts speech capture, THE Speech_Recognizer SHALL begin recognition using the BCP-47 language tag from `navigator.language` and SHALL produce interim recognized text and finalized recognized text into the Transcript.
3. IF `navigator.language` is empty, undefined, or unavailable, THEN THE Speech_Recognizer SHALL begin recognition using the default language tag `en-US`.
4. WHILE speech capture is active, THE Chat_View SHALL display the live Transcript, including interim recognized text, as Caption_Text within 300 milliseconds of recognition producing it.
5. WHEN finalized recognized text is produced, THE Speech_Recognizer SHALL append the finalized text to the Transcript exactly once so that no finalized segment is duplicated or lost between recognition results.
6. WHEN the Authenticated_User stops speech capture or the recognition session ends, THE Speech_Recognizer SHALL flush any pending interim recognized text into the finalized Transcript so that the last spoken words are not lost.
7. WHILE speech capture is active and the underlying recognition session ends before the Authenticated_User stops capture, THE Speech_Recognizer SHALL automatically restart recognition within 1,000 milliseconds, preserve the accumulated Transcript, and continue until the Authenticated_User stops capture.
8. WHEN the Authenticated_User stops speech capture, THE Speech_Recognizer SHALL NOT automatically restart recognition.
9. WHEN the Authenticated_User stops speech capture, THE Chat_View SHALL present the accumulated Transcript in an editable input so the Authenticated_User can review and edit it before sending.
10. WHEN the Authenticated_User sends the answer in voice mode, THE Chat_View SHALL read the current editable Transcript value synchronously at the moment of send activation and SHALL submit that exact text, including any manual edits, as the Candidate_Answer with its Response_Latency through the Interview_Store.
11. IF the reviewed Transcript is empty or contains only whitespace, THEN THE Answer_Composer SHALL keep the send control disabled.
12. IF the reviewed Transcript exceeds 5,000 characters, THEN THE Answer_Composer SHALL keep the send control disabled and SHALL display a message stating the maximum length is 5,000 characters.
13. WHERE the Speech_Recognizer is active, THE Answer_Composer SHALL also allow the Authenticated_User to type or edit the answer text directly so voice and typing can be combined.

---

### Requirement 6: Response Latency Measurement

**User Story:** As a job seeker, I want the time I take to answer to be measured the same way regardless of mode, so that my latency score stays accurate and consistent with the existing scorecard.

#### Acceptance Criteria

1. WHEN the Current_Question is first rendered as an `assistant` Chat_Message in the Chat_Thread, THE Chat_View SHALL record a presentation timestamp for that Interview_Question exactly once, and SHALL NOT overwrite that timestamp on any subsequent re-render, scroll, or remount of the same Interview_Question.
2. WHEN a Candidate_Answer is sent for an Interview_Question, THE Chat_View SHALL compute the Response_Latency as the elapsed time between the recorded presentation timestamp and the send moment, clamped to a minimum of 0 seconds and rounded to the nearest whole second, and SHALL submit that Response_Latency in seconds with the answer through the Interview_Store.
3. THE Chat_View SHALL compute Response_Latency using an identical method for both `text` and `voice` Interview_Mode, where the measurement start is the recorded presentation timestamp and the measurement end is the answer send moment, such that any Speech_Synthesizer read-aloud duration or Speech_Recognizer transcription duration in `voice` Interview_Mode is included in the same way as elapsed time is in `text` Interview_Mode.
4. IF a Candidate_Answer is sent for an Interview_Question for which no presentation timestamp was recorded, THEN THE Chat_View SHALL submit a Response_Latency of 0 seconds with the answer and SHALL NOT block the submission.

---

### Requirement 7: Session Completion and Scorecard from the Chat View

**User Story:** As a job seeker, I want to finish the conversation and see my performance scorecard, so that I get the same feedback as the existing simulator without leaving the chat experience.

#### Acceptance Criteria

1. WHEN the Candidate_Answer for the final unanswered Interview_Question is sent and accepted, THE Chat_View SHALL reflect the Interview_Session transition to `COMPLETED` as surfaced by the Interview_Store and SHALL stop presenting the Answer_Composer for further answers.
2. WHILE the Interview_Session is `COMPLETED` or `SCORED`, THE Chat_View SHALL provide an enabled control to compute and view the Performance_Scorecard through the Interview_Store.
3. WHEN the Authenticated_User requests the Performance_Scorecard for a `COMPLETED` session, THE Chat_View SHALL trigger scorecard computation through the Interview_Store and SHALL display the returned Performance_Scorecard including its answer-quality, grammar, latency, pressure, and overall values and its pass/fail result.
4. WHILE scorecard computation is in progress, THE Chat_View SHALL disable the compute control and SHALL display a progress indication, so that no more than one computation request is issued per user action.
5. WHEN the Interview_Session is already `SCORED`, THE Chat_View SHALL display the existing Performance_Scorecard, including its answer-quality, grammar, latency, pressure, and overall values and its pass/fail result, without triggering recomputation.
6. IF scorecard computation fails, THEN THE Chat_View SHALL display the error message surfaced by the Interview_Store and SHALL re-enable the compute control so the Authenticated_User can retry.

---

### Requirement 8: Voice Support Detection and Graceful Fallback

**User Story:** As a job seeker on any browser, I want the app to handle missing voice support cleanly, so that I can always complete an interview by typing.

#### Acceptance Criteria

1. WHEN the Chat_View loads the Session_Setup, THE Chat_View SHALL complete Support_Detection for the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) and `speechSynthesis` before enabling Interview_Mode selection.
2. IF Support_Detection determines the Web Speech API is unavailable in the current browser, THEN THE Session_Setup SHALL disable the `voice` Interview_Mode option, SHALL display a message stating that voice mode is unavailable in the current browser, and SHALL apply Interview_Mode_Fallback by restricting selection to `text` Interview_Mode.
3. IF the Web Speech API becomes unavailable, or speech capture fails to start within 5 seconds of being requested, during an active voice-mode Interview_Session, THEN THE Chat_View SHALL switch the Interview_Mode to `text` and SHALL display a message explaining that the session has switched to text answering.
4. WHEN Interview_Mode_Fallback occurs during an active Interview_Session, THE Chat_View SHALL retain the already-presented Caption_Text of the Current_Question and any accumulated Transcript so that no answered or in-progress content is lost.
5. WHILE the Interview_Mode is `text` due to Interview_Mode_Fallback, THE Chat_View SHALL provide the Answer_Composer text input so the Authenticated_User can type and send Candidate_Answers for all remaining Interview_Questions.

---

### Requirement 9: Microphone Permission Handling

**User Story:** As a job seeker, I want a clear path forward if I deny or have not granted microphone access, so that I am never stuck unable to answer.

#### Acceptance Criteria

1. WHEN an Authenticated_User starts speech capture in a voice-mode session and microphone permission has not yet been granted or denied for the current browser origin, THE Chat_View SHALL initiate the browser microphone permission request through the Speech_Recognizer within 1 second of the start action.
2. WHEN microphone permission is granted in response to the request, THE Speech_Recognizer SHALL begin speech capture for the Current_Question without requiring a second start action.
3. IF microphone permission is denied, THEN THE Chat_View SHALL display a message indicating that voice answering requires microphone access and SHALL apply Interview_Mode_Fallback so the Authenticated_User can answer the Current_Question by typing.
4. IF microphone permission is denied, THEN THE Chat_View SHALL keep the already-presented Caption_Text of the Current_Question and any accumulated Transcript visible so the Authenticated_User can answer without the question being re-presented and without losing captured content.
5. IF the Authenticated_User dismisses the microphone permission request without granting or denying it, THEN THE Chat_View SHALL keep the microphone control available so the Authenticated_User can re-initiate the permission request, and SHALL keep the Current_Question answerable by typing in the meantime.
6. WHERE microphone permission was previously denied for the current browser origin, THE Answer_Composer SHALL present the text input for answering the Current_Question and SHALL display instructional text describing the steps to re-enable microphone access in the browser.

---

### Requirement 10: Accessibility and Captions

**User Story:** As a job seeker who relies on a keyboard or assistive technology, I want full keyboard operability and visible text for all spoken content, so that I can complete the interview without depending on audio.

#### Acceptance Criteria

1. THE Chat_View SHALL render every Interview_Question and every Candidate_Answer as visible Caption_Text in the Chat_Thread for the entire duration that the corresponding Chat_Message is present, such that no interview content is conveyed by audio alone.
2. THE Chat_View SHALL make every interactive control — including Session_Setup inputs, the send control, the microphone control, replay and stop controls, and the scorecard control — reachable via Tab / Shift+Tab in a logical focus order and activatable via the Enter and Space keys.
3. THE Chat_View SHALL render a visible focus indicator, visually distinct from the unfocused appearance, on whichever interactive control currently holds keyboard focus.
4. THE Chat_View SHALL provide a programmatically determinable accessible name for every icon-only control, including the microphone, replay, and stop controls.
5. WHEN a new Chat_Message is appended to the Chat_Thread, THE Chat_View SHALL announce the new message content to assistive technology through an ARIA live region within 1 second.
6. WHEN the microphone control transitions between idle and capturing, THE Chat_View SHALL expose the new capture state to assistive technology.
7. THE Chat_View SHALL programmatically associate every validation or error message with the control it pertains to, so that assistive technology announces the message with that control.

---

### Requirement 11: Browser-Native Voice Implementation Constraint

**User Story:** As a platform maintainer, I want voice features to use only browser-native APIs, so that the feature ships without new backend secrets, API keys, or third-party dependencies.

#### Acceptance Criteria

1. THE Interview_Chat_Feature SHALL implement speech-to-text using only the browser-native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) and SHALL implement text-to-speech using only the browser-native `speechSynthesis` API, with all recognition and synthesis running client-side and no candidate audio or text sent to any external speech service.
2. THE Interview_Chat_Feature SHALL NOT introduce any new backend endpoint, environment variable, server-side secret, API key, third-party voice service, or new third-party runtime dependency (npm package or SDK) to deliver text answering, voice answering, reading questions aloud, answer evaluation, or Performance_Scorecard computation.
3. THE Interview_Chat_Feature SHALL submit answers, request evaluation, and request the Performance_Scorecard exclusively through the existing `/api/v1/interview/*` endpoints via the Interview_Service, and SHALL NOT call any other backend or external endpoint for these operations.
4. THE Interview_Chat_Feature SHALL NOT transmit raw candidate audio to the backend and SHALL NOT store raw candidate audio on the backend; only the transcribed Candidate_Answer text (1 to 5,000 characters) SHALL be sent through the existing answer-submission endpoint.

---

### Requirement 12: Optional Voice Enhancements

**User Story:** As a job seeker, I would enjoy richer voice visuals and playback, so that the experience feels more immersive — but these are secondary to being able to complete the interview.

#### Acceptance Criteria

1. WHERE an audio-reactive orb or waveform visualizer is enabled as an optional enhancement, THE Chat_View SHALL render it as a supplementary visual only and SHALL keep all answer-input controls fully operable while the visualizer is rendering, loading, or has failed to render.
2. WHERE an audio-reactive orb or waveform visualizer is enabled as an optional enhancement, IF the visualizer fails to initialize or render, THEN THE Chat_View SHALL suppress the visualizer, SHALL keep the interview answerable, and SHALL NOT block or disable any answer-input control.
3. WHERE microphone recording playback is enabled as an optional enhancement, THE Chat_View SHALL allow the Authenticated_User to replay their captured audio locally within the browser session and SHALL NOT transmit the captured audio to the backend.
4. WHERE microphone recording playback is enabled as an optional enhancement, WHEN the Authenticated_User ends the interview session or reloads the Chat_View, THE Chat_View SHALL discard the locally captured audio so that no captured audio persists across sessions.
5. WHERE a karaoke-style subtitle that highlights spoken words is enabled as an optional enhancement, THE Chat_View SHALL keep the complete Caption_Text readable and selectable independently of the per-word highlight state at all times.
6. WHERE a karaoke-style subtitle that highlights spoken words is enabled as an optional enhancement, IF the word-highlight synchronization fails, THEN THE Chat_View SHALL continue to display the complete Caption_Text without the highlight.
7. WHERE a cloud text-to-speech provider is considered as a future enhancement, THE Interview_Chat_Feature SHALL treat it as out of current scope and SHALL use the browser-native `speechSynthesis` API as the default speech output, requiring zero API keys and zero backend secrets.

---

### Requirement 13: Cohesive Layout for Scorecard, Sessions, and STAR Pages

**User Story:** As a job seeker, I want the Scorecard, Sessions, and STAR Organizer screens to share a clean, consistent layout, so that the interview module feels cohesive and easy to scan.

#### Acceptance Criteria

1. THE Sessions_Page, Scorecard_Page, and Star_Page SHALL present their primary content within the platform's standard rounded panel surfaces on the app canvas, using the shared brand palette and spacing conventions consistent with the rest of the application.
2. THE Sessions_Page SHALL present the Authenticated_User's past Interview_Sessions ordered newest first, with each entry showing the Lifecycle_State, the Difficulty_Tier, the creation date, and — where a Performance_Scorecard exists — the overall score and the pass/fail result.
3. THE Scorecard_Page SHALL present the four dimension scores (answer quality, grammar, latency, pressure), the overall score, and the pass/fail result using the shared score-dial and tier-badge presentational components in a consistent arrangement.
4. THE Star_Page SHALL present the STAR create form and the saved-stories list as two clearly separated sections within the consistent panel layout.
5. THE Sessions_Page, Scorecard_Page, and Star_Page SHALL use semantic headings and SHALL make every interactive control keyboard-operable with a visible focus indicator, consistent with the accessibility behavior required of the Chat_View.
6. WHERE a page has no data to display (no sessions, no STAR stories, or no scorecard yet), THE page SHALL present an explicit empty-state message within the same panel layout rather than a blank area.

---

### Requirement 14: Skeleton Loading States

**User Story:** As a job seeker, I want to see skeleton placeholders while interview data loads, so that the app feels responsive and I know content is on the way.

#### Acceptance Criteria

1. WHILE the Sessions_Page is loading the list of Interview_Sessions, THE Sessions_Page SHALL display a Skeleton_Placeholder approximating the session-list layout instead of a blank area or a bare spinner.
2. WHILE the Scorecard_Page is computing or fetching a Performance_Scorecard, THE Scorecard_Page SHALL display a Skeleton_Placeholder approximating the scorecard layout.
3. WHILE the Star_Page is loading the list of STAR stories, THE Star_Page SHALL display a Skeleton_Placeholder approximating the stories-list layout.
4. WHEN data finishes loading successfully, THE page SHALL replace the Skeleton_Placeholder with the actual content.
5. IF loading fails, THEN THE page SHALL replace the Skeleton_Placeholder with the error message surfaced by the Interview_Store and SHALL preserve any previously loaded content.
6. THE Skeleton_Placeholder SHALL be conveyed to assistive technology as a busy/loading state (for example via `aria-busy` or an appropriate `role="status"` region) and SHALL NOT be announced as real content.
7. WHILE a Skeleton_Placeholder is displayed, THE page SHALL NOT present the placeholder shapes as focusable or interactive controls.
