# Our Story

A private, cinematic photo gallery for Anvi, from Manu. Photos are grouped into **worlds** (chapters). The home screen is a smartwatch-style honeycomb of round icons; each icon opens its own gallery.

- **Backend:** Spring Boot 3.5 (Java 21), Maven, H2 file DB, Flyway.
- **Frontend:** React + Vite + TypeScript, RTK Query, SCSS modules.
- **Themes:** `rose` (white with red roses, default) and `cinema` (dark).
- **Photos:** imported from Google Photos through the Photos Picker API and cached on disk.

Status: **Phase 0 (scaffold)**. See `docs/decisions.md` for choices and open decisions.

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
