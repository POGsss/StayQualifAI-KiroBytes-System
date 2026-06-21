# Requirements Document

## Introduction

This document specifies the requirements for the **Interview Chat & Voice** feature — a frontend-focused enhancement of the existing **Module 2: Interview** (the Custom Interview Simulator). It reshapes the simulator's presentation into a simplified, chat-style conversation with an AI panelist and adds a choice of answering by typing (**text mode**) or by speaking (**voice mode**), alongside the existing difficulty-tier and question-count selection.

The feature is purely a frontend refactor and addition. It MUST reuse the existing Interview backend lifecycle and `/api/v1/interview/*` endpoints unchanged: a session still progresses through `PENDING → ACTIVE → COMPLETED → SCORED`; questions are still generated server-side; answers are still submitted one per question with a client-measured response latency; evaluation and the multi-dimensional scorecard are still computed by the backend. No change to the scoring algorithm, the STAR organizer, or the backend domain is in scope.

Voice capability is delivered with **browser-native Web APIs only** — the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) for speech-to-text and `speechSynthesis` for text-to-speech — so the feature requires no new backend secrets, no API keys, and no third-party services. When a browser does not support these APIs, or the user denies microphone permission, the feature degrades gracefully to text mode. Cloud text-to-speech providers, an audio-reactive orb, a waveform visualizer, and microphone recording playback are explicitly out of the core scope and are captured only as clearly-marked optional enhancements.

This specification defines requirements only. Design and implementation tasks are produced in later phases after user review and approval.

---

## Glossary

- **Interview_Chat_Feature**: The complete frontend feature set defined by this document — the chat-style interview presentation plus text and voice answering modes.
- **Chat_View**: The React page (within `pages/Interview/`) that presents an Interview_Session as a conversation thread and hosts the answer composer and voice controls. It replaces the prior simulator presentation while preserving the underlying session lifecycle.
- **Chat_Thread**: The ordered, scrollable list of Chat_Messages rendered by the Chat_View representing the back-and-forth between the AI panelist and the candidate.
- **Chat_Message**: A single entry in the Chat_Thread. A Chat_Message has a role of either `assistant` (an Interview_Question spoken/shown by the AI panelist) or `user` (a submitted Candidate_Answer).
- **Interview_Mode**: The answering mode chosen at session start, one of two enumerated values — `text` (the candidate types answers) or `voice` (the candidate speaks answers).
- **Session_Setup**: The Chat_View's pre-session configuration step where the candidate selects Interview_Mode, Difficulty_Tier, and Question_Count, supplies the Job_Description, and optionally references a resume version, before creating and starting the Interview_Session.
- **Answer_Composer**: The Chat_View control through which the candidate composes and sends a Candidate_Answer for the current Interview_Question.
- **Speech_Recognizer**: The frontend wrapper over the browser-native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) that converts the candidate's spoken audio into a Transcript during voice mode.
- **Speech_Synthesizer**: The frontend wrapper over the browser-native `speechSynthesis` API that reads an Interview_Question aloud during voice mode.
- **Transcript**: The text produced by the Speech_Recognizer from the candidate's speech, comprising finalized recognized text and any pending interim recognized text.
- **Voice_Turn**: One voice-mode cycle for a single Interview_Question: the Speech_Synthesizer reads the question aloud, the candidate dictates an answer that the Speech_Recognizer transcribes, the candidate reviews and optionally edits the Transcript, and the candidate sends the answer.
- **Current_Question**: The single unanswered Interview_Question, ordered by 1-based position, that the Chat_View is presenting and accepting an answer for at a given moment.
- **Response_Latency**: The elapsed time in seconds between the moment the Current_Question is first presented in the Chat_Thread and the moment its Candidate_Answer is sent, measured client-side and submitted with the answer (consistent with the existing Interview module Response_Latency).
- **Caption_Text**: The always-present visible text of an Interview_Question (and, for voice mode, the live Transcript) rendered in the Chat_Thread so that no content is conveyed by audio alone.
- **Support_Detection**: The Chat_View's runtime determination of whether the current browser exposes the Web Speech API and `speechSynthesis`.
- **Interview_Mode_Fallback**: The behavior of switching to, or restricting selection to, `text` Interview_Mode when voice capability is unavailable or microphone permission is denied.
- **Interview_Service**: The existing frontend data-access module `services/interview.service.ts` that calls `/api/v1/interview/*`. Reused unchanged.
- **Interview_Store**: The existing Zustand store `stores/interview.store.ts` that owns interview client state and delegates to the Interview_Service. Reused, extended only with frontend-local voice/chat UI state.
- **Interview_Session**: A persisted mock-interview run as defined by the existing Interview module, with a Lifecycle_State of `PENDING`, `ACTIVE`, `COMPLETED`, or `SCORED`. Reused by reference.
- **Interview_Question**: A single generated question within an Interview_Session, identified by its 1-based position. Reused by reference.
- **Candidate_Answer**: The text (1–5 000 characters) submitted in response to an Interview_Question. Reused by reference.
- **Difficulty_Tier**: One of `ENTRY`, `MID`, `SENIOR`, `LEAD`, as defined by the existing Interview module. Reused by reference.
- **Question_Count**: A positive integer between 5 and 15 inclusive, as defined by the existing Interview module. Reused by reference.
- **Job_Description**: User-supplied plain text (1–5 000 characters) describing the target role. Reused by reference.
- **Performance_Scorecard**: The multi-dimensional result (answer quality, grammar, latency, pressure, overall, pass/fail) computed by the existing Interview backend for a `COMPLETED` or `SCORED` session. Reused by reference.
- **Lifecycle_State**: The state of an Interview_Session — `PENDING`, `ACTIVE`, `COMPLETED`, or `SCORED`. Reused by reference.
- **Authenticated_User**: A user with a valid Supabase authentication session interacting with the Interview_Chat_Feature.

