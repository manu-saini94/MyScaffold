# Google Photos Picker API - research notes for "Our Story"

All doc reads were performed on 2026-09-30. Status legend: CONFIRMED (stated in an official doc), CHANGED (docs differ from the assumption), UNVERIFIED (not stated in docs I could read; test manually).

## 0. Discrepancies and risks that change the design (READ FIRST)

1. **Testing mode = refresh token dies after 7 days (CONFIRMED).** Google: an External app with publishing status "Testing" gets refresh tokens that expire in 7 days (the only exception is apps requesting just name/email/profile). Since the Picker scope is not in that exception, the stored Picker refresh token will stop working weekly. Design consequence: the "Import from Google Photos" button must gracefully handle `invalid_grant` on refresh by sending the user through the Picker-scope consent again (never silently fail). Alternatively publish the app to "In production" (see 2) to remove the 7-day limit; an unverified production app shows a warning screen and has a 100-user cap but no token expiry (UNVERIFIED for the Photos scope specifically; test).
2. **Verification (PARTIALLY CONFIRMED / UNVERIFIED).** Photos docs say all Photos API scopes must pass OAuth verification for production use. Whether `photospicker.mediaitems.readonly` is classed "sensitive" vs. "restricted" is NOT stated on the pages I could read; check the Data Access page of the consent screen in Cloud Console (it shows a sensitive/restricted badge). For a single-owner app, staying in Testing with one test user needs no verification.
3. **Images need `Authorization: Bearer` on every baseUrl fetch (CONFIRMED)** and baseUrl lives only 60 minutes. The backend must download bytes itself; the browser cannot use the URLs in `<img>`. Also a baseUrl MUST carry a size (`=w..-h..`) or download (`=d` / `=dv`) parameter.
4. **Session is single-use and temporary.** Not reusable; delete it after the items are read. Item `id`s are persistent across sessions, but baseUrls are not; store the bytes (or the id) at import time, do not store baseUrls.
5. **Max 2000 items per session** (`maxItemCount` default and max 2000), list page size max 100.
6. **Caching/ToS (see 5.3): the docs I read do not explicitly permit or forbid caching picked photos.** The API policy restricts storing media "not of a personal nature" and requires user consent for transfers. Keeping the owner's own personal photos for the owner's private app is consistent with the text, but this is UNVERIFIED legal interpretation. Do not serve other people's photos, keep the app private.
7. **Library API can no longer read the user's photos (CONFIRMED)** so the Picker is the only route. The user must actively pick photos in Google's UI each time; there is no background sync of the whole library.
8. **The Picker cannot be embedded in an iframe** (CONFIRMED); open `pickerUri` in a new tab/window.

## 1. Summary table: assumptions vs. verified facts

