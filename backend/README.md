# Our Story - backend

Spring Boot 3.5 (Java 21, virtual threads) API for the private "Our Story" gallery. Embedded H2 (file mode) + Flyway; no JPA.

## Run

```
mvnw.cmd spring-boot:run          # Windows
./mvnw spring-boot:run            # macOS/Linux
mvnw.cmd -q test                  # tests
```

The app starts with NO environment variables set (Google login and viewer/admin features simply stay off).
Dev profile: `--spring.profiles.active=dev` (or `SPRING_PROFILES_ACTIVE=dev`). Prod: `prod`.
The Vite dev server proxies `/api` to `http://localhost:8080`, so no CORS is configured.

Health check: `GET http://localhost:8080/actuator/health` (the only exposed actuator endpoint).

## Environment variables

Secrets are read only from the environment; never commit real values.

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | for Google login | OAuth2 client id; the Google client is registered only when this is set |
| `GOOGLE_CLIENT_SECRET` | with client id | OAuth2 client secret |
| `VIEWER_COOKIE_SECRET` | Phase 2+ | Key used to sign the viewer unlock cookie |
| `ADMIN_EMAIL` | Phase 2+ | The single Google account allowed to use `/api/admin/**` |
| `OURSTORY_DATA_DIR` | no (default `./data`) | Root for the H2 database (`<dir>/db/ourstory`) and the media cache |

## JVM sizing

Intended for a small host: `java -Xmx256m -jar target/our-story-0.0.1-SNAPSHOT.jar`
(or `JAVA_TOOL_OPTIONS=-Xmx256m` with `spring-boot:run`).

## Notes

- `data/` is git-ignored; it holds the database and cached media.
- Flyway migrations live in `src/main/resources/db/migration` (V1 is an empty baseline; schema arrives in Phase 2).
- CSRF: cookie `XSRF-TOKEN`, send it back as `X-XSRF-TOKEN` on mutating `/api/admin/**` calls.
