# Requirements Document

## Introduction

This feature adds the missing authentication and session layer to StayQualifAI. Today every backend `/api/v1/*` route is protected by the shared `requireAuth` middleware, which requires an `Authorization: Bearer <supabase-jwt>` header. The frontend service files expose `setAuthToken(token)` to attach that bearer token to every request, but nothing currently calls it because there is no login flow. As a result, all API calls fail with HTTP 401 ("Missing or malformed Authorization header"). This feature closes that gap.

Scope is intentionally narrow: **Google OAuth sign-in only**, performed through Supabase Auth (`signInWithOAuth` with provider `google`). There is no email/password signup or login, no magic links, and no other identity providers. The feature delivers a login screen with a single "Continue with Google" action, handles the OAuth redirect/callback, establishes a Supabase session, propagates the session access token into the frontend API layer via `setAuthToken`, refreshes the token on rotation, guards routes so only authenticated users reach the app modules, signs the user out through the existing sidebar "Log out" control, persists the session across reloads, and displays the signed-in user's identity in the existing top-bar profile control.

The backend requires no changes: the existing `requireAuth` middleware already validates Google-issued Supabase JWTs and derives `req.user` and a per-request RLS-scoped `req.supabase` client from the token. RLS remains the source of truth for ownership.

This feature introduces a **scoped exception** to the steering rule that the frontend never imports the Supabase client: the frontend MAY use a Supabase Auth client **for authentication and session management only**. All application data continues to flow exclusively through the backend Express API; the Supabase client is never used for data access.

Out of scope: account management, roles/permissions beyond per-user RLS, email/password authentication, password reset, multi-factor authentication, and multiple OAuth providers.

## Glossary

- **Auth_System**: The frontend authentication subsystem introduced by this feature — comprising the login screen, the Supabase Auth client wrapper, the auth Zustand store, the route guard, and the session-to-API token propagation logic.
- **Login_Screen**: The unauthenticated-state page that presents the single "Continue with Google" sign-in action.
- **Supabase_Auth_Client**: The Supabase JavaScript client instance used by the frontend exclusively for OAuth sign-in, session retrieval, token refresh, and sign-out. It is never used for application data access.
- **Supabase_Session**: The session object returned by Supabase Auth, containing the access token (a JWT), a refresh token, and the authenticated user's profile.
- **Access_Token**: The Supabase-issued JWT carried in `Supabase_Session.access_token`, sent to the backend as `Authorization: Bearer <token>`.
- **API_Token_Layer**: The set of frontend service modules (for example `resume.service.ts`, `interview.service.ts`) that each expose `setAuthToken(token)` to set or clear the module-level bearer token attached to backend requests.
- **Route_Guard**: The frontend mechanism that determines, based on session presence, whether a requested route renders the app modules or redirects to the `Login_Screen`.
- **Log_Out_Control**: The existing "Log out" utility action pinned to the bottom of the fixed sidebar.
- **Profile_Control**: The existing circular profile/avatar control in the white top bar, on the right side.
- **OAuth_Callback**: The redirect destination the browser returns to after the Google authorization step, carrying the parameters Supabase Auth uses to establish a `Supabase_Session`.
- **User_Identity**: The signed-in user's display attributes (name, email, and avatar URL) sourced from the Google profile in `Supabase_Session.user`.

## Requirements

### Requirement 1: Login Screen with Google Sign-In Action

**User Story:** As a visitor, I want a login screen with a single Google sign-in action, so that I can access the application without creating a password.

#### Acceptance Criteria

