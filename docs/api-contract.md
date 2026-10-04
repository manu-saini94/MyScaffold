# Our Story - HTTP API contract

Contract between the Spring Boot backend and the frontend. Everything here was checked against the code
(controllers, DTO records, `SecurityConfig`), not written from memory. All JSON is UTF-8. Instants are ISO-8601
UTC strings (`2027-02-13T18:30:00Z`), dates are `YYYY-MM-DD`.

The browser talks to ONE origin (the Vite dev server proxies `/api`, `/oauth2`, `/login` to the backend), so there
is no CORS configuration and cookies are same-site.

## 1. Conventions

### 1.1 Roles and access

| Caller | How they get it | Roles |
|---|---|---|
| Anonymous | no cookie | none |
| Viewer ("Anvi") | correct unlock answer sets the `os_viewer` cookie | `ROLE_VIEWER` |
| Admin ("Manu") | Google login (`/oauth2/authorization/google`), verified email equals `ADMIN_EMAIL` | `ROLE_ADMIN` (session cookie `JSESSIONID`) |

| Path | Anonymous | Viewer | Admin |
|---|---|---|---|
| `GET /api/auth/question`, `GET /api/auth/status`, `POST /api/auth/unlock`, `POST /api/auth/lock` | allowed | allowed | allowed |
| `/api/experience`, `/api/worlds/**`, `/api/media/**` | 401 | allowed | allowed |
| `/api/admin/**` | 401 | 403 | allowed |
| `/actuator/health`, `/oauth2/**`, `/login/**`, `/error`, static assets | allowed | allowed | allowed |
| `GET`/`HEAD` of an SPA route: extension-less path whose first segment is not `api`, `oauth2`, `login`, `logout`, `actuator`, `assets` or `error` (`/unlock`, `/who`, `/admin/**`, `/world/**`, `/story`, ...) | `200 index.html` (`no-cache`) | same | same |
| anything else | 401 (anonymous) / 403 | 403 | 403 |

An anonymous call to a protected path is a plain `401` (no redirect, no login page). Anything not listed is denied
by default. The SPA rule only serves the app shell: data still comes from `/api/**` under the rules above, and any
other method on an SPA route is denied.

### 1.2 CSRF (applies to EVERY POST, PUT, PATCH, DELETE on every path, no exemptions)

1. Make any GET first (the SPA calls `GET /api/auth/question`). The response sets the cookie `XSRF-TOKEN`
   (not HttpOnly, `SameSite=Lax`, `Path=/`).
2. Send every mutating request with the header `X-XSRF-TOKEN: <value of the XSRF-TOKEN cookie>` AND the
   cookie itself (browsers do this automatically).
3. Missing or wrong token: `403` (empty or generic body). Read the cookie again after a 403 and retry once.

### 1.3 Error format

Errors are RFC 7807 `application/problem+json`:

```json
{
  "type": "urn:ourstory:problem:not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "World not found",
  "instance": "/api/worlds/nope"
}
```

`type` is `urn:ourstory:problem:<code>`; `detail` is safe to show. Bodies never contain stack traces, SQL, Google
response bodies or rejected input values. Extra members by case:

| Case | Status | Extra members |
|---|---|---|
| ANY validation failure: bean validation, malformed or mistyped JSON, settings, blank unlock answer | 400 `validation-failed` | `errors: [{"field":"slug","message":"must be kebab-case (a-z, 0-9, hyphens)"}]` (always an ARRAY; `field` is a JSON path such as `moments[0].caption`, or `body` when the whole body is unreadable; rejected values are never echoed) |
| Destructive call not confirmed (`DELETE /api/admin/worlds/{id}` without `?confirm=true`) | 400 `confirmation-required` | `momentCount` |
| Request body too large (auth 4096 bytes, admin 1 MiB, counted as read, chunked included) | 413 `payload-too-large` | none |
| Malformed id or slug in a path, bad query | 400 `invalid-request` | none |
| Unknown or hidden resource | 404 `not-found` | none |
| Duplicate world slug | 409 `slug-conflict` | none |
| Google must be (re)connected | 409 `google-reconnect-required` | `authorizeUrl` |
| Semantic problems (bad order list, unknown media, duplicate media, too many moments, unknown letter world) | 422 `invalid-order`, `unknown-media`, `duplicate-media`, `too-many-moments`, `unknown-world` | moments: `missingMediaIds` for `unknown-media` |
| The world or photos changed while saving moments | 409 `moments-conflict` | none |
| Unlock wrong answer | 401 `unlock-failed` | `attemptsRemaining` |
| Unlock rate limited | 429 `too-many-attempts` | `retryAfterSeconds` (and `Retry-After` header) |
| Unlock not configured | 503 `unlock-not-configured` | none |
| Google upstream failure | 502 `google-api-error` | none |
| Anything unexpected | 500 | none |

