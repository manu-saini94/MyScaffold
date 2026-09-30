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

## Open decisions
- Fonts, rose motif and launcher density (see the Phase 0 report).
- Google redirect URI origin (Vite `:5173` vs Spring `:8080`).
- Stay in OAuth Testing mode (weekly reconnect) or publish the app.
- Stay on Boot 3.5 or move to 4.x.