1. WHILE no `Supabase_Session` is established AND the Auth_System is not determining whether a stored `Supabase_Session` exists, THE Auth_System SHALL render the Login_Screen.
2. THE Login_Screen SHALL present exactly one (1) sign-in action, labeled with the visible text "Continue with Google".
3. THE Login_Screen SHALL NOT present any email field, password field, magic-link action, or alternative identity provider action.
4. WHEN the user activates the "Continue with Google" action, THE Auth_System SHALL initiate a Supabase OAuth sign-in flow using provider `google`; the initiation SHALL be allowed to complete even if it takes longer than 1 second under degraded network or browser conditions, and a duration exceeding 1 second SHALL NOT by itself cause the sign-in attempt to fail.
5. THE "Continue with Google" action SHALL be reachable via keyboard Tab navigation, SHALL be operable using both the Enter and Space keys, and SHALL expose an accessible name equal to its visible label "Continue with Google".
6. WHILE a sign-in initiation triggered by the "Continue with Google" action is in progress and before the browser is redirected, THE Auth_System SHALL disable the "Continue with Google" action so that a second concurrent activation cannot be started.
7. WHEN a sign-in initiation triggered by the "Continue with Google" action succeeds, THE Auth_System SHALL display a loading state on the Login_Screen until the browser is redirected to the Google authorization flow.
8. IF initiating the Supabase OAuth sign-in flow fails before the browser is redirected to the Google authorization flow, THEN THE Auth_System SHALL keep the user on the Login_Screen, stop displaying any loading state, display an authentication-failed message, and re-enable the "Continue with Google" action so the user can retry.

### Requirement 2: OAuth Redirect and Callback Handling

**User Story:** As a user, I want the application to handle the Google sign-in redirect, so that I am returned to the app in a signed-in state.

#### Acceptance Criteria

1. WHEN the user activates the "Continue with Google" action, THE Auth_System SHALL redirect the browser to the Google authorization flow with a configured return URL pointing at the OAuth_Callback.
2. WHEN the browser returns to the OAuth_Callback carrying the authorization parameters that Supabase Auth requires to establish a session, THE Auth_System SHALL establish a Supabase_Session from those parameters in fewer than 10 seconds.
3. WHILE the Auth_System is processing the OAuth_Callback parameters to establish a Supabase_Session, THE Auth_System SHALL display a loading state instead of the Login_Screen or an application module.
4. WHEN a Supabase_Session is established at the OAuth_Callback, THE Auth_System SHALL navigate the user to the application module view.
5. IF the browser returns to the OAuth_Callback without the authorization parameters required to establish a session, OR IF establishing the Supabase_Session takes 10 seconds or longer, THEN THE Auth_System SHALL leave no Supabase_Session established, return the user to the Login_Screen, and display a message indicating that authentication failed.

### Requirement 3: Session Establishment and Token Propagation

**User Story:** As a user, I want my authenticated session token to be attached to API requests, so that backend calls succeed instead of returning 401.

#### Acceptance Criteria

1. WHEN a Supabase_Session is established AND that session carries a non-empty Access_Token, THE Auth_System SHALL set the Access_Token on every module service in the API_Token_Layer by calling `setAuthToken` with `Supabase_Session.access_token`.
2. WHILE a Supabase_Session is active, THE API_Token_Layer SHALL attach the Access_Token as an `Authorization: Bearer <token>` header on every backend request issued by every module service in the API_Token_Layer.
3. WHEN the Auth_System sets the Access_Token on the API_Token_Layer, THE Auth_System SHALL block rendering of each application module that issues backend requests until every module service that module depends on has confirmed receipt of the Access_Token.
4. WHERE propagation of the Access_Token to one module service fails while other module services succeed, THE Auth_System SHALL allow an application module to render once the module services it depends on have received the Access_Token, even if propagation to unrelated module services failed.
5. IF a Supabase_Session is established without a non-empty Access_Token, THEN THE Auth_System SHALL leave the API_Token_Layer token unset, SHALL NOT render any application module that issues backend requests, and SHALL return the user to the Login_Screen with an authentication-failed message.

### Requirement 4: Token Refresh

**User Story:** As a user, I want my session token to stay current, so that I am not unexpectedly signed out while using the app.

#### Acceptance Criteria