---

## Requirements

### Requirement 1: Session Setup with Mode, Difficulty, and Question Count

**User Story:** As a job seeker, I want to choose how I will answer (typing or speaking) along with the difficulty and number of questions before I begin, so that the mock interview matches how I want to practice.

#### Acceptance Criteria

1. WHEN an Authenticated_User opens the Chat_View without an active Interview_Session, THE Chat_View SHALL present a Session_Setup that offers selection of an Interview_Mode (`text` or `voice`), a Difficulty_Tier (`ENTRY`, `MID`, `SENIOR`, or `LEAD`), and a Question_Count (an integer from 5 to 15 inclusive), and an input for the Job_Description.
2. THE Session_Setup SHALL default the Interview_Mode to `text`.
3. WHEN an Authenticated_User submits the Session_Setup with a selected Interview_Mode, a valid Difficulty_Tier, a Question_Count within 5 to 15 inclusive, and a Job_Description of 1 to 5 000 characters, THE Chat_View SHALL create an Interview_Session through the Interview_Store and SHALL retain the selected Interview_Mode in frontend state for the duration of the session.
4. WHERE an Authenticated_User supplies a resume version reference in the Session_Setup, THE Chat_View SHALL include that reference in the session-creation request through the Interview_Store.
5. IF the Job_Description is empty or contains only whitespace, THEN THE Chat_View SHALL keep the create control disabled and SHALL display a message indicating the Job_Description is required.
6. IF the Question_Count is outside the range 5 to 15 inclusive, THEN THE Chat_View SHALL keep the create control disabled and SHALL display a message stating the valid range.
7. WHEN an Interview_Session is created successfully, THE Chat_View SHALL start the session through the Interview_Store so that Interview_Questions are generated and the session transitions to `ACTIVE`.
8. IF session creation or session start fails, THEN THE Chat_View SHALL display the error message surfaced by the Interview_Store and SHALL keep the Session_Setup available so the Authenticated_User can retry.

---

### Requirement 2: Chat-Thread Presentation of the Interview

**User Story:** As a job seeker, I want the interview to look like a chat with an AI interviewer, so that the experience feels simple and conversational.

#### Acceptance Criteria