There is exactly one shape of `errors` (the array); settings used to return an object, that is gone.

### 1.4 Ids and caching

- Ids (worlds, moments, letters, media, jobs) are 26 character ULIDs. A malformed id in the path is `400`.
- World slugs are kebab-case: `^[a-z0-9]+(-[a-z0-9]+)*$`, max 64 characters.
- `/api/experience` and `/api/worlds/{slug}` answer `Cache-Control: private, no-store`. Never cache them: they hold
  `serverTime` and time-based locks. Media bytes are immutable and cached for a year (section 3.3).

---

## 2. Auth (public)

### 2.1 `GET /api/auth/question`
`200 {"question":"What is the name of ...?"}`. Also issues the `XSRF-TOKEN` cookie.
`503` (`unlock-not-configured`) when no question/answers are configured.

### 2.2 `GET /api/auth/status`
`200 {"unlocked": true|false}`. `true` for a valid viewer cookie or an admin session. Never errors on a bad,
expired or revoked cookie (just `false`).

### 2.3 `POST /api/auth/unlock`
Requires CSRF. Body `{"answer":"Sample"}` (1 to 100 characters; whole body at most 4 KiB).

| Status | Meaning |
|---|---|
| `204` | Correct. `Set-Cookie: os_viewer=...` |
| `401` | Wrong. `{"type":"urn:ourstory:problem:unlock-failed",...,"attemptsRemaining":3}`. The answer is never echoed |
| `400` | Validation problem with `errors:[{field,message}]` (blank answer, over 100 characters, malformed body) |
| `403` | Missing CSRF token |
| `413` | Body over 4096 bytes actually read (chunked uploads included); `application/problem+json` |
| `429` | Rate limited. `Retry-After: <seconds>` and `retryAfterSeconds` |
| `503` | Unlock not configured |

Answers are compared after normalisation (Unicode NFKC, lower-case, all whitespace removed): ` sAmPlE ` equals `Sample`.

Rate limiting (in memory): 5 FAILED attempts per client (IPv4 exact, IPv6 per `/64`) within a sliding 10 minutes and
30 failed attempts overall within a sliding HOUR, then `429` with `Retry-After`. Successful unlocks are not counted.
Limits are checked before any hashing. The global cap fails closed: while it is reached nobody can unlock until the
window slides or the admin calls `POST /api/admin/auth/reset-rate-limits` (section 4.7). Answers shorter than 4
characters can never be stored, but any 1 to 100 character attempt is accepted for comparison.

### 2.3.1 The `os_viewer` cookie
`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (except in the `dev` profile so plain `http://localhost` works),
7 days (`Max-Age` equals the signed expiry). Opaque to the client. It stops working immediately when the admin
changes the question/answers to different values or uses "sign out everyone". The client never reads it; use
`GET /api/auth/status` instead.

### 2.4 `POST /api/auth/lock`
Requires CSRF. `204` and the browser's cookie is cleared (`Max-Age=0`). This only clears THIS browser: the cookie
itself is not revoked server-side (a copy would still work until it expires or the admin signs everyone out).

---

## 3. Viewer API (viewer or admin; anonymous 401)

### 3.1 `GET /api/experience`

One call that paints the whole home screen.

```json
{
  "serverTime": "2026-10-01T00:00:00Z",
  "appTitle": "Anvi ❤ Manu",
  "tagline": "Love you till eternity and back",
  "defaultTheme": "rose",
  "specialDate": "2027-02-14",
  "easterEggNicknames": ["anvi"],
  "profiles": [
    {"id": "her", "name": "Anvi", "role": "viewer"},
    {"id": "me",  "name": "Manu", "role": "decoy"}
  ],
  "hero": [
    {"mediaId": "01K...", "width": 4000, "height": 3000, "lqip": "data:image/jpeg;base64,...", "dominantColor": "#a1b2c3"}
  ],
  "worlds": [
    {
      "slug": "where-it-all-began", "title": "Where It All Began", "subtitle": "...", "tagline": "...",
      "layout": "POLAROID_TABLE", "themeAccent": "#d6304f", "sortOrder": 1, "locked": false,
      "momentCount": 12,
      "cover": {"mediaId": "01K...", "width": 4000, "height": 3000, "lqip": "data:...", "dominantColor": "#a1b2c3"},
      "previewMediaIds": ["01K...", "01K...", "01K..."]
    },
    {
      "slug": "our-forever", "title": "Our Forever", "subtitle": "...", "layout": "CONSTELLATION",
      "themeAccent": "#e0455a", "sortOrder": 6, "locked": true, "unlockAt": "2027-02-13T18:30:00Z"
    }
  ]
}
```