| # | Assumption | Status | Verified fact | Source (read 2026-09-30) |
|---|---|---|---|---|
| 1 | Since 31 Mar 2025 Library API scopes readonly/sharing/photoslibrary no longer read the user's existing library; Picker is the only way | CONFIRMED | The three scopes "will be removed from the Library API after March 31, 2025"; calls relying solely on them return 403 PERMISSION_DENIED. Remaining Library scopes: `appendonly`, `readonly.appcreateddata`, `edit.appcreateddata` (app-created content only). | updates page; authorization page |
| 2a | Scope `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` | CONFIRMED | "Access to create, get, and delete sessions, and to list media items for sessions." Required by mediaItems.list. | authorization page; mediaItems.list ref |
| 2b | Sensitive/restricted classification | UNVERIFIED | Docs only say all Photos scopes need OAuth verification for production. Badge not stated. Check consent-screen UI. | authorization page |
| 2c | Testing mode, single test user works without verification | CONFIRMED (general) | Testing status needs no verification; tester warning screen, user cap, limited refresh-token lifetime apply. | Google Cloud OAuth help (search result) |
| 2d | Refresh token ~7 days in Testing | CONFIRMED | "External user type and publishing status Testing is issued a refresh token expiring in 7 days" (exception: only name/email/profile scopes). Also 100 refresh tokens per account per client ID (oldest invalidated). | oauth2 protocols page |
| 3a | POST /v1/sessions with pickingConfig.maxItemCount | CONFIRMED | `pickingConfig.maxItemCount`: default 2000, max 2000, negative -> error. | sessions ref |
| 3b | Session response fields id, pickerUri, pollingConfig{pollInterval,timeoutIn}, expireTime, mediaItemsSet | CONFIRMED | All present. `pollingConfig` only populated while `mediaItemsSet` is false; `timeoutIn` 0 = stop polling. | sessions ref |
| 3c | GET/DELETE /v1/sessions/{id} | CONFIRMED (methods exist) | Ref lists create/get/delete. Exact HTTP verbs/paths are standard REST (`GET`/`DELETE https://photospicker.googleapis.com/v1/sessions/{id}`); I did not read the per-method pages verbatim. Test once. | sessions ref |
| 3d | GET /v1/mediaItems?sessionId&pageSize&pageToken | CONFIRMED | `sessionId` required; `pageSize` default 50, max 100; body must be empty; errors if user not finished. Returns `mediaItems[]` + `nextPageToken`. | mediaItems.list ref |
| 3e | PickedMediaItem shape | CONFIRMED | `id` (persistent across sessions), `createTime` (capture time, not upload time), `type` (PHOTO/VIDEO/TYPE_UNSPECIFIED), `mediaFile{baseUrl, mimeType, filename, mediaFileMetadata{width,height,cameraMake,cameraModel, photoMetadata{focalLength,apertureFNumber,isoEquivalent,exposureTime} or videoMetadata{fps,processingStatus}}}`. | mediaItems ref |
| 3f | `/autoclose` appended to pickerUri on web | CONFIRMED | "For web-based applications, append /autoclose". No separate mobile param documented (UNVERIFIED; docs mention link or QR code for handing off to the Photos app). | get-started guide; sessions ref |
| 4a | baseUrl needs Authorization Bearer | CONFIRMED | Yes, valid OAuth 2.0 bearer token. | media-items guide |
| 4b | baseUrl lifetime 60 min | CONFIRMED | 60 minutes, or sooner if user revokes app access. | media-items guide |
| 4c | Size syntax | CONFIRMED | `=w{W}-h{H}` (scaled preserving aspect ratio, fits within box); `-c` crops to exactly W x H; `=d` download original w/ EXIF minus location; `=dv` transcoded video; `=w{W}-h{H}-no` video thumbnail without play overlay. Range 1 to 16383 px. A size or download parameter is mandatory. `-c` is only needed if you want exact cropped thumbnails. | media-items guide |
| 4d | Quotas | CONFIRMED | Picker API: 100,000 requests/min/project. baseUrl media-byte requests: 1,000,000 requests/min/project. Exceeded -> HTTP 429. Downloads count against the media-bytes quota (separate from API quota). | api-limits-quotas |
| 4e | Max picked items per session | CONFIRMED | 2000. | sessions ref |
| 5a | Output format of `=w..-h..` (JPEG by default?) | UNVERIFIED | Docs do not state format; do not assume. Sniff `Content-Type` of the response and record it; convert on the server if you need JPEG. Test with a HEIC source photo. | media-items guide |
| 5b | HEIC / RAW | UNVERIFIED | Not mentioned. `mimeType` field describes the original. Test manually. | media-items guide |
| 5c | Live/motion photos | CONFIRMED (partial) | Motion photos have photo+video parts; you can use parameters of either image or video baseUrls (so `=dv` gets the video part). | media-items guide |
| 5d | Location stripping | CONFIRMED (for `=d`) | `=d` keeps all EXIF "except the location metadata". Whether `=w-h` output carries EXIF: UNVERIFIED. | media-items guide |
| 5e | Video processing | CONFIRMED | `videoMetadata.processingStatus` PROCESSING/READY/FAILED; use only when READY, else errors may occur. | mediaItems ref; media-items guide |
| 5f | ToS on caching picked photos | UNVERIFIED | See 5.3. | api-policy |
| 6 | Incremental auth | CONFIRMED (concept) | Google: "generally a best practice to request scopes incrementally, at the time access is required". Spring recipe in section 3 is my own design, based on Spring docs. | oauth2 protocols page; Spring docs |

