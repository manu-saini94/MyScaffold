# Our Story - backend

Spring Boot 3.5 (Java 21, virtual threads) API for the private "Our Story" gallery. Embedded H2 (file mode) + Flyway; no JPA.

## Run

```
mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev     # Windows, local development
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev       # macOS/Linux, local development
mvnw.cmd -q test                                            # tests
```

**Local runs need the `dev` profile.** The base configuration is secure by default (session cookie is `Secure`,
`HttpOnly`, `SameSite=Lax`, 30 minute timeout). A `Secure` cookie is never sent over plain
`http://localhost`, so without `dev` the Google login silently loops. The `dev` profile only relaxes the cookie's
`Secure` flag. Prod: `prod`.

The app starts with NO environment variables set (Google login and viewer/admin features simply stay off), but a
half-configured Google setup refuses to start (see "Startup checks" below).
The Vite dev server proxies `/api` to `http://localhost:8080`, so no CORS is configured.

Health check: `GET http://localhost:8080/actuator/health` (the only exposed actuator endpoint).

## Environment variables

Secrets are read only from the environment; never commit real values.

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | for Google login | OAuth2 client id; the Google client is registered only when this is set |
| `GOOGLE_CLIENT_SECRET` | with client id | OAuth2 client secret |
| `VIEWER_COOKIE_SECRET` | prod (32+ chars) | Signs the viewer unlock cookie AND peppers the stored unlock answers (see "Viewer access"). The `prod` profile refuses to start when it is blank, shorter than 32 characters or a placeholder (`change-me`, `changeme`, `secret`, `password`). Rotating it signs every viewer out and invalidates peppered answers (re-set them) |
| `OURSTORY_TRUSTED_PROXIES` | prod, optional | Regular expression of the reverse proxy's peer address(es) (default: loopback only). `X-Forwarded-For` is honoured only from these peers; see "Client IP behind a proxy" |
| `ADMIN_EMAIL` | with client id | The single Google account allowed to use `/api/admin/**` (verified email, case-insensitive), for example `you@example.com`. Required whenever `GOOGLE_CLIENT_ID` is set |
| `OURSTORY_DATA_DIR` | no (default `./data`) | Root for the H2 database (`<dir>/db/ourstory`) and media files (`<dir>/media/{ulid}/{thumb,medium,full}.jpg`) |

Optional tuning (`application.yml`, prefix `ourstory.`): `import-job.concurrency` (default 4, max 16),
`import-job.max-download-bytes` (default 15 MiB per image), `import-job.max-attempts` (4, also used for Picker API
calls), `import-job.backoff-base-millis` (500), `import-job.job-timeout` (2h, whole job; then FAILED "Import timed
out"), `import-job.download-timeout` (2m, reading one image body), `import-job.min-free-bytes` (200 MB; below that
items fail with `disk_full`), `post-login-url` (`/admin`, the admin UI; must match `^/(?!/)[A-Za-z0-9._~/-]*$`).

### Startup checks

The app stops at startup with an "APPLICATION FAILED TO START" report listing every problem when:
`GOOGLE_CLIENT_ID` is set but `GOOGLE_CLIENT_SECRET` or `ADMIN_EMAIL` is blank; `ourstory.google.picker-base-url` is
not https; an `allowed-media-hosts` entry is not a lowercase bare host name; or, in the `prod` profile only,
`VIEWER_COOKIE_SECRET` is blank, shorter than 32 characters or a placeholder, or `ourstory.viewer.pbkdf2-iterations`
is below 600000.

### Security posture

- Deny by default: only `/actuator/health`, static assets, `/oauth2/**`, `/login/**`, `/error` are reachable without the admin role; `/api/admin/**` needs `ROLE_ADMIN`, `/api/media/**` ROLE_VIEWER or ROLE_ADMIN, the four `/api/auth/*` unlock
  endpoints are public (CSRF applies); everything else is denied.
- CSRF is enforced on every POST/PUT/PATCH/DELETE on every path, including `/logout`. There are no exemptions.
- A Google account that is not the admin is signed out immediately after login (403 page, stored tokens removed).
  Logout also removes the stored Google tokens.