1. WHEN Supabase Auth rotates the Access_Token for an active Supabase_Session, THE Auth_System SHALL update every module service in the API_Token_Layer with the new Access_Token by calling `setAuthToken` with `Supabase_Session.access_token`, and SHALL complete that update before the next backend request is issued.
2. WHILE a Supabase_Session is active, THE Supabase_Auth_Client SHALL automatically refresh the Access_Token no later than 60 seconds before the Access_Token expiry time.
3. IF the automatic Access_Token refresh fails because the refresh token is rejected or expired, THEN THE Auth_System SHALL terminate the Supabase_Session, clear the Access_Token from every module service in the API_Token_Layer by calling `setAuthToken` with a null value, redirect the user to the Login_Screen, and display an authentication-failed message.

### Requirement 5: Frontend Route Protection

**User Story:** As a product owner, I want unauthenticated users routed to the login screen, so that application modules are only reachable when signed in.

#### Acceptance Criteria

1. WHILE no Supabase_Session is established, IF the user requests an application module route, THEN THE Route_Guard SHALL redirect the user to the Login_Screen without rendering any content of the requested module, and SHALL retain the originally requested route as the post-authentication destination.
2. WHILE a Supabase_Session is active, WHEN the user requests an application module route, THE Route_Guard SHALL render the requested module without first displaying the Login_Screen.
3. WHILE a Supabase_Session is active, IF the user requests the Login_Screen, THEN THE Route_Guard SHALL redirect the user to the default application module view.
4. WHILE the Route_Guard has not yet determined whether a Supabase_Session exists, THE Route_Guard SHALL render neither the requested application module nor the Login_Screen, and SHALL display a loading state.
5. WHEN a Supabase_Session is established after the user was redirected to the Login_Screen from an application module route, THE Route_Guard SHALL navigate the user to the retained originally requested route, or to the default application module view if no originally requested route was retained.

### Requirement 6: Sign-Out via the Existing Log Out Control

**User Story:** As a signed-in user, I want to sign out from the sidebar Log out control, so that my session ends and my token is no longer sent.

#### Acceptance Criteria

1. WHEN the user activates the Log_Out_Control, THE Auth_System SHALL terminate the Supabase_Session through the Supabase_Auth_Client and SHALL treat the sign-out as successful only when the session termination actually completes within 5 seconds.
2. WHEN the Supabase_Session is terminated, THE Auth_System SHALL clear the Access_Token from every module service in the API_Token_Layer by calling `setAuthToken` with a null value before navigating to the Login_Screen.
3. WHEN the Access_Token has been cleared from the API_Token_Layer following sign-out, THE Auth_System SHALL navigate the user to the Login_Screen.
4. IF terminating the Supabase_Session through the Supabase_Auth_Client fails or does not complete within 5 seconds, THEN THE Auth_System SHALL still clear the Access_Token from every module service in the API_Token_Layer, navigate the user to the Login_Screen, and display a message indicating that sign-out could not be confirmed.
5. WHILE a sign-out triggered by the Log_Out_Control is in progress, THE Auth_System SHALL ignore additional activations of the Log_Out_Control.

### Requirement 7: Session Persistence Across Reload

**User Story:** As a returning user, I want my session to survive a page reload, so that I do not have to sign in again every time the page refreshes.

#### Acceptance Criteria

1. WHEN the application loads AND a previously persisted Supabase_Session exists whose Access_Token has not expired or can be renewed through its refresh token, THE Auth_System SHALL restore that Supabase_Session through the Supabase_Auth_Client.
2. WHEN a Supabase_Session is restored on load, THE Auth_System SHALL set the restored Access_Token on every module service in the API_Token_Layer by calling `setAuthToken`, and SHALL complete that propagation before rendering any application module that issues backend requests.
3. WHILE the Auth_System is determining whether a valid stored Supabase_Session exists on load, THE Auth_System SHALL display a loading state and SHALL display neither the Login_Screen nor an application module, such that exactly one of the loading state, the Login_Screen, or an application module is displayed at any time.
4. WHEN the Auth_System begins determining whether a stored Supabase_Session exists on load, THE Auth_System SHALL complete that determination within 10 seconds.
5. IF the on-load session determination does not complete within 10 seconds, THEN THE Auth_System SHALL stop displaying the loading state, clear any stored session state, and render the Login_Screen.

