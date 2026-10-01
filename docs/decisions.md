# Decisions

Short log of choices and dependency justifications. Newest sections at the bottom.

## Phase 0

### Design
- **Themes:** `rose` (default, white with red roses and falling petals) and `cinema` (near-black, bold red accent, inspired by streaming UIs, no third-party assets). Applied through `<html data-theme>` and one shared CSS custom-property token set.
- **Home screen:** a smartwatch-style honeycomb launcher. Each round icon is one world and opens that world's gallery through a shared-element expand.
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

- **Viewer unlock:** one question and hashed answers in `settings` (PBKDF2-SHA256, 210k iterations, per-answer salt; NFKC, lower-case, whitespace-stripped before hashing). Bootstrapped from `OURSTORY_UNLOCK_*` env, idempotent; `OURSTORY_UNLOCK_FORCE_RESET=true` replaces. Not configured means unlock is impossible (503). Unlock answers are never in a committed file.
- **Viewer session:** stateless signed cookie `os_viewer` (HMAC-SHA256, 30 days, HttpOnly, SameSite=Lax, Secure per profile) carrying a `viewer_epoch`. Bumping the epoch (credential change or "sign out everyone") invalidates every cookie. No HttpSession for viewers.
- **Unlock rate limiting:** in memory, 5 failures per IP and 60 global per sliding 10 minutes, checked before any PBKDF2 work. Client IP is `getRemoteAddr()`, so port 8080 must be reachable only via the proxy.
- **CSRF** is never exempted: the SPA GETs `/api/auth/question` first, then sends `X-XSRF-TOKEN` on unlock and lock.
- **Settings table** uses quoted `"key"` and `"value"` columns (both are H2 reserved words).
- **Content:** worlds, moments and letters in V4; deleting a photo cascades to its moments; letter bodies are stored as raw markdown and must be rendered safely on the client.
- **Media access:** `MediaAccessPolicy` is role-based (VIEWER or ADMIN); the "photo must belong to a visible world" rule is added by the experience layer.
- **Our Forever unlock:** 2027-02-14T00:00:00+05:30 (India time), stored as an instant; the server clock is the source of truth for the countdown.

## Open decisions
- Fonts, rose motif and launcher density (see the Phase 0 report).
- Google redirect URI origin (Vite `:5173` vs Spring `:8080`).
- Stay in OAuth Testing mode (weekly reconnect) or publish the app.
- Stay on Boot 3.5 or move to 4.x.
- TODO (Phase 8): rate limiting on `/oauth2/**`, `/login/**` and `/api/**`. Do it at the reverse proxy, or add a filter then. Not implemented in the app.
- TODO: pin the admin Google `sub` (and `hd` claim if a Workspace account is ever used) in addition to the verified email.
- TODO (Phase 6): remove `/dev/**` from the jar when the real admin UI replaces the dev import page. Until then it is served only when `ourstory.dev-tools.enabled=true` (dev profile).
- Note: `ourstory.viewer-cookie-secret` is unused by Phase 1 code; it is validated (prod: 32+ chars) so Phase 2 can rely on it.