Exact field sets (a test fails if anything else appears):

- top level: `serverTime, appTitle, tagline, defaultTheme, specialDate, easterEggNicknames, profiles, hero, worlds`,
  plus `adminPreview` (always `true`, only for admins).
- unlocked world: `slug, title, subtitle, tagline, layout, themeAccent, sortOrder, locked (false), momentCount, cover, previewMediaIds`.
  `cover` is `null` when the world has none. `previewMediaIds` holds at most 3 ids (first moments in display order).
- LOCKED world (teaser only): `slug, title, subtitle, layout, themeAccent, sortOrder, locked (true), unlockAt`.
  There is NO cover, count, preview, tagline or text for a locked world, not even `null` placeholders.
- `hero` / `cover` item: `mediaId, width, height, lqip, dominantColor` (`lqip` is a tiny `data:` URI placeholder;
  width/height/lqip/dominantColor may be `null`).
- `layout` is one of `POLAROID_TABLE, FILM_STRIP, POSTCARDS, MEMORY_WALL, ENVELOPE, CONSTELLATION`.
- `subtitle`, `tagline`, `themeAccent` may be `null`.

Rules:

- Only PUBLISHED worlds, ordered by `sortOrder`. A world is LOCKED while `serverTime < unlockAt`. At exactly
  `unlockAt` it is open. Use `serverTime` (not the device clock) for countdowns.
- `hero` = the admin's `heroMediaIds` setting, keeping only media that exist and that the caller may see. When that
  is empty it falls back to the covers of unlocked worlds, then the first moment photo of each unlocked world,
  at most 8 items. Stale ids (deleted photos) are dropped silently.
- `profiles`: `her` (role `viewer`) is the real viewer; `me` (role `decoy`) is the other profile on the chooser.
- ADMIN callers see locked worlds as open (`locked:false`, full data), unpublished worlds too, and
  `"adminPreview": true`. A viewer never does.
- Headers: `Cache-Control: private, no-store`.

### 3.2 `GET /api/worlds/{slug}`

`slug` must match the kebab-case pattern, else `400 invalid-request`.

- Unknown slug, and (for viewers) an unpublished world: `404` with an IDENTICAL body (no existence leak).
- LOCKED world (viewers): `200`, teaser only:
  `{"slug","title","subtitle","layout","themeAccent","locked":true,"unlockAt","serverTime"}`.
- Open world: `200`

```json
{
  "slug": "where-it-all-began", "title": "...", "subtitle": "...", "tagline": "...",
  "layout": "POLAROID_TABLE", "themeAccent": "#d6304f", "locked": false,
  "introText": "...", "outroText": "...", "musicUrl": "https://example.com/theme.mp3",
  "nextSlug": "our-firsts",
  "serverTime": "2026-10-01T00:00:00Z",
  "moments": [
    {
      "id": "01K...", "sortOrder": 1, "caption": "First coffee", "note": "back of the polaroid",
      "happenedOn": "2019-03-02", "place": "Pune", "favourite": true,
      "media": {"mediaId": "01K...", "mimeType": "image/jpeg", "width": 4000, "height": 3000,
                "lqip": "data:image/jpeg;base64,...", "dominantColor": "#a1b2c3", "takenAt": "2019-03-02T10:15:00Z"}
    }
  ],
  "letters": [
    {"id": "01K...", "title": "For you", "body": "# raw **markdown**", "revealTrigger": "WORLD_OUTRO"}
  ]
}
```

Field set (open): `slug, title, subtitle, tagline, layout, themeAccent, locked, introText, outroText, musicUrl, nextSlug, serverTime, moments, letters` (+ `adminPreview` for admins only when the world is locked or unpublished).

- `moments` and `letters` are ordered by `sortOrder`. `letters` are those of this world only.
- `nextSlug` is the next PUBLISHED world in display order (it may be locked; show it as a teaser) or `null` for the last.
- `revealTrigger`: `WORLD_OUTRO` (reveal after the outro) or `SEALED_ICON` (reveal by opening a sealed icon).
- **Letter bodies are RAW markdown.** The server never renders HTML. The client MUST render it with a safe renderer
  (no raw HTML, no `innerHTML`/`dangerouslySetInnerHTML` with unsanitised output).
