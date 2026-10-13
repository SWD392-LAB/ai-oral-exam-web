# ai-oral-exam-web

Frontend for **AIVES – AI-powered Viva Exam System** (SWD392). One React web app for all three roles: **Student**, **Lecturer** and **Administrator**, with shared sign-in (done by Keycloak) and account settings.

- **Stack:** React + Vite (responsive, works on tablets)
- **Backend communication:** REST for normal requests; **WebSocket** for the interview (the server pushes the next question or a follow-up)
- **Microphone:** browsers only allow microphone access on **HTTPS** pages (or `localhost`), so every deployed environment needs HTTPS

Backend repo: `ai-oral-exam-api`. Design documents: `docs` repo.

> All screens of the approved wireframes are built. Sign-in is done by Keycloak (see **2.1**). Until the API is ready, everything else runs on a mock API, so the app works without the backend.

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 LTS or later | `node --version` |
| Keycloak (sign-in), from the backend repo `ai-oral-exam-api`, branch `refactor/database-schemas`: `docker compose up -d keycloak` | realm `aives` at `http://localhost:8080/realms/aives` | open http://localhost:8080/realms/aives/.well-known/openid-configuration |
| Backend `ai-oral-exam-api` (only with `VITE_USE_MOCKS=false`) | running at `http://localhost:5080` | open http://localhost:5080/health |

## 2. Running

```bash
npm install
npm run dev        # http://localhost:5173
```

### 2.1 With the mock API (default)

**Sign-in is always Keycloak** (OpenID Connect, Authorization Code flow with PKCE): the **Sign in** button opens Keycloak's own page, which also has *Forgot password*. There is no registration screen; self-registration is disabled in the realm. Start Keycloak first (see **1**). The dev server **must run on port 5173**: the realm only allows redirects to `http://localhost:5173/*` (`strictPort` is on, so Vite stops instead of picking another port).

Everything except sign-in is answered by `src/mocks/` when `VITE_USE_MOCKS` is `true` (the default), with sample data kept in the browser's memory: **reloading the page (F5) resets that data**, so click through the app instead of reloading while you test a flow. The Keycloak session itself survives a reload (it lives in the browser tab's `sessionStorage`).

**Demo users** (all use the password `Password@123`; the user name is the email):

| Email | Role | Mock user | Use it to test |
|---|---|---|---|
| `han.hg@aives.edu.vn` | Student | Hoang Gia Han | Take the exam: *My exams* shows a session **open now**, then the lobby (microphone check) and the exam room |
| `an.nv@aives.edu.vn` | Lecturer | Tran Thi Bich | Exam sessions (live counts), results, review and confirm scores, class statistics, session setup and publish |
| `admin@aives.edu.vn` | Administrator | Ngo Thanh Hoa | Users, courses, AI and speech settings, audit log |

The mock does not check the token. It reads the email from it and maps the three emails above to existing mock users (the table `KEYCLOAK_DEMO_USERS` in `src/mocks/server.js`). **This mapping is temporary:** remove it when the real API is connected, because the API verifies the Keycloak token itself. Any other Keycloak user signs in but gets "Your session has ended" from the mock.

Things to know while testing:

- The open session is timed from the moment the page loads (about 42 minutes left); each student has **one attempt**, so press F5 to try the exam again.
- Use **Chrome** for the exam room: it turns your speech into a live transcript. Other browsers show a box to type the answer instead. Allow the microphone when asked.
- After Han finishes, sign out and sign in as `an.nv@aives.edu.vn`: the attempt appears under *Results and review* for *Viva 1 (SE1835)*.
- *Account settings* keeps *Change username* (it talks to the mock). The password is managed on Keycloak's account page, which the *Manage password and sessions* link opens in a new tab.

**Keycloak settings** are the `VITE_OIDC_*` variables. They have defaults that match the realm above, so you only need them to point somewhere else. `.env.example` in the repo root lists all of them; copy it to `.env.local` (not committed) to change one:

| Variable | Default |
|---|---|
| `VITE_OIDC_AUTHORITY` | `http://localhost:8080/realms/aives` |
| `VITE_OIDC_CLIENT_ID` | `aives-web` (public client, no secret) |
| `VITE_OIDC_REDIRECT_URI` | `http://localhost:5173/auth/callback` |
| `VITE_OIDC_POST_LOGOUT_REDIRECT_URI` | `http://localhost:5173/sign-in` |
| `VITE_OIDC_SCOPE` | `openid profile email` |

The role comes from the `role` claim of the access token (string or array). A user with several roles gets the highest one: Administrator, then Lecturer, then Student.

### 2.2 With the real API

Create a `.env.local` file (do not commit it):

```
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:5080
```

The backend allows CORS from `http://localhost:5173` and `http://localhost:3000`. If you run on another port, add it to `Cors:AllowedOrigins` in the API.

Sign-in stays on Keycloak, and the API receives the Keycloak access token as `Authorization: Bearer`. **Test accounts:** the demo users in **2.1**; see also the "Sample data" table in the `ai-oral-exam-api` README. Use `han.hg@aives.edu.vn` to demo the interview flow.

## 3. Project structure

```
ai-oral-exam-web/
├── public/
└── src/
    ├── app/
    │   ├── layouts/        # shared layout + one layout per portal (FE-PLAT-01)
    │   └── routes/         # router, role-based route guards (FE-PLAT-03)
    ├── api/                # shared HTTP client, unified error handling (FE-PLAT-02); WebSocket client
    ├── components/         # shared UI
    ├── hooks/
    ├── utils/
    ├── mocks/              # mock data while the API is not ready
    ├── assets/
    ├── styles/
    └── features/
        ├── auth/           # F7 – sign-in with Keycloak (OIDC) and the signed-in user
        ├── account/        # F7 – Account Settings
        ├── interview/      # F3 – exam page, UI state machine, timer (FE-INT-*)
        ├── score-review/   # F3 – lecturer reads the transcript and confirms the final score
        ├── reporting/      # F6 – student report, class statistics, grade sheet export (FE-PLAT-04)
        ├── exam-config/    # F7 – exam sessions, questions, rubrics, student list, publish
        └── admin/          # F7 – accounts, courses, STT/TTS/LLM settings, audit log
```

Code for a feature lives in `features/<name>/`. Move something up to `components/`, `hooks/` or `utils/` only when two or more features use it.

## 4. Conventions

**Use the same names as the use cases / ERD / class diagram (FOUNDATION-01):**

- *Exam Session* (created by a lecturer) ≠ *Interview Attempt* (one student's attempt)
- *main question* ≠ *follow-up question*
- *answer analysis* ≠ *scoring*

**Error handling:** every API error has the same shape

```json
{ "code": "exam_session_not_open", "message": "...", "traceId": "...", "details": null }
```

Branch on `code`; show `message` to the user.

**Attempt status:** `InProgress → PendingReview → Finalized`. Each submitted answer returns an `outcome`: `FollowUp` | `NextQuestion` | `Completed`.

**Timer:** counts down in seconds for **each answer** (follow-up answers included). When time runs out the answer is submitted automatically; the next answer starts a fresh countdown.

**Scores:** the AI only *suggests* scores. Students can see their report only after the lecturer confirms the final score; until then it shows "waiting for review".

## 5. Roadmap (from the tracker)

- **M1:** sign in → exam page → create attempt → receive question → timer → type answer → show mock score
- **M2:** microphone, audio recording, TTS playback of questions, WebSocket
- **M3:** student report, lecturer review and final score, class statistics, grade sheet export
- **M4:** registration, Google SSO, set / reset password, account settings, exam session setup, admin screens
