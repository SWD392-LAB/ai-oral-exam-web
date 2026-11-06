# ai-oral-exam-web

Frontend for **AIVES – AI-powered Viva Exam System** (SWD392). One React web app for all three roles: **Student**, **Lecturer** and **Administrator**, with shared sign-in (done by Keycloak) and account settings.

- **Stack:** React + Vite (responsive, works on tablets)
- **Backend communication:** REST for normal requests; **WebSocket** for the interview (the server pushes the next question or a follow-up)
- **Microphone:** browsers only allow microphone access on **HTTPS** pages (or `localhost`), so every deployed environment needs HTTPS

Backend repo: `ai-oral-exam-api`. Design documents: `docs` repo.

> All screens of the approved wireframes are built. Sign-in is done by Keycloak in every mode (see **2.1** for how it works and **2.2** for the settings). Everything else calls the real API (`ai-oral-exam-api`) by default. A mock API (`VITE_USE_MOCKS=true`) is still available for screens whose API is not ready yet (the student exam screens, Feature 3).

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 LTS or later | `node --version` |
| Keycloak (sign-in), from the backend repo `ai-oral-exam-api`, branch `refactor/database-schemas`: `docker compose up -d keycloak` | realm `aives` at `http://localhost:8080/realms/aives` | open http://localhost:8080/realms/aives/.well-known/openid-configuration |
| Backend `ai-oral-exam-api` (needed by default; not needed with `VITE_USE_MOCKS=true`) | running at `http://localhost:5080` | open http://localhost:5080/health |

## 2. Running

```bash
npm install
npm run dev        # http://localhost:5173
```

### 2.1 With the mock API (optional)

**Sign-in is always Keycloak** (OpenID Connect, Authorization Code flow with PKCE): the **Sign in** button opens Keycloak's own page, which also has *Forgot password*. There is no registration screen; self-registration is disabled in the realm. Start Keycloak first (see **1**). The dev server **must run on port 5173**: the realm only allows redirects to `http://localhost:5173/*` (`strictPort` is on, so Vite stops instead of picking another port).

With `VITE_USE_MOCKS=true` in `.env.local`, everything except sign-in is answered by `src/mocks/`, with sample data kept in the browser's memory: **reloading the page (F5) resets that data**, so click through the app instead of reloading while you test a flow. The Keycloak session itself survives a reload (it lives in the browser tab's `sessionStorage`).

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

### 2.2 With the real API (default)

This is the default: `VITE_USE_MOCKS` is `false` unless you set it to `true`, and every setting below has this value as its default, so `.env.local` is only needed to change one. To set them explicitly, create a `.env.local` file in the project root (you can copy `.env.example`):

```env
VITE_API_BASE_URL=http://localhost:5080
VITE_USE_MOCKS=false
VITE_OIDC_AUTHORITY=http://localhost:8080/realms/aives
VITE_OIDC_CLIENT_ID=aives-web
VITE_OIDC_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:5173/sign-in
VITE_OIDC_SCOPE=openid profile email
```

Ensure Keycloak (`http://localhost:8080`) and Backend API (`http://localhost:5080`) are running, then run `npm run dev`.

#### Connected Features & Seed Data Testing:

1. **Lecturer (`an.nv@aives.edu.vn` / `Password@123`):**
   - **Exam Sessions & Courses (Feature 7):** Open `/lecturer/sessions` to view the course dropdown (`SWD392`) and session list.
   - **Class Results & CSV Export (Feature 6):** Open `/lecturer/sessions/33333333-0000-0000-0000-000000000001/results` to view student grades. Click *Export grade sheet* to download the live UTF-8 BOM CSV.
   - **Class Statistics (Feature 6):** Open `/lecturer/statistics?session=33333333-0000-0000-0000-000000000001` to view the 10-bin score distribution chart and question difficulty analysis.
   - **Review & Confirm Score (Feature 6):** Open `/lecturer/attempts/66666666-0000-0000-0000-000000000008/review` to inspect student answers, adjust suggestions, and confirm the final score on dynamic exam scales.

2. **Student with Finalized Score (`chau.lm@aives.edu.vn` / `Password@123`):**
   - **Student Report (Feature 6):** Open `/student/attempts/66666666-0000-0000-0000-000000000001/report` to view confirmed score, lecturer comments, full question-by-question dialogue turns, and audio player waveform.

3. **Student with Pending Review (`dung.pq@aives.edu.vn` / `Password@123`):**
   - **Pending Report (Feature 6):** Open `/student/attempts/66666666-0000-0000-0000-000000000002/report` to observe the graceful "Waiting for review" banner and checklist milestones.

> **Note on Feature 3 (Student Exam Room):** The student home page (`/student`), lobby, and live oral interview room belong to Feature 3 (AI Viva Interview), which is scheduled after Phase 1 and not yet available on the real backend API. To test the student exam room and speech simulation, set `VITE_USE_MOCKS=true` in `.env.local`.

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