- `musicUrl` is an `https` URL, a same-origin bundled song path (`/assets/music/<name>.mp3`, see 4.4), or `null`. Nullable fields: `subtitle, tagline, themeAccent, introText, outroText, musicUrl, nextSlug, caption, note, happenedOn, place, takenAt`.
- ADMIN: locked or unpublished worlds come back in the open shape with `"adminPreview": true`; `locked` is `false`.

### 3.3 `GET /api/media/{id}/{size}`

`size` is `thumb`, `medium` or `full`. Returns the JPEG bytes.

- `200` with `Content-Type: image/jpeg`, strong `ETag`, `Cache-Control: max-age=31536000, private, immutable`.
- `304` when `If-None-Match` matches the ETag.
- `404` for: unknown id, unknown size, AND media the caller may not see. A hidden image is indistinguishable
  from a missing one (never 403).
- Who may read what: ADMIN any media. VIEWER only media that is used by a moment of, or is the cover of, a
  PUBLISHED world that is NOT locked right now. The hero setting grants nothing by itself. The check runs on
  every request against the server clock, so a photo of "Our Forever" becomes readable at the unlock instant
  (re-request images after the unlock instant; do not remember an earlier 404).

Use `<img src="/api/media/{id}/thumb">` (cookie authenticated). Use `lqip` as the blur placeholder.

---

## 4. Admin API (`/api/admin/**`: admin session; viewers get 403, anonymous 401; mutating calls need CSRF)

### 4.1 Session
- `GET /api/admin/me` -> `{"email","name","admin":true,"pickerConnected":false}`
- Login: browser navigation to `/oauth2/authorization/google`. Non-admin Google accounts are signed out at once (403 page).
- Logout: `POST /logout` (CSRF) -> `200`, also removes stored Google tokens.

### 4.2 Picker and imports (Google Photos; Google is never called in tests)
- `POST /api/admin/picker/sessions` body optional `{"maxItemCount": 1..2000}` ->
  `{"sessionId","pickerUri","pollingConfig":{"pollIntervalMs","timeoutMs"},"expireTime"}`. `pickerUri` ends with `/autoclose`.
- `GET /api/admin/picker/sessions/{id}` -> `{"mediaItemsSet":false,"pollingConfig":{...}|null,"expireTime"}`.
- `POST /api/admin/picker/sessions/{id}/import` -> `202 {"jobId"}`; `409` when another import runs or Google must be reconnected.
- `GET /api/admin/imports/{jobId}` -> `{"jobId","status":"RUNNING|COMPLETED|FAILED","total","done","failed","skipped","error","startedAt","finishedAt","failures":[{"filename","outcome","reason"}]}`.
- `409 google-reconnect-required` carries `authorizeUrl` (`/oauth2/authorization/google-picker`): send the browser there. Other Google failures are `502 google-api-error`.

### 4.3 Media
- `GET /api/admin/media?page=0&size=50` (`size` 1..100, else 400) ->
  `{"items":[{"id","filename","mimeType","width","height","takenAt","lqip","dominantColor","importedAt"}],"page","size","total"}`, newest first. (`unassigned=true` is accepted but ignored.)
- `DELETE /api/admin/media/{id}` -> `204` (row and files; its moments go with it; a cover is cleared; the id is also removed from the `heroMediaIds` setting). `404` unknown.

### 4.4 Worlds
World object (`WorldResponse`): `id, slug, title, subtitle, tagline, layout, coverMediaId, themeAccent, sortOrder, unlockAt, introText, outroText, musicUrl, published, momentCount, createdAt, updatedAt`.

- `GET /api/admin/worlds` -> list (all worlds, published or not, by sort order).
- `GET /api/admin/worlds/{id}` -> one. `404` unknown.
- `POST /api/admin/worlds` -> `201` + `Location`, appended last. Body (`WorldRequest`):
  `{"slug","title","subtitle","tagline","layout","coverMediaId","themeAccent","unlockAt","introText","outroText","musicUrl","published"}`.
  Required: `slug` (kebab, <=64), `title` (<=120), `layout`. `subtitle/tagline` <=200, `introText/outroText` <=2000,
  `themeAccent` `#rrggbb`, `musicUrl` <=500, EITHER https (no userinfo `user@`, spaces, quotes, `<`, `>`, backslashes or
  control characters) OR a bundled song path matching exactly `^/assets/music/[a-z0-9][a-z0-9-]*\.(mp3|m4a|ogg|opus)$`
  (no `..`, `//`, query or fragment; the files live in `frontend/public/assets/music/`), `unlockAt` ISO instant or `null` (open), `published` defaults to true on create.
  `409` duplicate slug; `422 unknown-media` for a missing cover.