1. WHILE an Interview_Session is in `ACTIVE` state, THE Chat_View SHALL render a Chat_Thread in which each presented Interview_Question appears as an `assistant` Chat_Message and each submitted Candidate_Answer appears as a `user` Chat_Message.
2. THE Chat_View SHALL present Interview_Questions one at a time, ordered by ascending 1-based position, advancing to the next unanswered Interview_Question only after the Current_Question has received a Candidate_Answer.
3. WHEN a Candidate_Answer is sent for the Current_Question, THE Chat_View SHALL append the corresponding `user` Chat_Message to the Chat_Thread and SHALL append the next Interview_Question as a new `assistant` Chat_Message if an unanswered question remains.
4. THE Chat_View SHALL display the candidate's progress through the session as a count of answered Interview_Questions out of the total Question_Count.
5. WHEN a new Chat_Message is appended, THE Chat_View SHALL scroll the Chat_Thread so the most recent Chat_Message is visible.
6. WHEN an Authenticated_User reopens an in-progress Interview_Session, THE Chat_View SHALL reconstruct the Chat_Thread from the session's stored Interview_Questions and Candidate_Answers so that already-answered questions and their answers are shown in position order.

---

### Requirement 3: Text-Mode Answering

**User Story:** As a job seeker who prefers typing, I want to type my answer into a chat composer and send it, so that my response is recorded and evaluated exactly as before.

#### Acceptance Criteria

1. WHILE the Interview_Mode is `text` and an Interview_Session is `ACTIVE`, THE Answer_Composer SHALL provide a text input for the Current_Question and a send control.
2. WHEN an Authenticated_User sends a non-empty Candidate_Answer of 1 to 5 000 characters for the Current_Question, THE Chat_View SHALL submit the Candidate_Answer and its Response_Latency for that question through the Interview_Store.
3. IF the composed answer is empty or contains only whitespace, THEN THE Answer_Composer SHALL keep the send control disabled.
4. IF the composed answer exceeds 5 000 characters, THEN THE Answer_Composer SHALL keep the send control disabled and SHALL display a message stating the maximum length.
5. WHEN a Candidate_Answer is sent successfully, THE Answer_Composer SHALL clear its text input for the next Interview_Question.
6. IF an answer submission fails, THEN THE Chat_View SHALL display the error message surfaced by the Interview_Store and SHALL preserve the composed answer text so the Authenticated_User can retry.

---

### Requirement 4: Voice-Mode Question Playback

**User Story:** As a job seeker practicing for a spoken interview, I want the AI's question read aloud, so that the session feels like a real conversation.

#### Acceptance Criteria

1. WHEN the Current_Question is first presented WHILE the Interview_Mode is `voice` and the Speech_Synthesizer is available, THE Speech_Synthesizer SHALL read the Interview_Question text aloud.
2. WHERE an Interview_Question text is long, THE Speech_Synthesizer SHALL divide the text into sequential chunks for synthesis so that the entire question is spoken.
3. THE Chat_View SHALL provide a control to replay the Current_Question audio and a control to stop playback.
4. WHILE the Speech_Synthesizer is reading a question aloud, THE Chat_View SHALL continue to display the full Caption_Text of that question so the content is available without audio.
5. IF the Speech_Synthesizer is unavailable in the current browser, THEN THE Chat_View SHALL present the Interview_Question as Caption_Text only and SHALL continue the Voice_Turn without audio playback.

---

### Requirement 5: Voice-Mode Answer Capture and Transcription

**User Story:** As a job seeker, I want to tap a mic control, speak my answer, and have it transcribed into text I can review, so that I can answer by voice and still verify what was captured.

#### Acceptance Criteria