## 2. Endpoint reference (verified)

Base: `https://photospicker.googleapis.com/v1`. All calls need `Authorization: Bearer <access token with photospicker.mediaitems.readonly>`.

### 2.1 Create session
`POST /v1/sessions`, JSON body (optional): `{ "pickingConfig": { "maxItemCount": "50" } }` (int64 fields serialize as strings in Google JSON; sending a number is normally also accepted, UNVERIFIED).
Response `Session`:
```
{ "id": "...", "pickerUri": "https://photos.google.com/picker/...",
  "pollingConfig": { "pollInterval": "5s", "timeoutIn": "600s" },
  "expireTime": "2026-...Z", "mediaItemsSet": false }
```
(The example values are illustrative; Duration format assumed "Ns" per Google JSON convention, parse defensively.)

### 2.2 Send the user to Google Photos
- Open `pickerUri + "/autoclose"` in a new tab from the SPA (web). Not embeddable in an iframe. Because `window.open` after an async call can be blocked by popup blockers, either open the window synchronously on click (about:blank) and set its location after the POST returns, or show a real link/button once the session exists.
- Mobile: docs mention link or QR code; no separate query param documented (UNVERIFIED).

### 2.3 Poll
`GET /v1/sessions/{id}` every `pollingConfig.pollInterval` until `mediaItemsSet == true`; stop when `timeoutIn` elapses ("handle the timeout gracefully") or the session `expireTime` passes. Poll from the backend (job) or have the SPA poll a backend endpoint that proxies; do not poll faster than pollInterval.

### 2.4 List picked items
`GET /v1/mediaItems?sessionId={id}&pageSize=100&pageToken={t}` (default pageSize 50, max 100). Loop on `nextPageToken`. Errors if the user has not finished. Empty request body.

### 2.5 Fetch bytes
`GET {mediaFile.baseUrl}=w2048-h2048` with the Bearer header. Variants: `=d` (original bytes, no location), `=dv` (video), `=w256-h256-c` (square thumbnail). Range 1..16383. baseUrl valid 60 min.

### 2.6 Delete session
`DELETE /v1/sessions/{id}` after you have listed (and ideally downloaded) the items. Docs: "best practice to delete sessions once the user has selected media items". Deleting likely invalidates access to the session's items, so download first (UNVERIFIED ordering; safest is download then delete).

### 2.7 Errors
429 on quota; 403 PERMISSION_DENIED if scope missing; INVALID_ARGUMENT on negative pageSize/maxItemCount. No retry guidance in docs (UNVERIFIED): use exponential backoff on 429/5xx.

## 3. Spring Security incremental-scope recipe

Goal: sign in with `openid email profile` (no Photos data), later, on demand, obtain the Picker scope and keep an access token + refresh token server-side.

### 3.1 Recommended: two ClientRegistrations, same Google provider
Simplest and robust. Login registration `google` (scopes openid,email,profile), data registration `google-picker` (scope photospicker.mediaitems.readonly). Both use the same Google client id/secret, so only one OAuth client in Cloud Console, but two redirect URIs.

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID}
            client-secret: ${GOOGLE_CLIENT_SECRET}
            scope: openid, email, profile
          google-picker:
            provider: google
            client-id: ${GOOGLE_CLIENT_ID}
            client-secret: ${GOOGLE_CLIENT_SECRET}
            authorization-grant-type: authorization_code
            redirect-uri: "{baseUrl}/login/oauth2/code/{registrationId}"
            scope: https://www.googleapis.com/auth/photospicker.mediaitems.readonly
