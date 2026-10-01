# Our Story - backend

Spring Boot 3.5 (Java 21, virtual threads) API for the private "Our Story" gallery. Embedded H2 (file mode) + Flyway; no JPA.

## Run

```
mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev     # Windows, local development
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev       # macOS/Linux, local development
mvnw.cmd -q test                                            # tests
```

**Local runs need the `dev` profile.** The base configuration is secure by default (session cookie is `Secure`,
`HttpOnly`, `SameSite=Lax`, 30 minute timeout, `/dev/**` pages off). A `Secure` cookie is never sent over plain
`http://localhost`, so without `dev` the Google login silently loops. The `dev` profile only relaxes the cookie's
`Secure` flag and turns on the temporary `/dev/import.html` page. Prod: `prod`.

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
| `VIEWER_COOKIE_SECRET` | prod (32+ chars) | Key used to sign the viewer unlock cookie (Phase 2). Not used by Phase 1 code, but the `prod` profile refuses to start when it is blank or shorter than 32 characters |
| `ADMIN_EMAIL` | with client id | The single Google account allowed to use `/api/admin/**` (verified email, case-insensitive), for example `you@example.com`. Required whenever `GOOGLE_CLIENT_ID` is set |
| `OURSTORY_DATA_DIR` | no (default `./data`) | Root for the H2 database (`<dir>/db/ourstory`) and media files (`<dir>/media/{ulid}/{thumb,medium,full}.jpg`) |

Optional tuning (`application.yml`, prefix `ourstory.`): `import-job.concurrency` (default 4, max 16),
`import-job.max-download-bytes` (default 15 MiB per image), `import-job.max-attempts` (4, also used for Picker API
calls), `import-job.backoff-base-millis` (500), `import-job.job-timeout` (2h, whole job; then FAILED "Import timed
out"), `import-job.download-timeout` (2m, reading one image body), `import-job.min-free-bytes` (200 MB; below that
items fail with `disk_full`), `dev-tools.enabled` (false; true only in the `dev` profile),
`post-login-url` (`/dev/import.html`, TEMPORARY; must match `^/(?!/)[A-Za-z0-9._~/-]*$`).

### Startup checks

The app stops at startup with an "APPLICATION FAILED TO START" report listing every problem when:
`GOOGLE_CLIENT_ID` is set but `GOOGLE_CLIENT_SECRET` or `ADMIN_EMAIL` is blank; `ourstory.google.picker-base-url` is
not https; an `allowed-media-hosts` entry is not a lowercase bare host name; or, in the `prod` profile only,
`VIEWER_COOKIE_SECRET` is blank or shorter than 32 characters.

### Security posture

- Deny by default: only `/actuator/health`, static assets, `/oauth2/**`, `/login/**`, `/error`, and (dev profile only)
  `/dev/**` are reachable without the admin role; `/api/admin/**` and `/api/media/**` need `ROLE_ADMIN`; everything
  else is denied.
- CSRF is enforced on every POST/PUT/PATCH/DELETE on every path, including `/logout`. There are no exemptions.
- A Google account that is not the admin is signed out immediately after login (403 page, stored tokens removed).
  Logout also removes the stored Google tokens.
- Headers: CSP (`default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none';
  base-uri 'self'; form-action 'self'`), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
  The dev page therefore uses `import.js` and `import.css` instead of inline script and style.
- Clients that carry Google tokens never follow redirects (a 3xx is a failure).
- Behind a proxy (`prod`), port 8080 must only be reachable through the proxy: forwarded headers are trusted.

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

Open **http://localhost:8080/dev/import.html** (TEMPORARY dev page, replaced by the admin UI in Phase 6):
sign in with Google, click "Connect Google Photos" (consent for the Picker scope), then "Start import", pick photos
in the tab that opens, and watch the progress bar. Imported photos appear below as thumbnails.

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
| `GET /api/media/{id}/{thumb\|medium\|full}` | Image bytes, strong ETag, `Cache-Control: private, max-age=31536000, immutable`, 304 on `If-None-Match`; admin only for now (`MediaAccessPolicy` is the Phase 2 extension point) |

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
| `letter` | Optional `world_id` (cascade), title, `body` (RAW markdown, <= 20,000 chars, stored as-is; the frontend renders it safely, the server never renders it as HTML), `reveal_trigger` WORLD_OUTRO or SEALED_ICON |

Endpoints (all `/api/admin/**`: admin session, CSRF on mutating calls, errors are `application/problem+json`):

| Method and path | Result |
|---|---|
| `GET /api/admin/worlds` | All worlds including unpublished, each with `momentCount` |
| `GET /api/admin/worlds/{id}` | One world |
| `POST /api/admin/worlds` | `201` + `Location`; appended last |
| `PUT /api/admin/worlds/{id}` | Full update (sort order unchanged) |
| `DELETE /api/admin/worlds/{id}` | `204`; cascades moments and letters |
| `PUT /api/admin/worlds/reorder` `{orderedIds}` | Must be every world id exactly once, else `422`; returns the new list |
| `GET /api/admin/worlds/{id}/moments` | Moments with media info (width, height, lqip, dominantColor, mimeType, takenAt) |
| `PUT /api/admin/worlds/{id}/moments` `{moments:[{mediaId,caption,note,happenedOn,place,favourite}]}` | Atomic bulk replace; array order is display order |
| `GET /api/admin/letters?worldId=` | All letters or one world's |
| `POST` / `PUT /{id}` / `DELETE /{id}` `/api/admin/letters` | Letter CRUD (`201` + `Location` on create) |

Rules: ids must be ULIDs (`400` otherwise); unknown ids `404`; duplicate slug `409`; bean-validation failures `400` with
`errors:[{field,message}]`; moments: at most 500, no duplicate `mediaId`, every `mediaId` must exist (`422` with
`missingMediaIds`), caption <= 500, note <= 2000, place <= 200; unknown cover media or letter world `422`.
Content code never touches Google Photos or media files. Read methods for the experience layer:
`WorldRepository.findPublished()`, `MomentRepository.listByWorld/countsByWorld/firstMediaIdsByWorld`, `LetterRepository.findByWorld`.

## JVM sizing

Intended for a small host: `java -Xmx256m -jar target/our-story-0.0.1-SNAPSHOT.jar`
(or `JAVA_TOOL_OPTIONS=-Xmx256m` with `spring-boot:run`).

## Notes

- `data/` is git-ignored; it holds the database and cached media.
- Flyway migrations live in `src/main/resources/db/migration` (V1 empty baseline; V2 adds `media`, `import_job`, `import_job_failure`; world/moment/letter tables arrive in Phase 2).
- Downloads are buffered per image (max 15 MiB x concurrency 4), which fits in `-Xmx256m`.
- CSRF: cookie `XSRF-TOKEN`, send it back as `X-XSRF-TOKEN` on mutating `/api/admin/**` calls.