1. WHILE the Interview_Mode is `voice` and the Speech_Recognizer is available, THE Answer_Composer SHALL provide a microphone control that starts and stops speech capture for the Current_Question.
2. WHEN the Authenticated_User starts speech capture, THE Speech_Recognizer SHALL begin recognition using the language indicated by `navigator.language` and SHALL produce interim recognized text and finalized recognized text into the Transcript.
3. WHILE speech capture is active, THE Chat_View SHALL display the live Transcript, including interim recognized text, as Caption_Text.
4. WHEN finalized recognized text is produced, THE Speech_Recognizer SHALL append the finalized text to the Transcript so that no finalized segment is lost between recognition results.
5. WHILE speech capture is active and the underlying recognition session ends before the Authenticated_User stops capture, THE Speech_Recognizer SHALL automatically restart recognition so capture continues until the Authenticated_User stops it.
6. WHEN the Authenticated_User stops speech capture, THE Chat_View SHALL present the accumulated Transcript in an editable input so the Authenticated_User can review and edit it before sending.
7. WHEN the Authenticated_User sends the answer in voice mode, THE Chat_View SHALL read the current Transcript value synchronously at send time and submit that exact text as the Candidate_Answer with its Response_Latency through the Interview_Store.
8. IF the reviewed Transcript is empty or contains only whitespace, THEN THE Answer_Composer SHALL keep the send control disabled.
9. WHERE the Speech_Recognizer is active, THE Answer_Composer SHALL also allow the Authenticated_User to type or edit the answer text directly so voice and typing can be combined.

---

### Requirement 6: Response Latency Measurement

**User Story:** As a job seeker, I want the time I take to answer to be measured the same way regardless of mode, so that my latency score stays accurate and consistent with the existing scorecard.

#### Acceptance Criteria

1. WHEN the Current_Question is first presented in the Chat_Thread, THE Chat_View SHALL record the presentation time for that Interview_Question.
2. WHEN a Candidate_Answer is sent for an Interview_Question, THE Chat_View SHALL compute the Response_Latency as the non-negative elapsed seconds between the recorded presentation time and the send time, and SHALL submit that Response_Latency with the answer.
3. THE Chat_View SHALL measure Response_Latency identically for `text` and `voice` Interview_Mode, measuring from question presentation to answer send in both modes.

---

### Requirement 7: Session Completion and Scorecard from the Chat View

**User Story:** As a job seeker, I want to finish the conversation and see my performance scorecard, so that I get the same feedback as the existing simulator without leaving the chat experience.

#### Acceptance Criteria

1. WHEN the Candidate_Answer for the final unanswered Interview_Question is sent and accepted, THE Chat_View SHALL reflect the Interview_Session transition to `COMPLETED` as surfaced by the Interview_Store.
2. WHILE the Interview_Session is `COMPLETED` or `SCORED`, THE Chat_View SHALL provide a control to compute and view the Performance_Scorecard through the Interview_Store.
3. WHEN the Authenticated_User requests the Performance_Scorecard for a `COMPLETED` session, THE Chat_View SHALL trigger scorecard computation through the Interview_Store and SHALL display the returned Performance_Scorecard.
4. WHEN the Interview_Session is already `SCORED`, THE Chat_View SHALL display the existing Performance_Scorecard without triggering recomputation.
5. IF scorecard computation fails, THEN THE Chat_View SHALL display the error message surfaced by the Interview_Store and SHALL keep the compute control available so the Authenticated_User can retry.

---

### Requirement 8: Voice Support Detection and Graceful Fallback

**User Story:** As a job seeker on any browser, I want the app to handle missing voice support cleanly, so that I can always complete an interview by typing.

#### Acceptance Criteria

1. WHEN the Chat_View loads the Session_Setup, THE Chat_View SHALL perform Support_Detection for the Web Speech API and `speechSynthesis`.
2. IF the Web Speech API is unavailable in the current browser, THEN THE Session_Setup SHALL indicate that voice mode is unavailable and SHALL apply Interview_Mode_Fallback by restricting selection to `text` Interview_Mode.
3. IF the Web Speech API becomes unavailable or fails to start during an active voice-mode session, THEN THE Chat_View SHALL switch the Interview_Mode to `text`, SHALL display a message explaining the switch, and SHALL keep the already-presented Caption_Text and any accumulated Transcript so no answered content is lost.
4. WHILE the Interview_Mode is `text` due to Interview_Mode_Fallback, THE Chat_View SHALL allow the Authenticated_User to complete the remaining Interview_Questions by typing.