### Requirement 8: Signed-In Identity Display

**User Story:** As a signed-in user, I want to see my name, email, and avatar, so that I can confirm which account I am using.

#### Acceptance Criteria

1. WHILE a Supabase_Session is active AND the User_Identity has an avatar URL that loads successfully within 5 seconds, THE Profile_Control SHALL display the avatar image from that URL.
2. WHEN the user activates the Profile_Control AND the User_Identity includes a name and email, THE Profile_Control SHALL display the name and email as readable text.
3. IF the User_Identity has no avatar URL, THEN THE Profile_Control SHALL display a fallback indicator consisting of the first alphabetic character of the User_Identity name, or the first character of the User_Identity email when no name is present.
4. IF the User_Identity avatar URL is present but fails to load within 5 seconds, THEN THE Profile_Control SHALL hide the failed avatar image entirely and display only the fallback indicator.
5. IF the User_Identity has neither a name nor an email, THEN THE Profile_Control SHALL display a default placeholder indicator.

### Requirement 9: Authentication Error Handling

**User Story:** As a user, I want clear feedback when sign-in fails or my session becomes invalid, so that I understand what happened and can retry.

#### Acceptance Criteria

1. IF the OAuth sign-in flow fails, THEN THE Auth_System SHALL return the user to the Login_Screen and display an authentication-failed message that remains visible until the user reactivates the "Continue with Google" action.
2. IF the user cancels the Google authorization step, THEN THE Auth_System SHALL return the user to the Login_Screen without displaying an error message, with the "Continue with Google" action available for retry.
3. IF a backend request returns HTTP 401 while a Supabase_Session is presumed active, THEN THE Auth_System SHALL terminate the Supabase_Session, clear the Access_Token from every module service in the API_Token_Layer by calling `setAuthToken` with a null value, and redirect the user to the Login_Screen.
4. WHEN the Auth_System redirects the user to the Login_Screen following an HTTP 401 on a presumed-active Supabase_Session, THE Auth_System SHALL display a message indicating that the session expired.
5. IF the Supabase_Auth_Client fails to restore a stored Supabase_Session on load, THEN THE Auth_System SHALL clear any stored session state and render the Login_Screen with the "Continue with Google" action available for retry and without displaying an error message.
6. IF any authentication failure occurs while a Supabase_Session is presumed active — including a rejected or expired token, a revoked session, or any other failure that invalidates the session — THEN THE Auth_System SHALL terminate the Supabase_Session, clear the Access_Token from every module service in the API_Token_Layer by calling `setAuthToken` with a null value, and redirect the user to the Login_Screen.

### Requirement 10: Scoped Supabase Client Exception

**User Story:** As a platform maintainer, I want the frontend Supabase client restricted to authentication only, so that the API-boundary architecture is preserved.

#### Acceptance Criteria

1. THE Supabase_Auth_Client SHALL invoke only the following Supabase Auth operations: OAuth sign-in, session retrieval, token refresh, and sign-out.
2. THE Auth_System SHALL route all application data access — defined as any read or write of resume, interview, job search, upskilling, or benchmarking data — through the backend Express API.
3. THE Auth_System SHALL NOT perform any Supabase database, storage, or realtime data operation through the Supabase_Auth_Client.
4. THE Supabase_Auth_Client SHALL read its Supabase connection URL and public key from environment variables and SHALL NOT contain hardcoded keys or connection strings.
5. IF a required Supabase connection environment variable is absent or empty when the Supabase_Auth_Client initializes, THEN THE Auth_System SHALL fail to initialize the Supabase_Auth_Client and SHALL render the Login_Screen in an authentication-unavailable state instead of an application module.
