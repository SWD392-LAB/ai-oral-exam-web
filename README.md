# ai-oral-exam-web

Frontend for **AIVES – AI-powered Viva Exam System** (SWD392). One React web app for all three roles: **Student**, **Lecturer** and **Administrator**, with shared sign-in, registration and account settings.

- **Stack:** React + Vite (responsive, works on tablets)
- **Backend communication:** REST for normal requests; **WebSocket** for the interview (the server pushes the next question or a follow-up)
- **Microphone:** browsers only allow microphone access on **HTTPS** pages (or `localhost`), so every deployed environment needs HTTPS

Backend repo: `ai-oral-exam-api`. Design documents: `docs` repo.

> The repo currently holds only the folder skeleton and has not been scaffolded yet. Empty folders contain a `.gitkeep`; delete it once the folder has real code.

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 LTS or later | `node --version` |
| Backend `ai-oral-exam-api` | running at `http://localhost:5080` | open http://localhost:5080/health |

## 2. Running

```bash
npm install
npm run dev        # http://localhost:5173
```

Create a `.env.local` file (do not commit it):

```
VITE_API_BASE_URL=http://localhost:5080
```

The backend allows CORS from `http://localhost:5173` and `http://localhost:3000`. If you run on another port, add it to `Cors:AllowedOrigins` in the API.

**Test accounts:** see the "Sample data" table in the `ai-oral-exam-api` README (shared password `Password@123`). Use `han.hg@aives.edu.vn` to demo the interview flow.

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
        ├── auth/           # F7 – sign-in, registration, Google SSO, forgot / set password
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