- Headers: CSP (`default-src 'self'; img-src 'self' data:; media-src 'self' https:; style-src 'self'; script-src 'self'; frame-ancestors 'none';
  base-uri 'self'; form-action 'self'`), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
  The dev page therefore uses `import.js` and `import.css` instead of inline script and style.
- Clients that carry Google tokens never follow redirects (a 3xx is a failure).
- Request bodies are capped by the bytes actually read (so chunked uploads without `Content-Length` are limited too):
  4 KiB on `/api/auth/**` and 1 MiB on `/api/admin/**` (POST/PUT/PATCH), answered `413` with a ProblemDetail body.
  The cap applies before authentication; an unauthenticated request that never reads its body is simply refused (401).
  Jackson's own string-length limit is NOT configured separately: `spring.jackson.constraints.*` does not exist in
  Spring Boot 3.5, so the body caps are the guard.
- Security events are logged by the logger `com.ourstory.security` (unlock success and failure, limiter trip, rate-limit
  reset, admin settings changed by KEY NAME only, sign-out-everyone). Client addresses are masked (IPv4 `a.b.*.*`, IPv6
  first three groups then `::*`); answers, cookies, hashes and secrets are never logged.

### Client IP behind a proxy

The unlock limiter keys on the client address, so it must be the REAL one. In the `prod` profile
(`application-prod.yml`) Tomcat's `RemoteIpValve` is enabled through properties
(`server.forward-headers-strategy=native`, `server.tomcat.remoteip.remote-ip-header=X-Forwarded-For`,
`server.tomcat.remoteip.internal-proxies=${OURSTORY_TRUSTED_PROXIES:<loopback only>}`). The header is used only when
the TCP peer matches `OURSTORY_TRUSTED_PROXIES`; the default trusts the loopback address only, so with no trusted
proxy configured a client-supplied `X-Forwarded-For` is ignored (tested with a real Tomcat). Tomcat's built-in
default would trust every private range, which is why it is overridden. Requirements for the deployment:

- the reverse proxy must OVERWRITE (not append to) `X-Forwarded-For` with the address it saw;
- port 8080 must be reachable only from the proxy (bind to loopback or firewall it);
- set `OURSTORY_TRUSTED_PROXIES` to the proxy's address if it is not on loopback, for example `10\.0\.0\.5`.

IPv4 clients are limited per exact address; IPv6 clients per `/64` (one subscriber owns a whole `/64`).

## Phase 1: importing from Google Photos

Google setup (project, Picker API, consent screen, OAuth client, redirect URIs) is in
[`docs/google-photos-picker-notes.md`](../docs/google-photos-picker-notes.md) section 5. Register BOTH redirect URIs
for the origin you use, e.g. `http://localhost:8080/login/oauth2/code/google` and
`http://localhost:8080/login/oauth2/code/google-picker`. Then:

```
set GOOGLE_CLIENT_ID=...            (PowerShell: $env:GOOGLE_CLIENT_ID="...")
set GOOGLE_CLIENT_SECRET=...
set ADMIN_EMAIL=you@example.com
mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev
```

Open the admin UI at **/admin** (Import tab): sign in with Google, create a picker session, open the link or scan the
QR code, choose photos, then "Start import" and watch the progress bar. After the Google login the backend redirects to
`ourstory.post-login-url` (`/admin`).

Dev flow (SPA on Vite, API on Spring): run `npm run dev` in `frontend/` and open **http://localhost:5173/admin**. The
sign-in link goes to `/oauth2/authorization/google` on the same origin, which Vite proxies to `:8080`; because
`post-login-url` is a relative path, the final redirect lands on `:5173/admin` again. Google redirects to
`{origin}/login/oauth2/code/google`, so register the `:5173` redirect URIs (both `google` and `google-picker`) and
make sure Vite proxies `/login` as well as `/api` and `/oauth2` (`frontend/vite.config.ts`). Alternative without the
`/login` proxy: sign in once on `http://localhost:8080/oauth2/authorization/google`; the session cookie is shared across
ports on `localhost`, so `http://localhost:5173/admin` then works (the redirect itself ends on a 401 at `:8080/admin`,
ignore it). In production the SPA is served from the same origin as the API, so no proxy is involved.

