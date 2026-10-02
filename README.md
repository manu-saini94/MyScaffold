# Our Story

A private, cinematic photo gallery for Anvi, from Manu. Photos are grouped into **worlds** (chapters). The home screen scatters round photo icons across a white page framed by roses; each icon shows a photo from its world and opens that world's own interactive layout. Story mode plays every chapter as a slideshow.

- **Backend:** Spring Boot 3.5 (Java 21), Maven, H2 file DB, Flyway.
- **Frontend:** React + Vite + TypeScript, RTK Query, SCSS modules.
- **Themes:** `rose` (pure white, red roses, dark sparkly gold text; default) and `cinema` (dark).
- **Photos:** imported from Google Photos through the Photos Picker API and cached on disk.

Status: **Phase 8 (ship)**. See `docs/decisions.md` for choices and open decisions.

## Layout

```
backend/    Spring Boot app
frontend/   React app
docs/       decisions, Google Photos Picker notes
.env.example
```

## Run locally

Requirements: Java 21, Node 20+.

```bash
# once: copy .env.example to .env (repo root) and fill it in; the dev profile reads it
# terminal 1
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
# Windows PowerShell: .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
# http://localhost:8080/actuator/health -> {"status":"UP"}
# http://localhost:8080/api/auth/question -> your question (503 means .env or the dev profile is missing)

# terminal 2
cd frontend
npm install
npm run dev                     # http://localhost:5173, proxies /api and /oauth2 to :8080
```

Checks:

```bash
cd backend && ./mvnw test
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

## Configuration

Copy `.env.example` to `.env` and fill in the values. Secrets come only from environment variables and are never committed.

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (admin login, Photos Picker) |
| `ADMIN_EMAIL` | The only account allowed into `/admin` |
| `VIEWER_COOKIE_SECRET` | Key used to sign the viewer cookie |
| `OURSTORY_DATA_DIR` | Folder for the database and cached photos (persistent volume in production) |

The backend starts without the Google variables; the admin login is simply disabled.

## Deploy

One process, one origin: the jar serves the React app and the API on `:8080`. Client routes (`/unlock`, `/who`,
`/admin/**`, `/world/**`, `/story`, any extension-less non-API GET) answer `index.html`; `/api/**`, `/oauth2/**`,
`/login/**`, `/logout`, `/actuator/**` and real files behave as before. `index.html` is `no-cache`, `/assets/**` is
`immutable` for a year.

**Fat JAR (one command; needs Java 21 only, Node is downloaded into `backend/target/node`):**

```bash
cd backend
./mvnw -Pship clean package -DskipTests      # Windows: .\mvnw.cmd -Pship clean package -DskipTests
java -jar target/our-story-0.0.1-SNAPSHOT.jar
```

The `ship` profile runs `npm ci` and `npm run build` in `frontend/` and copies `frontend/dist` into the jar. Plain
`mvnw test` / `mvnw package` never touch npm and never include the SPA.

**Docker** (run the tests first with `mvnw test`; the image build only packages):

```bash
docker build -t our-story .
docker run -d --name our-story -p 8080:8080 --env-file <your env file> -v our-story-data:/data our-story
docker compose up -d --build          # compose.yaml: env_file, named volume, published on 127.0.0.1:8080
```

The image runs as a non-root user (uid 10001) with `SPRING_PROFILES_ACTIVE=prod`, `OURSTORY_DATA_DIR=/data` and
`JAVA_TOOL_OPTIONS=-Xmx256m`. `HEALTHCHECK` polls `/actuator/health`.

**Required in production** (the `prod` profile refuses to start otherwise):

| Variable | Rule |
|---|---|
| `VIEWER_COOKIE_SECRET` | 32+ characters, not a placeholder (`change-me`, `changeme`, `secret`, `password`). Generate with `openssl rand -base64 48` |
| `OURSTORY_UNLOCK_QUESTION`, `OURSTORY_UNLOCK_ANSWERS` | Seed the lock screen on first start (answers 4+ characters each); without them unlock answers 503 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL` | All three together, or none (admin login off). A half-set Google config fails startup |
| `OURSTORY_DATA_DIR` | Persistent volume (`/data` in the image) |
| `OURSTORY_TRUSTED_PROXIES` | Only when the proxy is not on loopback: regex of the proxy's address, for example `172\.18\.0\.\d{1,3}` |

**Behind a reverse proxy** (Caddy, nginx, Traefik): terminate HTTPS there and forward to `:8080`. The proxy must
OVERWRITE `X-Forwarded-For` (not append) and send `X-Forwarded-Proto: https`; port 8080 must be reachable only from the
proxy (compose publishes it on `127.0.0.1`). The session and viewer cookies are `Secure`, so the site works only over
HTTPS. Rate-limit `/oauth2/**`, `/login/**` and `/api/**` at the proxy; the app limits only unlock attempts.

**Google OAuth:** in the Cloud Console add both redirect URIs for the production origin:
`https://YOUR-DOMAIN/login/oauth2/code/google` and `https://YOUR-DOMAIN/login/oauth2/code/google-picker`.

**Backups:** everything lives in the data volume (`db/` = H2 database, `media/` = cached photos). Stop the container
(`docker compose stop`) and archive the volume, for example
`docker run --rm -v our-story-data:/data -v "$PWD":/backup alpine tar czf /backup/our-story-data.tgz -C /data .`
A copy of a running H2 file can be inconsistent. Photos can be re-imported from Google Photos; the database cannot.

**Rotating `VIEWER_COOKIE_SECRET`:** signs every viewer out AND invalidates the stored (peppered) unlock answers.
Start once with `OURSTORY_UNLOCK_FORCE_RESET=true` plus the question and answers (or re-set them in the admin
settings), then remove the flag.

## Google Cloud setup

Step-by-step checklist, verified against Google's docs, is at the end of
[`docs/google-photos-picker-notes.md`](docs/google-photos-picker-notes.md).
Key points: enable the **Google Photos Picker API**, keep the OAuth consent screen in **Testing** with your Google account as the test user, and expect to reconnect Google about weekly (test-mode refresh tokens expire after 7 days). Photos already imported keep working because they are cached locally.

## Roadmap

0. Scaffold and design preview (this phase)
1. Google import
2. Content and viewer auth
3. Frontend foundation
4. Launcher with real data
5. World layouts, one at a time
6. Admin UI
7. Story mode, letters, polish
8. Ship (fat JAR, Docker)