- `PUT /api/admin/worlds/{id}` -> update (same body; sort order unchanged). Presence matters for two fields:

  | Field | Omitted | Explicit `null` | Value |
  |---|---|---|---|
  | `published` | keeps the stored value | same as omitted (keeps) | sets it |
  | `unlockAt` | keeps the stored value | CLEARS it (always open) | sets it |

  Every other field is replaced by what is sent (omitted = cleared). `404` when the world does not exist.
- `DELETE /api/admin/worlds/{id}?confirm=true` -> `204`. Removes the world and its moments; its letters are KEPT with
  `worldId: null` (and are not shown to viewers). Without `confirm=true`: `400 confirmation-required`
  (`momentCount`, and a `detail` saying moments will be removed and letters kept). Unknown id `404`.
- `PUT /api/admin/worlds/reorder` body `{"orderedIds":[...]}`: elements must be non-blank ULIDs (null, blank or
  malformed -> `400` validation problem), every world id exactly once (else `422 invalid-order`) -> new list.
  (Declared before `/{id}` so `reorder` is never read as an id.)

### 4.5 Moments
- `GET /api/admin/worlds/{id}/moments` -> `[{id, mediaId, caption, note, happenedOn, place, sortOrder, favourite, mimeType, width, height, lqip, dominantColor, takenAt}]`.
- `PUT /api/admin/worlds/{id}/moments` body `{"moments":[{"mediaId","caption","note","happenedOn","place","favourite"}]}`:
  atomic replace; array order is the display order. At most 500; no duplicate `mediaId` (`422 duplicate-media`);
  every media must exist (`422 unknown-media` + `missingMediaIds`); caption <=500, note <=2000, place <=200.

### 4.6 Letters
Letter: `{id, worldId (nullable), title (<=160), body (<=20000, raw markdown), revealTrigger, sortOrder, createdAt}`.
- `GET /api/admin/letters?worldId=<id>` (filter optional), `POST` (`201` + `Location`), `PUT /{id}`, `DELETE /{id}` (`204`).
  Request body: `{"worldId","title","body","revealTrigger","sortOrder"}` (`worldId` and `sortOrder` optional; unknown world `422 unknown-world`; `PUT` of an unknown letter `404`).
  Letters without a `worldId` exist in the admin API but are not returned by the viewer API.

### 4.7 Settings
- `GET /api/admin/settings` -> `{"appTitle","tagline","defaultTheme","specialDate","herName","myName","easterEggNicknames":[],"heroMediaIds":[],"unlockQuestion","unlockAnswersConfigured":2}`. Answers and hashes are never returned.
- `PUT /api/admin/settings` partial update of any of `appTitle, tagline, defaultTheme ("rose"|"cinema"), specialDate (YYYY-MM-DD), herName, myName, easterEggNicknames (<=10), heroMediaIds (<=10 ULIDs), unlockQuestion`, plus write-only `unlockAnswers` (1 to 10 strings; replaces all). Returns the same view as GET. Changing the question or answers to DIFFERENT values signs every viewer out; sending the same ones again changes nothing. `unlockAnswers` entries need at least 4 characters once case and spaces are ignored (max 100). `heroMediaIds` must be unique ids of existing photos. Unknown keys and invalid values: `400` with the `errors` array (`field` is the setting name).
- `POST /api/admin/settings/sign-out-everyone` -> `204`; every viewer cookie stops working (this is the revoke).
- `POST /api/admin/auth/reset-rate-limits` -> `204`. Clears the per-client and global unlock failure counters (use after a lockout; otherwise it clears when the window slides).

---

## 5. Frontend flow cheat sheet

1. Boot: `GET /api/auth/status`. `unlocked:false` -> `GET /api/auth/question`, show it, `POST /api/auth/unlock` with `X-XSRF-TOKEN`.
2. `204` -> `GET /api/experience` and render the chooser (`profiles`), hero and world cards.
3. Open a world -> `GET /api/worlds/{slug}`; if `locked:true` show the countdown from `unlockAt - serverTime`.
4. Any `401` from a viewer endpoint -> back to the lock screen.
5. Images: `/api/media/{mediaId}/{thumb|medium|full}`, with `lqip` as placeholder.

## 6. Health
`GET /actuator/health` -> `{"status":"UP"}` (public; the only actuator endpoint).