Tokens are kept in memory only; after a server restart (or when Google revokes/expires the refresh token, weekly in
OAuth Testing mode) the API answers `409` with `authorizeUrl` and the page shows "Connect Google Photos" again.
Videos are skipped (`unsupported_type`) in Phase 1. A failed job (for example after a token loss) shows the reconnect
link again. When Google download links expire during a long job (403/404), the session is re-listed once and the
item retried; an item that still fails is reported as `baseurl_expired` ("Google download link expired - run the import
again"). The Picker session is deleted only after the selection was read and items were processed; if the job fails
before that (nothing picked yet, transient error) the session is kept so you can retry until it expires.

### Endpoints

All `/api/admin/**` calls need the admin session; mutating ones also need the `X-XSRF-TOKEN` header (cookie `XSRF-TOKEN`).
Errors are RFC 7807 `application/problem+json`. Anonymous = 401, signed-in non-admin = 403. `409` reconnect is used only
for `invalid_grant`, `client_authorization_required`, `invalid_token` and a Google 401; other Google or token-refresh
failures (including a Picker 403 such as "API not enabled") are `502 google-api-error`.

| Method and path | Result |
|---|---|
| `GET /api/admin/me` | `{email, name, admin:true, pickerConnected}` |
| `POST /api/admin/picker/sessions` (optional `{maxItemCount}`) | `{sessionId, pickerUri (ends with /autoclose), pollingConfig{pollIntervalMs,timeoutMs}, expireTime}` |
| `GET /api/admin/picker/sessions/{id}` | `{mediaItemsSet, pollingConfig (null once set), expireTime}` |
| `POST /api/admin/picker/sessions/{id}/import` | `202 {jobId}`; `409` if another import runs or Google must be reconnected |
| `GET /api/admin/imports/{jobId}` | `{status RUNNING/COMPLETED/FAILED, total, done, failed, skipped, error, startedAt, finishedAt, failures[{filename,outcome,reason}]}` |
| `GET /api/admin/media?unassigned=true&page=0&size=50` | Newest first; `size` 1..100 (Phase 1 returns all media) |
| `DELETE /api/admin/media/{id}` | Removes DB row and files; never calls Google |
| `GET /api/media/{id}/{thumb\|medium\|full}` | Image bytes, strong ETag, `Cache-Control: private, max-age=31536000, immutable`, 304 on `If-None-Match`; viewer or admin (`MediaAccessPolicy`) |

409 reconnect body: `{"type":"urn:ourstory:problem:google-reconnect-required","status":409,"authorizeUrl":"/oauth2/authorization/google-picker",...}`.

### Tests and coverage

`mvnw.cmd test` runs all tests and writes the JaCoCo report to `target/site/jacoco/index.html`
(`target/site/jacoco/jacoco.csv` for numbers). Google is never called by tests (MockRestServiceServer / Mockito).

## Content (Phase 2A)

Migration `V4__content.sql` adds three tables (V3 belongs to settings; a version gap is fine on fresh databases):

| Table | Notes |
|---|---|
| `world` | ULID id, unique kebab-case `slug`, `layout` (POLAROID_TABLE, FILM_STRIP, POSTCARDS, MEMORY_WALL, ENVELOPE, CONSTELLATION), optional `cover_media_id` (SET NULL when the photo is deleted), `theme_accent` `#rrggbb`, `sort_order`, `unlock_at` (null = open), intro/outro text, `music_url` (https only), `published`. Six default worlds are seeded (Our Forever unlocks 2027-02-14T00:00:00+05:30) |
| `moment` | A photo in a world: caption, note ("back of the polaroid"), `happened_on`, `place`, `sort_order`, `is_favourite`. UNIQUE(world, media). Deleting the world or the photo removes the moment |
| `letter` | Optional `world_id` (`ON DELETE SET NULL` since `V5__letter_world_set_null.sql`: deleting a world keeps its letters, which then have no world and are not shown to viewers), title, `body` (RAW markdown, <= 20,000 chars, stored as-is; the frontend renders it safely, the server never renders it as HTML), `reveal_trigger` WORLD_OUTRO or SEALED_ICON |

Endpoints (all `/api/admin/**`: admin session, CSRF on mutating calls, errors are `application/problem+json`):

| Method and path | Result |
|---|---|
| `GET /api/admin/worlds` | All worlds including unpublished, each with `momentCount` |
| `GET /api/admin/worlds/{id}` | One world |
| `POST /api/admin/worlds` | `201` + `Location`; appended last |
| `PUT /api/admin/worlds/{id}` | Update (sort order unchanged). An omitted `published` KEEPS the stored value (default true only on create); an omitted `unlockAt` KEEPS the stored value, an explicit `null` CLEARS it (open) |
| `DELETE /api/admin/worlds/{id}?confirm=true` | `204`; removes the world and its moments, KEEPS its letters (`world_id` becomes NULL). Without `confirm=true`: `400 confirmation-required` with `momentCount` and an explanation |
| `PUT /api/admin/worlds/reorder` `{orderedIds}` | Elements must be non-blank ULIDs (else `400`); must be every world id exactly once, else `422`; returns the new list |
| `GET /api/admin/worlds/{id}/moments` | Moments with media info (width, height, lqip, dominantColor, mimeType, takenAt) |
| `PUT /api/admin/worlds/{id}/moments` `{moments:[{mediaId,caption,note,happenedOn,place,favourite}]}` | Atomic bulk replace; array order is display order |
| `GET /api/admin/letters?worldId=` | All letters or one world's |
| `POST` / `PUT /{id}` / `DELETE /{id}` `/api/admin/letters` | Letter CRUD (`201` + `Location` on create) |

Rules: ids must be ULIDs (`400` otherwise); unknown ids `404`; duplicate slug `409`; every validation failure (bean
validation, malformed JSON, wrong types, settings) is `400` `urn:ourstory:problem:validation-failed` with
`errors:[{field,message}]` (an array, everywhere; the rejected value is never echoed); `musicUrl` must be an https URL
without userinfo (`@` before the first `/`), spaces, quotes, `<`, `>`, backslashes or control characters; a write race in
the moment replacement is `409 moments-conflict`; moments: at most 500, no duplicate `mediaId`, every `mediaId` must exist (`422` with
`missingMediaIds`), caption <= 500, note <= 2000, place <= 200; unknown cover media or letter world `422`.
Content code never touches Google Photos or media files. Read methods for the experience layer:
`WorldRepository.findPublished()`, `MomentRepository.listByWorld/countsByWorld/firstMediaIdsByWorld`, `LetterRepository.findByWorld`.

## Viewer access (Phase 2B)

The site is unlocked by answering one question. There are no accounts: a correct answer sets the signed
`os_viewer` cookie; the admin (Google login) is allowed everywhere a viewer is.

**Configuration** (environment, read once at startup, never committed; see the root `.env.example`). In the `dev`
profile the git-ignored root `.env` is also loaded (`application-dev.yml`), so copying `.env.example` to `.env` and
filling it in is enough locally; real environment variables still win. Other profiles read only the environment.
Without these values unlock answers `503 unlock-not-configured`.

| Variable | Purpose |
|---|---|
| `OURSTORY_UNLOCK_QUESTION` | Question shown on the lock screen |
| `OURSTORY_UNLOCK_ANSWERS` | Accepted answers, comma-separated (max 10; each 4 to 100 characters once spaces are ignored) |
| `OURSTORY_UNLOCK_FORCE_RESET` | `true` for ONE start to replace stored credentials (signs every viewer out) |

Bootstrap runs before the web server accepts requests (no brief 503 window) and is idempotent: if hashed answers are
already stored the variables are ignored unless force reset is set. With force reset and invalid or empty values
(question over 300 characters or with control characters, no valid answers) the reset is SKIPPED with a WARN; with
values that already match what is stored (same question, same answers) nothing changes and viewers stay signed in.
Writing the same question or answers through the admin API is likewise a no-op (no epoch bump).

Answers are stored only as PBKDF2WithHmacSHA256 hashes with a server-side PEPPER:
`pbkdf2-sha256-p1$iters$saltB64$hashB64`, 600,000 iterations (the `prod` profile refuses fewer), random 16-byte salt
each. The PBKDF2 password is `Base64(HMAC-SHA256(pepperKey, normalizedAnswer))` with
`pepperKey = HMAC-SHA256(VIEWER_COOKIE_SECRET, "our-story:unlock-pepper:v1")`, so a stolen database alone cannot be
brute-forced. Verification is constant-time, all hashes are always checked, and runs under a 2-permit semaphore so
parallel attempts cannot occupy every carrier thread (limiter and length checks run first). The legacy un-peppered form
`pbkdf2-sha256$...` is still verified (cost is the same) and is what gets stored when `VIEWER_COOKIE_SECRET` is blank
(non-prod only; the ephemeral key would orphan hashes on restart; WARN). Peppered hashes cannot be verified without the
configured secret (fail closed, WARN "unlock hashes need re-setting"). **Rotating `VIEWER_COOKIE_SECRET` invalidates
both viewer cookies and peppered answers**: re-set the answers through the admin API or
`OURSTORY_UNLOCK_FORCE_RESET=true`. Before hashing an answer is normalised (Unicode NFKC, lower-case, all whitespace
removed), so ` sAmPlE ` and `sam ple` both match `Sample`; STORED answers need at least 4 normalised characters
(admin API and bootstrap), while an unlock attempt of any length 1 to 100 is accepted for comparison. With nothing
configured unlock is impossible (fail closed): `GET /api/auth/question` and `POST /api/auth/unlock` answer `503`
and a WARN is logged at startup. `VIEWER_COOKIE_SECRET` signs the cookie (blank outside prod = random key per start,
WARN). Tuning (`ourstory.viewer.*`): `pbkdf2-iterations` (default 600000, 1000..5000000; lower only for tests),
`cookie-ttl` 7d, `epoch-cache-ttl` 5s, `max-failures-per-ip` 5, `failure-window` 10m, `max-failures-global` 30,
`global-failure-window` 1h (all durations must be positive).

**Endpoints** (errors are RFC 7807; CSRF applies to every POST, so call a GET first to receive `XSRF-TOKEN`, then
send it as `X-XSRF-TOKEN`):

| Method and path | Result |
|---|---|
| `GET /api/auth/question` | `200 {question}` (also issues the XSRF cookie); `503 unlock-not-configured` |
| `GET /api/auth/status` | `200 {unlocked}` for viewer or admin; never errors on bad cookies |
| `POST /api/auth/unlock {answer}` | `204` + `Set-Cookie: os_viewer`; `401 {attemptsRemaining}` (generic message, answer never echoed); `429` + `Retry-After`; `400` validation problem (`errors:[{field,message}]`: blank or over 100 chars); `413` body over 4096 bytes; `403` no CSRF token; `503` not configured |
| `POST /api/auth/lock` | `204`; only clears the browser's cookie (it does not revoke it server-side). To revoke every cookie use the admin "sign out everyone" |
| `GET/PUT /api/admin/settings` | ADMIN. GET: non-secret settings + `unlockQuestion` + `unlockAnswersConfigured` (count only, never answers or hashes). PUT: partial update of `appTitle, tagline, defaultTheme (rose\|cinema), specialDate, herName, myName, easterEggNicknames, heroMediaIds, unlockQuestion` and write-only `unlockAnswers` (1-10, replaces all hashes); changing the question or answers to DIFFERENT values signs every viewer out. `400` with `errors:[{field,message}]` for invalid or unknown keys; `heroMediaIds` must be unique and existing photos; answers need 4+ normalised characters. Deleting a photo removes it from `heroMediaIds` |
| `POST /api/admin/settings/sign-out-everyone` | ADMIN, `204`, bumps `viewer_epoch` (revokes every viewer cookie) |
| `POST /api/admin/auth/reset-rate-limits` | ADMIN + CSRF, `204`: clears the per-client and global unlock failure counters (INFO logged) |

`/api/experience`, `/api/worlds/**` and `/api/media/**` need ROLE_VIEWER or ROLE_ADMIN (anonymous 401);
`/api/admin/**` stays ADMIN only (a viewer gets 403).

**Cookie**: `os_viewer` = `base64url({"v":1,"iat","exp","ep"}) . base64url(HMAC-SHA256)`, 7 days by default (`Max-Age` equals the
signed `exp`), `HttpOnly`,
`SameSite=Lax`, `Path=/`, `Secure` unless the dev profile relaxes it (same property as the session cookie). It is
checked on every request (constant-time MAC, expiry, `iat` not in the future, `ep` equals the current `viewer_epoch`,
cached 5 s) and creates a stateless ROLE_VIEWER authentication: no HttpSession is created for viewers.

**Rate limiting** (in memory, Caffeine, bounded): 5 failed attempts per client (IPv4 exact, IPv6 per `/64`) per sliding
10 minutes and 30 failed attempts overall per sliding HOUR, then `429` + `Retry-After`; successes are not counted. Limits
and length checks run BEFORE any PBKDF2 work. The client address is `request.getRemoteAddr()` (see "Client IP behind a
proxy": the forwarded header is trusted only from configured proxies). The global cap FAILS CLOSED by design: while it is
reached nobody (including Anvi) can unlock; the lockout clears by itself when the window slides, or immediately via
`POST /api/admin/auth/reset-rate-limits`. A trip logs ONE warning, not one per refused request. There is no other rate
limiting in the app (do it at the proxy, Phase 8).

**Settings table** (`V3__settings.sql`): `settings("key","value",updated_at)` (quoted because both are reserved in
H2) seeded with non-secret defaults only (title `Anvi ❤ Manu`, tagline, theme `rose`, special date, names,
nicknames, hero media, `viewer_epoch`). Code reads them through `SettingsService`.

## Experience (Phase 2C)

Read API for the viewer SPA, package `com.ourstory.experience`; the full contract is
[`docs/api-contract.md`](../docs/api-contract.md) (REST samples in `docs/api/our-story.http`, scripted check in
`docs/api/smoke.ps1`).

| Endpoint | Result |
|---|---|
| `GET /api/experience` | `serverTime, appTitle, tagline, defaultTheme, specialDate, easterEggNicknames, profiles, hero, worlds` (+ `adminPreview` for admins) |
| `GET /api/worlds/{slug}` | open world with `moments` and `letters`; locked world: teaser only; unknown/unpublished: identical 404; bad slug 400 |

- A world is LOCKED while `Clock.instant() < unlock_at` (the exact instant is open). A locked world exposes only
  `slug, title, subtitle, layout, themeAccent, sortOrder (card), locked, unlockAt`: no cover, count, previews, text.
- Admins see locked and unpublished worlds as open and get `adminPreview:true`; viewers never do.
- Both responses are `Cache-Control: private, no-store` and nothing is cached server-side (tiny private site; no
  staleness bugs). The number of SQL statements is constant (grouped queries; tested with a statement counter).
- Letter bodies are returned as RAW markdown; the client must render them safely (never `innerHTML`).
- **Media visibility** (`RoleBasedMediaAccessPolicy`): ADMIN reads any media. A VIEWER reads a file only when it is
  used by a moment of, or is the cover of, a PUBLISHED world that is NOT locked at that instant (one EXISTS query
  per request, clock evaluated every time). Listing an id in `heroMediaIds` grants nothing by itself. Anything else is
  `404`, identical to a nonexistent id (never 403), so existence does not leak.
- One `Clock` bean (`config/ClockConfig`, UTC, `@ConditionalOnMissingBean`) is shared by the settings, viewer
  cookie, rate limiter and experience code; tests replace it by declaring their own `Clock` bean.
- Smoke test against a running backend (dev profile): `powershell -File docs/api/smoke.ps1 -Answer <answer> -BaseUrl http://localhost:8080`.

## JVM sizing

Intended for a small host: `java -Xmx256m -jar target/our-story-0.0.1-SNAPSHOT.jar`
(or `JAVA_TOOL_OPTIONS=-Xmx256m` with `spring-boot:run`).

## Notes

- `data/` is git-ignored; it holds the database and cached media.
- Flyway migrations live in `src/main/resources/db/migration` (V1 empty baseline; V2 adds `media`, `import_job`, `import_job_failure`; V3 settings; V4 world/moment/letter; V5 makes `letter.world_id` `ON DELETE SET NULL`). V4 uses H2-specific `REGEXP_LIKE` and timestamp literals (see `docs/decisions.md` for the Postgres note).
- Downloads are buffered per image (max 15 MiB x concurrency 4), which fits in `-Xmx256m`.
- CSRF: cookie `XSRF-TOKEN`, send it back as `X-XSRF-TOKEN` on mutating `/api/admin/**` calls.