---

### Requirement 9: Microphone Permission Handling

**User Story:** As a job seeker, I want a clear path forward if I deny or have not granted microphone access, so that I am never stuck unable to answer.

#### Acceptance Criteria

1. WHEN an Authenticated_User starts speech capture for the first time in a voice-mode session, THE Chat_View SHALL initiate the browser microphone permission request through the Speech_Recognizer.
2. IF microphone permission is denied, THEN THE Chat_View SHALL display a message explaining that voice answering requires microphone access and SHALL apply Interview_Mode_Fallback so the Authenticated_User can answer the Current_Question by typing.
3. IF microphone permission is denied, THEN THE Chat_View SHALL keep the already-presented Caption_Text of the Current_Question visible so the Authenticated_User can answer without re-presenting the question.
4. WHERE microphone permission was previously denied, THE Answer_Composer SHALL present the text input for answering and SHALL indicate how the Authenticated_User can re-enable microphone access in the browser.

---

### Requirement 10: Accessibility and Captions

**User Story:** As a job seeker who relies on a keyboard or assistive technology, I want full keyboard operability and visible text for all spoken content, so that I can complete the interview without depending on audio.

#### Acceptance Criteria

1. THE Chat_View SHALL render every Interview_Question and every Candidate_Answer as visible Caption_Text in the Chat_Thread, such that no interview content is conveyed by audio alone.
2. THE Chat_View SHALL make every interactive control — including Session_Setup inputs, the send control, the microphone control, replay and stop controls, and the scorecard control — operable by keyboard and SHALL render a visible focus indicator on the focused control.
3. THE Chat_View SHALL provide an accessible name for every icon-only control, including the microphone, replay, and stop controls.
4. WHEN a new Chat_Message is appended to the Chat_Thread, THE Chat_View SHALL announce the update to assistive technology through an ARIA live region.
5. THE microphone control SHALL expose its current capture state (idle or capturing) to assistive technology.

---

### Requirement 11: Browser-Native Voice Implementation Constraint

**User Story:** As a platform maintainer, I want voice features to use only browser-native APIs, so that the feature ships without new backend secrets, API keys, or third-party dependencies.

#### Acceptance Criteria

1. THE Interview_Chat_Feature SHALL implement speech-to-text using only the browser-native Web Speech API and SHALL implement text-to-speech using only the browser-native `speechSynthesis` API.
2. THE Interview_Chat_Feature SHALL NOT introduce any new backend endpoint, environment variable, API key, or third-party voice service to deliver core text and voice answering.
3. THE Interview_Chat_Feature SHALL submit answers, request evaluation, and request the Performance_Scorecard exclusively through the existing `/api/v1/interview/*` endpoints via the Interview_Service.
4. THE Interview_Chat_Feature SHALL NOT transmit or store raw candidate audio on the backend; only the transcribed Candidate_Answer text SHALL be sent through the existing answer-submission endpoint.

---

### Requirement 12: Optional Voice Enhancements

**User Story:** As a job seeker, I would enjoy richer voice visuals and playback, so that the experience feels more immersive — but these are secondary to being able to complete the interview.

#### Acceptance Criteria

1. WHERE an audio-reactive orb or waveform visualizer is enabled as an optional enhancement, THE Chat_View SHALL render it as a supplementary visual only and SHALL NOT make answering depend on it.
2. WHERE microphone recording playback is enabled as an optional enhancement, THE Chat_View SHALL allow the Authenticated_User to replay their captured audio locally in the browser and SHALL NOT upload the audio to the backend.
3. WHERE a karaoke-style subtitle that highlights spoken words is enabled as an optional enhancement, THE Chat_View SHALL keep the full Caption_Text available independently of the highlight.
4. WHERE a cloud text-to-speech provider is considered as a future enhancement, THE Interview_Chat_Feature SHALL treat it as out of current scope and SHALL retain the browser-native `speechSynthesis` API as the default that requires no API keys or backend secrets.
