# Decisions

Short log of choices and dependency justifications. Newest sections at the bottom.

## Phase 0

### Design
- **Themes:** `rose` (default, white with red roses and falling petals) and `cinema` (near-black, bold red accent, inspired by streaming UIs, no third-party assets). Applied through `<html data-theme>` and one shared CSS custom-property token set.
- **Home screen:** round photo orbs scattered across a pure-white page with rose clusters at the top and bottom (Phase 4 replaced the honeycomb launcher). Each orb shows a photo from its world and opens it through a shared-element expand.
- **Particles:** hand-written Canvas 2D instead of tsparticles, to save bundle size.
- **Deferred for weight:** lenis, embla-carousel, lottie-react, howler, three.js. Add each one only when a phase needs it, with a line here.

### Backend
- **Spring Boot 3.5.16** on Java 21. Spring Initializr now only serves Boot 4.x, so it was used only to generate the Maven wrapper. Moving to 4.x means renaming starters (for example `spring-boot-starter-webmvc`).
- No JPA/Hibernate, no Lombok, no WebFlux.

| Dependency | Why |
|---|---|
| spring-boot-starter-web | Servlet MVC/REST on virtual threads |
| spring-boot-starter-security | Filter chain, CSRF, 401 handling |
| spring-boot-starter-oauth2-client | Google login for the admin |
| spring-boot-starter-validation | Bean Validation on request DTOs |
| spring-boot-starter-actuator | Health endpoint only |
| spring-boot-starter-jdbc | JdbcTemplate/JdbcClient without JPA |
| spring-boot-starter-cache + caffeine | In-memory cache for the aggregated viewer model |
| flyway-core | Migrations (H2 support is in core) |
| h2 (runtime) | Embedded file-mode database |
| spring-boot-starter-test, spring-security-test | Tests |
| org.jacoco:jacoco-maven-plugin 0.8.13 (build/test only) | Line-coverage report to check the 80% target on new code; no runtime footprint |

### Frontend