```
`provider: google` reuses Spring's built-in Google CommonOAuth2Provider endpoints (verify in your Spring Boot version; if it does not resolve, declare `spring.security.oauth2.client.provider.google`  URIs explicitly).

Redirect URIs to register in Google Cloud: `{origin}/login/oauth2/code/google` and `{origin}/login/oauth2/code/google-picker` (template `{baseUrl}/login/oauth2/code/{registrationId}` confirmed in Spring docs).

Caveat: `oauth2Login()` treats any registration hitting `/login/oauth2/code/*` as a login and would create a session principal for `google-picker`, which lacks the `openid` scope, so the user info step fails or replaces the principal. Two ways to handle:
- (a) Add `openid email profile` also to `google-picker` scopes (Google returns the union with include_granted_scopes); the resulting principal is the same Google user, so login-replace is harmless. Easiest: scopes = `openid, email, profile, https://www.googleapis.com/auth/photospicker.mediaitems.readonly`. Recommended.
- (b) Use `.oauth2Client()` (not login) for `google-picker` with a custom redirect path; more code.

### 3.2 Extra authorization params via customizer (confirmed API)
Use `DefaultOAuth2AuthorizationRequestResolver` + `setAuthorizationRequestCustomizer` (documented in Spring reference), applied for registrationId `google-picker` only:
```java
DefaultOAuth2AuthorizationRequestResolver r =
    new DefaultOAuth2AuthorizationRequestResolver(repo, "/oauth2/authorization");
r.setAuthorizationRequestCustomizer(c -> c.additionalParameters(p -> {
    p.put("access_type", "offline");          // get a refresh token
    p.put("include_granted_scopes", "true");  // incremental auth (Google param)
    p.put("prompt", "consent");               // forces a refresh token to be re-issued
}));
```
`customizer` runs for every registration; branch on `attributes(a -> a.get(OAuth2ParameterNames.REGISTRATION_ID))` or wrap the resolver so the params are added only for `google-picker` (Google's normal login should not force consent). `access_type=offline` is required for Google to return a refresh token; `prompt=consent` is needed on repeat grants because Google returns a refresh token only on first consent otherwise (Google behaviour, general knowledge; UNVERIFIED in the pages read this session).

Trigger: the SPA navigates the browser (full page) to `/oauth2/authorization/google-picker` when the backend reports `pickerAuthorized=false` (no stored authorized client, or refresh failed).

### 3.3 Storing / refreshing tokens
- `OAuth2AuthorizedClientService`: default `InMemoryOAuth2AuthorizedClientService`; `JdbcOAuth2AuthorizedClientService` persists to a DB table (schema `oauth2_authorized_client` in `spring-security-oauth2-client` jar, file `org/springframework/security/oauth2/client/oauth2-client-schema.sql`; Spring doc says see "OAuth 2.0 Client Schema" appendix).
- After a restart: in-memory loses the tokens, so the user must re-consent. With JDBC the client (access + refresh token) survives, but the `OAuth2AuthorizedClientRepository` default (`AuthenticatedPrincipalOAuth2AuthorizedClientRepository` -> service, or HTTP-session variant) is keyed by principal name, and the HTTP session is lost on restart unless sessions are persisted. For a single-owner background import job, key by a fixed principal name (the owner's email) and use `OAuth2AuthorizedClientManager` through `AuthorizedClientServiceOAuth2AuthorizedClientManager` (service-based, works outside a request, e.g. in a `@Async` job).
- Enable refresh: `OAuth2AuthorizedClientProviderBuilder.builder().authorizationCode().refreshToken().build()` (documented). On success the refreshed client is saved; on failure (e.g. `invalid_grant` after 7 days in Testing) `RemoveAuthorizedClientOAuth2AuthorizationFailureHandler` removes it -> treat as "needs re-consent".
- Encrypt tokens at rest (Google API policy asks for industry-standard encryption of stored user data on portable media; the JDBC table stores tokens as plain bytes by default). Use an encrypted volume/DB or wrap the service.
- Google limit: 100 refresh tokens per account per client ID; oldest is invalidated when exceeded. `prompt=consent` on every click can burn through them over months; only force consent when no refresh token exists.

### 3.4 Alternative: single registration, resolver adds scope dynamically
Keep one `google` registration and let the resolver override scopes when the request has `?scope=picker`. Works, but the returned authorized client is stored under registrationId `google`, overwriting the login-only token. The two-registration approach keeps tokens separate. Not recommended.

## 4. Import job implications

### 4.1 Flow
1. `POST /api/import/sessions` -> backend ensures fresh token, creates Picker session (`maxItemCount` <= 2000), returns `pickerUri + "/autoclose"` and session id.
2. SPA opens the URI in a new tab, polls the backend status (backend polls Google per `pollInterval`).
3. When `mediaItemsSet` is true: list all pages (pageSize=100), persist Picker `id`, `filename`, `mimeType`, `createTime`, dimensions immediately (dedupe on `id`, ids are persistent across sessions).
4. Download bytes promptly: baseUrls last 60 minutes and the session (and items) expires at `expireTime`. Fetch with the Bearer header; fetch a display size (e.g. `=w2048-h2048`) and optionally a thumbnail (`=w400-h400-c`), or `=d` for originals.
5. `DELETE` session when done (also on failure/cancel).

### 4.2 Sizes, formats
- `=w2048-h2048` keeps aspect ratio and fits inside the box; only ask for what you display. Max 16383.
- Check response `Content-Type`; do not assume JPEG (UNVERIFIED). Videos: `=dv`, check `processingStatus == READY`.
- A 2000-item session with ~1-3 MB each is 2-6 GB: stream to disk, do not buffer in memory; bound concurrency (e.g. 4 downloads) and total job time under the 60 min baseUrl life. If you must exceed 60 min for large imports, you cannot refresh baseUrls without a new listing (listing again in the same session likely returns fresh baseUrls, UNVERIFIED; test).
- Access token lifetime is normally 1 hour; refresh mid-job via the authorized client manager.

### 4.3 Retries and limits
- Quotas are per project and very high (100k API req/min, 1M media-byte req/min): a single-owner app will never hit them; still handle 429 with backoff.
- Retry transient 5xx/429 on individual downloads (3 attempts, exponential backoff + jitter); 401 -> refresh token and retry once; 403 on baseUrl after 60 min -> relist and retry.
- Make the import idempotent (unique key on Picker `id`), resumable, and record per-item status.
- Delete the Picker session in a `finally`.

### 4.4 Caching/ToS (item 5 exact wording)
From the Google Photos APIs policy page (fetched 2026-09-30):
- "Do not use Google Photos APIs to store or serve media such as photos or videos that are not of a personal nature."
- Data transfers are not allowed except "to provide or improve your appropriate use case or user-facing features ... only with the user's consent".
- User data stored outside Google systems on portable devices/media must use industry-standard encryption.
The Picker guides say nothing about caching baseUrls or bytes. Conclusion: copying the owner's own personal photos into their own private app with their consent appears consistent; publicly serving them or importing others' photos is not clearly allowed. Legal reading is UNVERIFIED: re-read the policy page and the Google APIs Terms of Service before going public.

## 5. Google Cloud setup checklist (paste into README)

1. Go to https://console.cloud.google.com and create a project (e.g. "our-story").
2. APIs & Services > Library > enable **"Google Photos Picker API"**.
3. APIs & Services > OAuth consent screen (Google Auth Platform > Branding/Audience):
   - User type **External**; publishing status **Testing**.
   - App name, support email, developer contact email.
   - Audience > Test users > add `manu.dev4veritas@gmail.com` (the only account that can sign in while in Testing).
   - Data access / Scopes: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, and `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
4. Credentials > Create credentials > OAuth client ID > **Web application**. Authorized redirect URIs (exact match, scheme+host+port+path):
   - Local dev: `http://localhost:5173/login/oauth2/code/google` and `http://localhost:5173/login/oauth2/code/google-picker`
   - Also add the same two with `http://localhost:8080` if you ever call Spring directly.
   - Production: `https://<your-domain>/login/oauth2/code/google` and `.../google-picker`.
   Google allows `http://localhost` for dev; production must be https.
5. Copy the client ID and secret into environment variables (never commit): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
6. First run: sign in, click "Import from Google Photos", accept the "Google hasn't verified this app" warning (Advanced > Continue) and grant the Photos scope.
7. Testing mode caveat: refresh tokens expire after 7 days, so the app will ask you to reconnect Google Photos about weekly. To avoid this, publish the app (In production); it remains "unverified" for a personal app (warning screen, 100-user cap) unless you go through verification.

### Redirect URI: Vite origin (:5173) or Spring (:8080)?
Recommendation: **register and use the Vite origin `http://localhost:5173`** as the primary redirect URI, and additionally register :8080 as a fallback.
Why: Spring builds `redirect-uri` from `{baseUrl}`, which is derived from the incoming request Host. The browser starts the flow on 5173 (SPA + proxied `/oauth2/authorization/...`). If the proxy preserves the Host header (Vite default `changeOrigin: false`), Spring generates `http://localhost:5173/login/oauth2/code/...`; Google then redirects the browser back to 5173, the proxy forwards to Spring, and the session cookie (`JSESSIONID`, host-scoped, shared across ports on `localhost` but issued on the proxied origin) and the post-login redirect land the user on the SPA. Going through :8080 would work for OAuth but leaves the browser on the Spring origin, away from the SPA and its dev server, and can break cookie/CORS assumptions.
Requirements: `server.forward-headers-strategy=framework` (or `native`) in Spring, and Vite proxy entries for `/oauth2` and `/login` with `changeOrigin: false` (or set `X-Forwarded-Host`). The redirect_uri sent must match a registered URI exactly, so a mismatch shows `redirect_uri_mismatch`: the error page prints the URI Spring used; register that. This reasoning is my design judgement from Spring/Vite behaviour; verify by inspecting the `redirect_uri` in the browser's first Google request.

## 6. Manual tests to close the UNVERIFIED items
- Create a session, inspect exact JSON (pollingConfig format, pickerUri) and whether `DELETE` returns 200/204.
- Pick a HEIC photo, a Live Photo, a video: record `mimeType`, response `Content-Type` for `=w1024-h1024` and `=d`, and presence of EXIF/GPS in each output.
- Check whether the OAuth consent screen labels the Picker scope sensitive/restricted.
- After deleting a session, re-request a baseUrl to see if it still works.
- Keep the app in Testing for 8 days and confirm the refresh token error (`invalid_grant`) handling.

## 7. Sources (all read 2026-09-30)
- https://developers.google.com/photos/support/updates
- https://developers.google.com/photos/overview/authorization
- https://developers.google.com/photos/overview/api-limits-quotas
- https://developers.google.com/photos/support/api-policy
- https://developers.google.com/photos/picker/guides/get-started-picker
- https://developers.google.com/photos/picker/guides/sessions
- https://developers.google.com/photos/picker/guides/media-items
- https://developers.google.com/photos/picker/reference/rest/v1/sessions
- https://developers.google.com/photos/picker/reference/rest/v1/mediaItems
- https://developers.google.com/photos/picker/reference/rest/v1/mediaItems/list
- https://developers.google.com/identity/protocols/oauth2 (Testing-mode 7-day refresh token; 100 tokens/account/client; incremental scopes)
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification (via search snippet only)
- https://support.google.com/cloud/answer/7454865 (unverified apps; via search snippet only)
- https://docs.spring.io/spring-security/reference/servlet/oauth2/client/authorization-grants.html
- https://docs.spring.io/spring-security/reference/servlet/oauth2/client/core.html