| Dependency | Why |
|---|---|
| react, react-dom | UI |
| @reduxjs/toolkit, react-redux | Store, theme slice, RTK Query |
| react-router-dom | Routing; world route is lazy |
| motion | Shared-element `layoutId` expand, loaded through `LazyMotion` |
| @fontsource/fraunces, @fontsource/inter | Self-hosted latin-only fonts, `font-display: swap` |
| vite, @vitejs/plugin-react | Build tooling |
| typescript, @types/* | Strict typing |
| sass | SCSS modules and global style layer |
| eslint, typescript-eslint, eslint-plugin-react-hooks, globals | Lint |
| vitest | Test runner; shares Vite's config and transforms |
| @vitest/coverage-v8 | Native V8 coverage to enforce the 80% target |
| jsdom | DOM for the few tests that touch it; pure logic runs in node |
| @testing-library/react, @testing-library/dom | Two component tests (launcher keyboard navigation, theme persistence); dom is the required peer |

## Phase 2

- **Viewer unlock:** one question and hashed answers in `settings` (peppered PBKDF2-SHA256, 600k iterations, per-answer salt; NFKC, lower-case, whitespace-stripped before hashing; see "Phase 2 hardening" below). Bootstrapped from `OURSTORY_UNLOCK_*` env, idempotent; `OURSTORY_UNLOCK_FORCE_RESET=true` replaces. Not configured means unlock is impossible (503). Unlock answers are never in a committed file.
- **Viewer session:** stateless signed cookie `os_viewer` (HMAC-SHA256, 7 days, HttpOnly, SameSite=Lax, Secure per profile) carrying a `viewer_epoch`. Bumping the epoch (credential change or "sign out everyone") invalidates every cookie. No HttpSession for viewers.
- **Unlock rate limiting:** in memory, 5 failures per client and 30 global per sliding hour, checked before any PBKDF2 work (details under "Phase 2 hardening").
- **CSRF** is never exempted: the SPA GETs `/api/auth/question` first, then sends `X-XSRF-TOKEN` on unlock and lock.
- **Settings table** uses quoted `"key"` and `"value"` columns (both are H2 reserved words).
- **Content:** worlds, moments and letters in V4; deleting a photo cascades to its moments; letter bodies are stored as raw markdown and must be rendered safely on the client.
- **Media access:** `MediaAccessPolicy` is role-based (VIEWER or ADMIN); the "photo must belong to a visible world" rule is added by the experience layer.
- **Our Forever unlock:** 2027-02-14T00:00:00+05:30 (India time), stored as an instant; the server clock is the source of truth for the countdown.
- **Experience API:** `GET /api/experience` and `GET /api/worlds/{slug}` build their payload per request with a constant number of SQL statements and send `Cache-Control: private, no-store`. No server-side cache: a tiny private site, `serverTime` must be fresh and locks change with time, so a cache would only add staleness bugs.
- **Locked worlds are teasers by type:** locked and open worlds are different response records, so a locked world cannot leak cover, counts, previews or text. A viewer asking for an unpublished or unknown slug gets the same 404; a locked slug gets a 200 teaser (the countdown screen needs it).
- **Media visibility:** a viewer may read a media file only if a moment or the cover of a PUBLISHED, currently unlocked world uses it (admin: any). Hidden media answers 404, never 403. The hero setting grants nothing on its own. The decision is one EXISTS query per request and is never cached because locks open by time.
- **Single `Clock` bean** (`ClockConfig`, `@ConditionalOnMissingBean`), consumed by Part B via `ObjectProvider<Clock>` and by the experience code; tests override it.
- **Hero:** configured `heroMediaIds` (existing and visible only), else covers of unlocked worlds, then the first moment photo of each unlocked world, max 8. Letters without a world are not exposed to viewers.

## Phase 2 hardening (review fixes)

- **Fail-closed lockout accepted.** The unlock limiter is global as well as per client: 5 failures per client key per 10 minutes and 30 failures overall per rolling HOUR (was 60 per 10 minutes). When the global cap is reached nobody can unlock, including the legitimate viewer. That is accepted for a one-person private gift (an attacker cannot cheaply grind 600k-iteration hashes anyway). Recovery: the lockout clears by itself when the window slides, or the admin calls `POST /api/admin/auth/reset-rate-limits` (clears per-client and global counters). A trip logs ONE WARN, not one per refused request. Client key: IPv4 exact, IPv6 aggregated to the `/64` so rotating addresses inside a subscriber's prefix does not multiply attempts.
- **Pepper design.** Hash version `pbkdf2-sha256-p1$iters$salt$hash`: the PBKDF2 password is `Base64(HMAC-SHA256(pepperKey, normalizedAnswer))`, `pepperKey = HMAC-SHA256(VIEWER_COOKIE_SECRET, "our-story:unlock-pepper:v1")`. A database-only leak cannot be brute-forced offline without the secret. **Consequence: rotating `VIEWER_COOKIE_SECRET` invalidates both the viewer cookies and the peppered answers**; re-set the answers via the admin API or `OURSTORY_UNLOCK_FORCE_RESET`. With a blank secret (non-prod, ephemeral cookie key) answers are stored UN-peppered (legacy `pbkdf2-sha256$...`, still verified; the cost is identical) with a WARN, because an ephemeral key would orphan the hashes on every restart. Peppered hashes without the configured secret fail closed. No production data existed yet, so no migration path beyond "re-set answers" was built.
- **600,000 PBKDF2 iterations** by default (OWASP guidance for PBKDF2-HMAC-SHA256 is 600k); the prod profile refuses fewer, the property is capped at 5,000,000 (also the cap applied when reading a stored hash). Verification runs under a 2-permit semaphore so a burst of attempts cannot pin every carrier thread; the limiter and length checks still run first.
- **Answer policy.** Stored answers need at least 4 normalised characters (admin API and bootstrap). Attempts of 1 to 100 characters are still compared. Writing the same question/answers again is a no-op and does not bump the epoch. Placeholder cookie secrets (`change-me`, `changeme`, `secret`, `password`) are refused in prod.
- **Forwarded-header policy.** Prod no longer trusts `X-Forwarded-For` from whoever connects (`forward-headers-strategy: framework` did). It uses `server.forward-headers-strategy=native` with Tomcat's `RemoteIpValve` configured through properties: `server.tomcat.remoteip.remote-ip-header=X-Forwarded-For` and `server.tomcat.remoteip.internal-proxies=${OURSTORY_TRUSTED_PROXIES:<loopback only>}` (property names checked against the Boot 3.5.16 configuration metadata). The header is honoured only when the TCP peer matches that regex; Tomcat's own default (all private ranges) is deliberately overridden. The proxy must OVERWRITE (not append to) `X-Forwarded-For`, and port 8080 must be reachable only from the proxy. Tested with a real Tomcat for both an untrusted peer (forged values share one bucket) and a trusted loopback proxy.
- **Cookie lifetime 7 days** (was 30), `Max-Age` equals the signed `exp`. `POST /api/auth/lock` only clears the browser's cookie; revoking cookies server-side is the admin's "sign out everyone" (epoch bump).
- **Body limits** count the bytes actually read (a wrapper around the request stream) instead of trusting `Content-Length`: 4 KiB on `/api/auth/**`, 1 MiB on `/api/admin/**`, `413` ProblemDetail. `spring.jackson.constraints.read.max-string-length` does not exist in Boot 3.5.16 (checked in the configuration metadata), so it is not set; the byte caps are the guard.
- **Validation errors have ONE shape everywhere:** `400 urn:ourstory:problem:validation-failed` with `errors:[{field,message}]` (array), for bean validation, malformed JSON, wrong types and the settings endpoints (which used to return an object). The content-package-only advice was removed; `ApiExceptionHandler` owns it.
- **Delete semantics.** `letter.world_id` is `ON DELETE SET NULL` (V5): deleting a world keeps its love letters (world-less letters are not shown to viewers). `DELETE /api/admin/worlds/{id}` needs `?confirm=true`, otherwise `400 confirmation-required` with the moment count. PUT keeps an omitted `published`/`unlockAt` and clears `unlockAt` on an explicit `null` (a small `Presence` record with its own Jackson deserializer; no new dependency). Deleting a photo prunes it from `heroMediaIds`; covers become NULL through the FK.
- **Unlock bootstrap** is a `SmartInitializingSingleton` (credentials are stored before the server accepts requests). A forced reset with invalid env values is skipped with a WARN; with values equal to what is stored it changes nothing.
- **Security event log** (`com.ourstory.security`): unlock success/failure, limiter trip, rate-limit reset, settings changed (key names only), sign-out-everyone; client addresses masked; never answers, cookies, hashes or secrets.
- **Postgres portability note.** `V4__content.sql` uses H2-specific `REGEXP_LIKE` check constraints and `TIMESTAMP WITH TIME ZONE '...'` literals; a move to Postgres needs those rewritten (`~` operator / `CHECK (slug ~ '...')`, `TIMESTAMPTZ '...'`). V5 uses plain `ALTER TABLE ... DROP/ADD CONSTRAINT`, valid in both.
- **No rate limiting beyond unlock inside the app.** Other endpoints (`/oauth2/**`, `/login/**`, `/api/**`) are to be limited at the reverse proxy in Phase 8.
- **Deferred on purpose:** the optional private-link second factor (owner undecided), pinning the admin Google `sub`, proxy-level limiting of other endpoints, a `__Host-` cookie prefix, caching `/api/auth/question`.

## Phase 3 (frontend foundation)
- **CSRF in one place.** `services/api.ts` wraps `fetchBaseQuery`: every POST/PUT/PATCH/DELETE sends `X-XSRF-TOKEN` read from the `XSRF-TOKEN` cookie. No cookie yet means `GET /auth/question` first. A 403 on a mutation re-reads the cookie (fetching the question again if it is gone) and retries exactly once; a second 403 is returned to the caller. Reason: contract 1.2, and an unbounded retry would hammer the rate limiter.
- **401 handling.** A 401 from `/experience`, `/worlds/**` or `/media/**` dispatches `sessionLost()`; `SessionGate` then routes to `/unlock`. A 401 from `/auth/unlock` is a wrong answer and is NOT a session loss (the caller reads the Problem).
- **Server clock offset.** On every `/experience` or `/worlds/{slug}` response the offset `serverTime - Date.now()` is stored (`services/serverClock.ts`, set in `transformResponse` so it is right before first render). `isWorldLocked` and the countdown use `serverNow()`, so a wrong device clock cannot unlock or hide a chapter early. The server still enforces the lock.
- **Profile in sessionStorage.** The chosen profile (`'her'`) lives in `sessionStorage` (tab lifetime, cleared on `sessionLost`), not localStorage: it is a convenience, not an identity, and must not outlive the viewer session. Storage that throws is tolerated (the choice stays in memory).
- **Theme default.** `experience.defaultTheme` is applied once, only when localStorage holds no theme. Applying it uses `applyTheme`, which also stores it, so a later change of the server default does not override a theme the page has already shown.
- **Mock data is test-only.** `worldsMock.ts` is a fixture; `config.ts` (`FOREVER_UNLOCK_AT`) is removed.
- **No new dependencies.** RTK Query, react-router and the existing test stack cover everything.

## Phase 6 (admin UI)
- Admin lives at `/admin/*`, lazy chunk, outside `SessionGate` (a Google session, not a viewer). Sections: Import, Library, Worlds (+ moments), Letters, Settings. `/api/admin/me`: 401 -> Google sign-in link, 403 -> not-admin message.
- `services/adminApi.ts` uses `api.enhanceEndpoints({addTagTypes})` so `services/api.ts` is untouched. Admin mutations also invalidate the viewer tags `Experience` and `World`.
- Picker and import polling is a small effect-driven loop (`usePoll`) that reads the delay from each response (`pollIntervalMs`, floor 500 ms, stops at `timeoutMs`), not RTK `pollingInterval`.
- QR code: `uqr` `encode()` matrix drawn as one SVG `<path>`; nothing is injected as markup. `authorizeUrl` is used only when it is a local path.
- Library "unassigned" filter is client-side (the API ignores `unassigned=true`): union of all worlds' moments, applied to the loaded page.
- World PUT always sends every field (omitted = cleared server-side), including `musicUrl`; `unlockAt` empty is sent as `null` (clears the lock).
- Settings never pre-fill answers; `unlockAnswers` is sent only when typed (one per line) and replaces all.
- Letters preview uses `react-markdown` with no raw HTML. Reordering: `@dnd-kit` (pointer + keyboard sensors) plus Up/Down buttons.
- Removed: the temporary `/dev/**` import page, its security permit and `ourstory.dev-tools.enabled`. `ourstory.post-login-url` now defaults to `/admin`.

## Phase 8 (ship)
- **SPA fallback in the resource handler, not a controller.** `StaticResourceConfig` registers `/**` over `classpath:/static/` with a `PathResourceResolver` that returns `index.html` when no file matches and `SpaRoutes.isClientRoute` says so (extension-less last segment, first segment not `api|oauth2|login|logout|actuator|assets|error`). A controller mapped to `/**` would shadow real static files (controllers outrank the resource handler). Only GET/HEAD reach it. `SecurityConfig` uses the same `SpaRoutes` check as a GET/HEAD-only matcher, so resolver and permits cannot disagree; everything else stays deny-by-default and `/api/**` is unchanged (anonymous 401). A root-level public file with an extension other than `favicon.*` needs its own permit.
- **Caching:** `/assets/**` (hashed Vite output) `max-age=31536000, public, immutable`; every other static response including `index.html` `no-cache` (ETag/Last-Modified revalidation).
- **Fat JAR:** Maven profile `ship` (`mvnw -Pship clean package`): `com.github.eirslett:frontend-maven-plugin` 2.0.2 (latest release in Maven Central metadata) installs Node v24.21.0 (current LTS "Krypton" per nodejs.org/dist/index.json) into `backend/target/node`, runs `npm ci` and `npm run build` in `frontend/`, then `maven-resources-plugin` copies `frontend/dist` to `target/classes/static`. Off by default so `mvnw test` needs no npm.
- **Image:** multi-stage. `node:24-alpine3.24` (SPA build) -> `eclipse-temurin:21-jdk-alpine-3.24` (Maven wrapper, `-DskipTests`) -> `eclipse-temurin:21-jre-alpine-3.24` (runtime). Runtime chosen over distroless because busybox `wget` gives an in-image `HEALTHCHECK` on `/actuator/health` without installing curl; the JRE ships `java.desktop` for ImageIO. Non-root uid 10001, `-Xmx256m` via `JAVA_TOOL_OPTIONS`, `VOLUME /data`, `SPRING_PROFILES_ACTIVE=prod`. With an orchestrator HTTP check, point it at `/actuator/health` and drop the in-image one.
- **Still at the proxy:** TLS, `X-Forwarded-For` overwrite, rate limits for `/oauth2/**`, `/login/**`, `/api/**`.

## Open decisions
- Fonts, rose motif and launcher density (see the Phase 0 report).
- Google redirect URI origin (Vite `:5173` vs Spring `:8080`).
- Stay in OAuth Testing mode (weekly reconnect) or publish the app.
- Stay on Boot 3.5 or move to 4.x.
- TODO (Phase 8): rate limiting on `/oauth2/**`, `/login/**` and `/api/**` (everything except the unlock limiter). Do it at the reverse proxy, or add a filter then. Not implemented in the app.
- TODO: pin the admin Google `sub` (and `hd` claim if a Workspace account is ever used) in addition to the verified email.
- TODO: Vite dev proxy lacks `/login` and `/logout`; add them (see backend README, dev admin sign-in) so the whole OAuth round trip stays on `:5173`.
- Note: `ourstory.viewer-cookie-secret` is unused by Phase 1 code; it is validated (prod: 32+ chars) so Phase 2 can rely on it.
