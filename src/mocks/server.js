// Mock API: answers request() calls with the same URLs, shapes and error codes the real API will use.
import { ApiError } from '../api/client.js'
import { sessionPhase } from '../utils/enums.js'
import { addAttempt, addUser, db, generateResponses, PASSWORD, rand, splitScore } from './db.js'

const LATENCY = [180, 520]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (code, message, status = 400, details = null) => { throw new ApiError({ code, message, traceId: 'mock-' + Date.now().toString(36), details }, status) }
const nowIso = () => new Date().toISOString()
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)))

const userById = (id) => db.users.find((u) => u.id === id)
const sessionById = (id) => db.sessions.find((s) => s.id === id) ?? fail('exam_session_not_found', 'This exam session does not exist.', 404)
const attemptById = (id) => db.attempts.find((a) => a.id === id) ?? fail('attempt_not_found', 'This attempt does not exist.', 404)
const courseById = (id) => db.courses.find((c) => c.id === id)

const publicUser = (u) => u && ({
  id: u.id, fullName: u.fullName, username: u.username, accountName: u.accountName, email: u.email, role: u.role,
  studentCode: u.studentCode, classCode: u.classCode, active: u.active, emailVerified: u.emailVerified,
  googleLinked: u.googleLinked, hasPassword: u.hasPassword, setupSentAt: u.setupSentAt, createdAt: u.createdAt,
})

const audit = (actorId, entry) => db.auditLog.unshift({ id: 'e' + (db.auditLog.length + 100), at: nowIso(), actorId, ...entry })

// ---------- live simulation of the open session (other students starting and finishing) ----------
const SIM_EVERY = 8000
let simTicks = 0
function simulate() {
  const due = Math.floor((Date.now() - db.loadedAt) / SIM_EVERY)
  while (simTicks < due) {
    simTicks += 1
    const open = db.sessions.filter((s) => sessionPhase(s) === 'Open now')
    for (const s of open) {
      const mine = db.attempts.filter((a) => a.sessionId === s.id)
      const running = mine.filter((a) => a.status === 'InProgress' && a.simulated)
      const notStarted = s.participants.filter((id) => id !== 'han' && !mine.some((a) => a.studentId === id))
      if (simTicks % 2 === 1 && notStarted.length) {
        addAttempt({ sessionId: s.id, studentId: notStarted[0], status: 'InProgress', startedAt: nowIso(), endedAt: null, endReason: null, responses: [], simulated: true })
      } else if (running.length) {
        const a = running[0]
        const ai = 4 + Math.round(rand(simTicks) * 10) / 2
        Object.assign(a, { status: 'PendingReview', endedAt: nowIso(), endReason: 'Completed', responses: generateResponses(s.questions, splitScore(ai, s.questions.length, simTicks * 3), simTicks), simulated: false, justFinished: true })
      }
    }
  }
  closeDueAttempts()
}

// When a window ends, attempts still in progress stop at once (unanswered questions count as 0)
function closeDueAttempts() {
  for (const a of db.attempts) {
    if (a.status !== 'InProgress') continue
    const s = sessionById(a.sessionId)
    if (sessionPhase(s) === 'Closed') finishAttempt(a, 'SessionClosed', s.endAt)
  }
}

// ---------- scoring helpers ----------
const aiTotal = (a) => (a.responses ?? []).reduce((sum, r) => sum + (r?.ai?.score ?? 0), 0)
const finalOf = (a) => (a.status === 'Finalized' ? a.review?.finalScore ?? null : null)

function scoreAnswer(question, turns) {
  const words = turns.reduce((n, t) => n + (t.answer ? t.answer.trim().split(/\s+/).filter(Boolean).length : 0), 0)
  const max = question.rubric?.maxScore ?? 2.5
  const score = Math.min(max, Math.round((words / 45) * max * 2) / 2)
  const comment = score >= 2 ? 'Covers the main points of the rubric with a clear explanation.' : score >= 1 ? 'Partly answers the question; some points in the rubric are missing.' : 'Too short to show the points the rubric asks for.'
  return { score, comment }
}

function finishAttempt(a, reason, endedAt = nowIso()) {
  const s = sessionById(a.sessionId)
  if (a.current) {
    const r = a.responses[a.current.qIndex]
    if (r && !r.ai) r.ai = scoreAnswer(s.questions[a.current.qIndex], r.turns)
  }
  a.status = 'PendingReview'
  a.endedAt = endedAt
  a.endReason = reason
  a.current = null
}

// ---------- shapes ----------
function sessionCounts(s) {
  const mine = db.attempts.filter((a) => a.sessionId === s.id)
  return {
    students: s.participants.length,
    taken: mine.length,
    toReview: mine.filter((a) => a.status === 'PendingReview').length,
    answering: mine.filter((a) => a.status === 'InProgress').length,
    confirmed: mine.filter((a) => a.status === 'Finalized').length,
  }
}

const sessionSummary = (s) => {
  const c = courseById(s.courseId)
  return {
    id: s.id, title: s.title, classCode: s.classCode, courseId: s.courseId, courseCode: c.code, courseName: c.name,
    startAt: s.startAt, endAt: s.endAt, status: s.status, phase: sessionPhase(s),
    timeLimitSeconds: s.timeLimitSeconds, maxFollowUps: s.maxFollowUps, questionCount: s.questions.length,
    ...sessionCounts(s),
  }
}

const publishCheck = (s) => ({
  hasQuestion: s.questions.length > 0,
  missingRubrics: s.questions.filter((q) => !q.rubric?.criteria).map((q) => q.id),
  hasStudent: s.participants.length > 0,
  hasWindow: !!(s.startAt && s.endAt),
})

const sessionDetail = (s) => ({
  ...sessionSummary(s),
  questions: s.questions.map((q) => ({ id: q.id, text: q.text, short: q.short, rubric: q.rubric })),
  participants: s.participants.map((id) => { const u = userById(id); return { userId: id, fullName: u.fullName, studentCode: u.studentCode, email: u.email } }),
  skippedRows: s.skippedRows ?? [],
  publishCheck: publishCheck(s),
  publishedAt: s.publishedAt,
})

// what the exam room needs to know right now
function attemptState(a) {
  const s = sessionById(a.sessionId)
  const base = {
    attemptId: a.id, status: a.status, endReason: a.endReason, startedAt: a.startedAt, endedAt: a.endedAt,
    session: { id: s.id, title: s.title, courseCode: courseById(s.courseId).code, classCode: s.classCode, endAt: s.endAt, timeLimitSeconds: s.timeLimitSeconds, maxFollowUps: s.maxFollowUps, questionCount: s.questions.length },
    answered: a.responses.map((r, i) => ({ index: i, reached: !!r, turns: r ? r.turns.map((t) => ({ type: t.type, durationSeconds: t.dur })) : [] })),
    current: null,
  }
  if (a.current) {
    const qq = s.questions[a.current.qIndex]
    const fu = a.current.followUps
    base.current = {
      questionIndex: a.current.qIndex, questionId: qq.id, type: fu ? 'FollowUp' : 'Main', followUpNumber: fu,
      text: fu ? qq.followUps[fu - 1] : qq.text, mainText: qq.text, short: qq.short, askedAt: a.current.askedAt,
    }
  }
  return base
}

const turnsOut = (r) => r.turns.map((t) => ({ type: t.type, questionText: t.question, answerText: t.answer, durationSeconds: t.dur, audioUrl: null }))

function attemptForReview(a) {
  const s = sessionById(a.sessionId)
  const u = userById(a.studentId)
  return {
    id: a.id, status: a.status, endReason: a.endReason, startedAt: a.startedAt, endedAt: a.endedAt,
    student: { id: u.id, fullName: u.fullName, studentCode: u.studentCode },
    session: { id: s.id, title: s.title, classCode: s.classCode, courseCode: courseById(s.courseId).code, timeLimitSeconds: s.timeLimitSeconds, endAt: s.endAt },
    questions: s.questions.map((qq, i) => {
      const r = a.responses[i]
      return { index: i, text: qq.text, maxScore: qq.rubric?.maxScore ?? 2.5, reached: !!r, ai: r?.ai ?? { score: 0, comment: 'Not reached. The session closed before this question was asked.' }, turns: r ? turnsOut(r) : [] }
    }),
    aiTotal: aiTotal(a),
    review: a.review,
  }
}

// ---------- auth ----------
const session = { userId: null }
const me = (token) => {
  const id = token?.startsWith('mock.') ? token.slice(5) : null
  const u = id && userById(id)
  if (!u || !u.active) fail('unauthorized', 'Your session has ended. Sign in again.', 401)
  return u
}
const requireRole = (u, ...roles) => { if (!roles.includes(u.role)) fail('forbidden', 'You do not have access to this page.', 403) }

const issue = (u) => { session.userId = u.id; return { accessToken: 'mock.' + u.id, user: publicUser(u) } }

// ---------- routes ----------
const routes = []
const route = (method, pattern, handler) => {
  const keys = []
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '$')
  routes.push({ method, re, keys, handler })
}

route('POST', '/api/auth/login', ({ body }) => {
  const login = (body?.login ?? '').trim().toLowerCase()
  const u = db.users.find((x) => x.email.toLowerCase() === login || x.accountName?.toLowerCase() === login)
  if (!u || !u.hasPassword || body?.password !== PASSWORD) fail('invalid_credentials', 'That account name, email or password is not right.', 401)
  if (!u.active) fail('account_deactivated', 'This account is deactivated.', 403)
  if (!u.emailVerified) fail('email_not_verified', 'Confirm your email first. Use the link we sent you.', 403)
  return issue(u)
})

// Without a real Google client, the mock signs in as one Google identity: the first time creates the account
const GOOGLE = { email: 'minh.tran@example.com', name: 'Tran Nhat Minh' }
route('POST', '/api/auth/google', () => {
  let u = db.users.find((x) => x.email === GOOGLE.email)
  let firstSignIn = false
  if (u && !u.googleLinked) fail('google_not_linked', 'This Google email belongs to an AIVES account that is not linked to Google.', 409)
  if (u && !u.active) fail('account_deactivated', 'This account is deactivated.', 403)
  if (!u) {
    u = addUser({ fullName: GOOGLE.name, username: GOOGLE.email.split('@')[0], email: GOOGLE.email, googleLinked: true, hasPassword: false })
    firstSignIn = true
  }
  return { ...issue(u), firstSignIn }
})

route('POST', '/api/auth/logout', () => { session.userId = null; return null })
route('GET', '/api/auth/me', ({ user }) => publicUser(user))

route('GET', '/api/auth/account-names/:name', ({ params }) => {
  const name = decodeURIComponent(params.name).toLowerCase()
  const taken = ['minhanh', 'anh.nguyen', 'admin', 'minhanh.se17'].includes(name) || db.users.some((u) => u.accountName?.toLowerCase() === name)
  let suggestion = null
  if (taken) { for (let i = 18; !suggestion; i++) { const c = `${name.replace(/\.se\d+$/, '')}.se${i}`; if (!db.users.some((u) => u.accountName === c)) suggestion = c } }
  return { available: !taken, suggestion }
})

route('POST', '/api/auth/register', ({ body }) => {
  const accountName = (body?.accountName ?? '').trim()
  const email = (body?.email ?? '').trim().toLowerCase()
  if (db.users.some((u) => u.accountName?.toLowerCase() === accountName.toLowerCase())) fail('account_name_taken', 'That account name is taken.', 409)
  if (db.users.some((u) => u.email === email)) fail('email_taken', 'An account with this email already exists. Sign in, or use Forgot password.', 409)
  const u = addUser({ fullName: accountName, username: accountName, accountName, email, emailVerified: false })
  db.emailLinks['verify-' + u.id] = { purpose: 'EmailVerification', userId: u.id, expiresAt: new Date(Date.now() + 864e5).toISOString(), usedAt: null }
  return { email, verifyToken: 'verify-' + u.id }
})

// Same answer whether or not the email is registered
route('POST', '/api/auth/forgot-password', ({ body }) => {
  const u = db.users.find((x) => x.email === (body?.email ?? '').trim().toLowerCase() && x.active)
  if (!u) return { demoToken: null }
  db.emailLinks['reset-' + u.id] = { purpose: u.hasPassword ? 'PasswordReset' : 'AccountSetup', userId: u.id, expiresAt: new Date(Date.now() + 36e5).toISOString(), usedAt: null }
  // mock only: lets the demo open the link that would have been emailed
  return { demoToken: 'reset-' + u.id }
})

const linkOf = (token) => {
  const l = db.emailLinks[token]
  if (!l || l.usedAt || new Date(l.expiresAt) < new Date()) fail('link_invalid', 'This link no longer works.', 410)
  return l
}
route('GET', '/api/email-links/:token', ({ params }) => {
  const l = linkOf(params.token)
  const u = userById(l.userId)
  if (l.purpose === 'EmailVerification') { u.emailVerified = true; l.usedAt = nowIso() }
  return { purpose: l.purpose, email: u.email, needsAccountName: l.purpose === 'AccountSetup' && !u.accountName, accountName: u.accountName, fullName: u.fullName }
})
route('POST', '/api/email-links/:token', ({ params, body }) => {
  const l = linkOf(params.token)
  const u = userById(l.userId)
  if (l.purpose === 'AccountSetup' && !u.accountName) {
    const name = (body?.accountName ?? '').trim()
    if (!name) fail('account_name_required', 'Choose an account name.')
    if (db.users.some((x) => x.accountName?.toLowerCase() === name.toLowerCase())) fail('account_name_taken', 'That account name is taken.', 409)
    u.accountName = name
  }
  u.hasPassword = true
  u.emailVerified = true
  l.usedAt = nowIso()
  return { purpose: l.purpose, accountName: u.accountName, email: u.email }
})

// ---------- account ----------
route('GET', '/api/account', ({ user }) => publicUser(user))
route('PATCH', '/api/account', ({ user, body }) => {
  const name = (body?.username ?? '').trim()
  if (!name) fail('username_required', 'Enter a username.')
  if (name.length > 40) fail('username_too_long', 'Use 40 characters or fewer.')
  user.username = name
  return publicUser(user)
})
route('POST', '/api/account/setup-link', ({ user }) => {
  db.emailLinks['setup-' + user.id] = { purpose: 'AccountSetup', userId: user.id, expiresAt: new Date(Date.now() + 864e5).toISOString(), usedAt: null }
  user.setupSentAt = nowIso()
  return { sentTo: user.email }
})
route('POST', '/api/account/google-link', ({ user }) => { user.googleLinked = true; return publicUser(user) })

// ---------- student ----------
route('GET', '/api/student/exam-sessions', ({ user }) => {
  requireRole(user, 'Student')
  return db.sessions
    .filter((s) => s.status === 'Published' && s.participants.includes(user.id))
    .map((s) => {
      const a = db.attempts.find((x) => x.sessionId === s.id && x.studentId === user.id)
      return {
        ...sessionSummary(s),
        attempt: a ? { id: a.id, status: a.status, endReason: a.endReason, startedAt: a.startedAt, endedAt: a.endedAt, finalScore: finalOf(a), answeredCount: a.responses.filter(Boolean).length } : null,
      }
    })
})
route('GET', '/api/student/exam-sessions/:id', ({ user, params }) => {
  requireRole(user, 'Student')
  const s = sessionById(params.id)
  if (!s.participants.includes(user.id)) fail('not_on_participant_list', 'You are not on the student list for this session.', 403)
  const a = db.attempts.find((x) => x.sessionId === s.id && x.studentId === user.id)
  return { ...sessionSummary(s), attempt: a ? { id: a.id, status: a.status } : null }
})

route('POST', '/api/interview-attempts', ({ user, body }) => {
  requireRole(user, 'Student')
  const s = sessionById(body?.examSessionId)
  if (!s.participants.includes(user.id)) fail('not_on_participant_list', 'You are not on the student list for this session.', 403)
  const phase = sessionPhase(s)
  if (phase !== 'Open now') fail('exam_session_not_open', phase === 'Closed' ? 'This session has closed.' : 'This session is not open yet.', 409)
  if (db.attempts.some((x) => x.sessionId === s.id && x.studentId === user.id)) fail('attempt_already_taken', 'You have already used your one attempt for this session.', 409)
  const a = addAttempt({ sessionId: s.id, studentId: user.id, status: 'InProgress', startedAt: nowIso(), endedAt: null, endReason: null, responses: [], current: { qIndex: 0, followUps: 0, askedAt: nowIso() } })
  a.responses[0] = { questionId: s.questions[0].id, turns: [], ai: null }
  return attemptState(a)
})

route('GET', '/api/interview-attempts/:id', ({ user, params }) => {
  const a = attemptById(params.id)
  if (a.studentId !== user.id) fail('forbidden', 'This is not your attempt.', 403)
  return attemptState(a)
})

// The core of the exam: save the answer, then the "AI" decides follow-up, next question or done
route('POST', '/api/interview-attempts/:id/responses', ({ user, params, body }) => {
  const a = attemptById(params.id)
  if (a.studentId !== user.id) fail('forbidden', 'This is not your attempt.', 403)
  if (a.status !== 'InProgress') fail('attempt_not_in_progress', 'This attempt has ended.', 409)
  const s = sessionById(a.sessionId)
  const cur = a.current
  const qq = s.questions[cur.qIndex]
  const answer = String(body?.answerText ?? '').trim()
  const dur = Math.max(0, Math.min(s.timeLimitSeconds, Math.round(body?.durationSeconds ?? 0)))
  const r = a.responses[cur.qIndex]
  r.turns.push({ type: cur.followUps ? 'FollowUp' : 'Main', question: cur.followUps ? qq.followUps[cur.followUps - 1] : qq.text, answer, dur, at: nowIso() })

  if (sessionPhase(s) === 'Closed') { finishAttempt(a, 'SessionClosed', s.endAt); return { outcome: 'Completed', state: attemptState(a) } }

  const words = answer.split(/\s+/).filter(Boolean).length
  const sufficient = words >= 25 || cur.followUps >= s.maxFollowUps || cur.followUps >= (qq.followUps?.length ?? 0)
  if (!sufficient) {
    a.current = { qIndex: cur.qIndex, followUps: cur.followUps + 1, askedAt: nowIso() }
    return { outcome: 'FollowUp', state: attemptState(a) }
  }
  r.ai = scoreAnswer(qq, r.turns)
  if (cur.qIndex + 1 < s.questions.length) {
    a.current = { qIndex: cur.qIndex + 1, followUps: 0, askedAt: nowIso() }
    a.responses[cur.qIndex + 1] = { questionId: s.questions[cur.qIndex + 1].id, turns: [], ai: null }
    return { outcome: 'NextQuestion', state: attemptState(a) }
  }
  finishAttempt(a, 'Completed')
  return { outcome: 'Completed', state: attemptState(a) }
})

route('GET', '/api/interview-attempts/:id/report', ({ user, params }) => {
  const a = attemptById(params.id)
  if (a.studentId !== user.id) fail('forbidden', 'This is not your attempt.', 403)
  const s = sessionById(a.sessionId)
  const base = { id: a.id, status: a.status, session: { title: s.title, courseCode: courseById(s.courseId).code, classCode: s.classCode }, startedAt: a.startedAt, endedAt: a.endedAt }
  if (a.status !== 'Finalized') return base
  const full = attemptForReview(a)
  return { ...base, questions: full.questions, aiTotal: full.aiTotal, review: { ...a.review, reviewerName: userById(a.review.reviewerId)?.fullName } }
})

// ---------- lecturer ----------
const lecturerCourses = (u) => db.courses.filter((c) => u.role === 'Administrator' || c.lecturerIds.includes(u.id))
const canSee = (u, s) => lecturerCourses(u).some((c) => c.id === s.courseId)

route('GET', '/api/lecturer/courses', ({ user }) => { requireRole(user, 'Lecturer'); return lecturerCourses(user).map((c) => ({ id: c.id, code: c.code, name: c.name })) })

route('GET', '/api/exam-sessions', ({ user }) => {
  requireRole(user, 'Lecturer')
  return db.sessions.filter((s) => canSee(user, s)).map((s) => {
    const sum = sessionSummary(s)
    const fresh = db.attempts.filter((a) => a.sessionId === s.id && a.justFinished)
    fresh.forEach((a) => { a.justFinished = false })
    return sum
  })
})

route('POST', '/api/exam-sessions', ({ user, body }) => {
  requireRole(user, 'Lecturer')
  const s = { id: 's' + Date.now().toString(36), title: body?.title || 'Untitled session', classCode: body?.classCode || null, courseId: body?.courseId || lecturerCourses(user)[0]?.id, status: 'Draft', startAt: null, endAt: null, timeLimitSeconds: 90, maxFollowUps: 2, questions: [], participants: [], createdBy: user.id, publishedAt: null }
  db.sessions.push(s)
  return sessionDetail(s)
})

const ownSession = (user, id) => {
  requireRole(user, 'Lecturer')
  const s = sessionById(id)
  if (!canSee(user, s)) fail('forbidden', 'This session belongs to a course you are not assigned to.', 403)
  return s
}

route('GET', '/api/exam-sessions/:id', ({ user, params }) => sessionDetail(ownSession(user, params.id)))

route('PUT', '/api/exam-sessions/:id', ({ user, params, body }) => {
  const s = ownSession(user, params.id)
  if (s.status !== 'Draft') fail('exam_session_locked', 'A published session cannot be changed.', 409)
  const { title, classCode, courseId, startAt, endAt, timeLimitSeconds, maxFollowUps } = body ?? {}
  Object.assign(s, Object.fromEntries(Object.entries({ title, classCode, courseId, startAt, endAt, timeLimitSeconds, maxFollowUps }).filter(([, v]) => v !== undefined)))
  return sessionDetail(s)
})

// The real API takes the file itself; the mock reads the question texts the page sends
route('POST', '/api/exam-sessions/:id/questions/import', ({ user, params, body }) => {
  const s = ownSession(user, params.id)
  if (s.status !== 'Draft') fail('exam_session_locked', 'A published session cannot be changed.', 409)
  const texts = (body?.questions ?? []).map((t) => String(t).trim()).filter(Boolean)
  if (!texts.length) fail('question_file_empty', 'The file has no questions.')
  texts.forEach((text, i) => s.questions.push({ id: `${s.id}q${s.questions.length + i + 1}`, text, short: text, rubric: null, followUps: [], bank: null }))
  return sessionDetail(s)
})

route('PUT', '/api/exam-sessions/:id/questions/:qid/rubric', ({ user, params, body }) => {
  const s = ownSession(user, params.id)
  if (s.status !== 'Draft') fail('exam_session_locked', 'Questions and rubrics are locked once a session is published.', 409)
  const qq = s.questions.find((x) => x.id === params.qid) ?? fail('question_not_found', 'This question does not exist.', 404)
  const criteria = String(body?.criteria ?? '').trim()
  const maxScore = Number(body?.maxScore)
  if (!criteria) fail('rubric_required', 'Write what a full score needs.')
  if (!(maxScore > 0 && maxScore <= 10)) fail('rubric_max_invalid', 'Use a maximum score between 0 and 10.')
  qq.rubric = { criteria, maxScore }
  return sessionDetail(s)
})

route('DELETE', '/api/exam-sessions/:id/questions/:qid', ({ user, params }) => {
  const s = ownSession(user, params.id)
  if (s.status !== 'Draft') fail('exam_session_locked', 'A published session cannot be changed.', 409)
  s.questions = s.questions.filter((x) => x.id !== params.qid)
  return sessionDetail(s)
})

// rows: [{ studentCode, name, email }]; rows that match no account are skipped and reported
route('POST', '/api/exam-sessions/:id/participants/import', ({ user, params, body }) => {
  const s = ownSession(user, params.id)
  if (s.status !== 'Draft') fail('exam_session_locked', 'A published session cannot be changed.', 409)
  const matched = [], skipped = []
  for (const row of body?.rows ?? []) {
    const u = db.users.find((x) => x.role === 'Student' && ((row.studentCode && x.studentCode === row.studentCode) || (row.email && x.email === row.email?.toLowerCase())))
    if (u) { if (!matched.includes(u.id)) matched.push(u.id) } else skipped.push({ row: row.row, fullName: row.name ?? '', studentCode: row.studentCode ?? '', reason: row.studentCode || row.email ? 'No account matches' : 'No student code or email' })
  }
  s.participants = matched
  s.skippedRows = skipped
  return { ...sessionDetail(s), matchedCount: matched.length, skippedCount: skipped.length }
})

route('POST', '/api/exam-sessions/:id/publish', ({ user, params }) => {
  const s = ownSession(user, params.id)
  const c = publishCheck(s)
  if (!c.hasQuestion || c.missingRubrics.length || !c.hasStudent || !c.hasWindow) fail('exam_session_not_ready', 'This session is not ready to publish.', 409, c)
  s.status = 'Published'
  s.publishedAt = nowIso()
  return sessionDetail(s)
})

route('GET', '/api/exam-sessions/:id/results', ({ user, params }) => {
  const s = ownSession(user, params.id)
  const rows = s.participants.map((id) => {
    const u = userById(id)
    const a = db.attempts.find((x) => x.sessionId === s.id && x.studentId === id)
    const reached = a ? a.responses.filter(Boolean).length : 0
    return {
      studentId: id, fullName: u.fullName, studentCode: u.studentCode,
      attemptId: a?.id ?? null, status: a?.status ?? 'NoAttempt', endReason: a?.endReason ?? null,
      endedAt: a?.endedAt ?? null, aiTotal: a && a.status !== 'InProgress' ? aiTotal(a) : null,
      finalScore: a ? finalOf(a) : null, reached, questionCount: s.questions.length,
    }
  })
  return { session: sessionSummary(s), rows }
})

route('GET', '/api/interview-attempts/:id/review', ({ user, params }) => {
  requireRole(user, 'Lecturer')
  const a = attemptById(params.id)
  ownSession(user, a.sessionId)
  const next = db.attempts
    .filter((x) => x.sessionId === a.sessionId && x.status === 'PendingReview' && x.id !== a.id)
    .sort((x, y) => new Date(x.endedAt) - new Date(y.endedAt))[0]
  return { ...attemptForReview(a), next: next ? { id: next.id, fullName: userById(next.studentId).fullName, endReason: next.endReason, endedAt: next.endedAt } : null }
})

route('PUT', '/api/interview-attempts/:id/score-review', ({ user, params, body }) => {
  requireRole(user, 'Lecturer')
  const a = attemptById(params.id)
  ownSession(user, a.sessionId)
  if (a.status === 'InProgress') fail('attempt_not_finished', 'This attempt is still in progress.', 409)
  const v = Number(body?.finalScore)
  if (!(v >= 0 && v <= 10) || Math.abs(v * 4 - Math.round(v * 4)) > 1e-9) fail('final_score_invalid', 'Use a score from 0 to 10 in steps of 0.25.')
  a.review = { finalScore: v, comment: String(body?.comment ?? '').trim(), confirmedAt: nowIso(), reviewerId: user.id }
  a.status = 'Finalized'
  return attemptForReview(a)
})

route('GET', '/api/exam-sessions/:id/statistics', ({ user, params }) => {
  const s = ownSession(user, params.id)
  const mine = db.attempts.filter((a) => a.sessionId === s.id)
  const done = mine.filter((a) => a.status === 'Finalized')
  const counts = Array(10).fill(0)
  done.forEach((a) => { counts[Math.min(9, Math.floor(a.review.finalScore))] += 1 })
  const questions = s.questions.map((qq, i) => {
    const scores = done.map((a) => a.responses[i]?.ai?.score ?? 0)
    const avg = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : 0
    return { order: i + 1, text: qq.short ?? qq.text, avg, good: scores.filter((x) => x >= 2.0).length, maxScore: qq.rubric?.maxScore ?? 2.5 }
  })
  return { session: sessionSummary(s), counts, confirmed: done.length, waiting: mine.filter((a) => a.status === 'PendingReview').length, rows: s.participants.length, questions }
})

route('POST', '/api/exam-sessions/:id/grade-sheet', ({ user, params }) => {
  const s = ownSession(user, params.id)
  const mine = db.attempts.filter((a) => a.sessionId === s.id)
  const confirmed = mine.filter((a) => a.status === 'Finalized').length
  return { fileName: `${courseById(s.courseId).code}_${s.classCode ?? 'all'}_${s.title.split(':')[0].replace(/\s+/g, '')}_grades`, rows: s.participants.length, confirmed, pending: s.participants.length - confirmed }
})

// ---------- admin ----------
const adminOnly = (u) => requireRole(u, 'Administrator')

route('GET', '/api/admin/users', ({ user }) => { adminOnly(user); return db.users.map(publicUser) })
route('POST', '/api/admin/users', ({ user, body }) => {
  adminOnly(user)
  const email = String(body?.email ?? '').trim().toLowerCase()
  if (db.users.some((u) => u.email === email)) fail('email_taken', 'An account with this email already exists.', 409)
  const u = addUser({ fullName: String(body?.fullName ?? '').trim(), email, role: body?.role ?? 'Student', hasPassword: false, emailVerified: false, setupSentAt: nowIso(), createdAt: nowIso() })
  audit(user.id, { action: 'Account created', cat: 'created', target: u.fullName, kind: 'user', details: `${u.role} · setup link sent to ${u.email}` })
  return publicUser(u)
})
route('PATCH', '/api/admin/users/:id/role', ({ user, params, body }) => {
  adminOnly(user)
  const u = userById(params.id) ?? fail('user_not_found', 'This user does not exist.', 404)
  if (u.id === user.id) fail('cannot_change_own_role', 'You cannot change your own role.', 409)
  const from = u.role
  u.role = body?.role
  audit(user.id, { action: 'Role changed', cat: 'role', target: u.fullName, kind: 'user', details: `${from} to ${u.role}` })
  return publicUser(u)
})
route('POST', '/api/admin/users/:id/deactivate', ({ user, params }) => {
  adminOnly(user)
  const u = userById(params.id) ?? fail('user_not_found', 'This user does not exist.', 404)
  if (u.id === user.id) fail('cannot_deactivate_self', 'You cannot deactivate your own account.', 409)
  u.active = false
  audit(user.id, { action: 'Account deactivated', cat: 'deact', target: u.fullName, kind: 'user', details: `${u.role} account`, danger: true })
  return publicUser(u)
})
route('POST', '/api/admin/users/:id/setup-link', ({ user, params }) => {
  adminOnly(user)
  const u = userById(params.id) ?? fail('user_not_found', 'This user does not exist.', 404)
  u.setupSentAt = nowIso()
  return publicUser(u)
})

const courseOut = (c) => ({ ...c, lecturers: c.lecturerIds.map((id) => ({ id, fullName: userById(id).fullName, email: userById(id).email })), sessions: db.sessions.filter((s) => s.courseId === c.id).length })
route('GET', '/api/admin/courses', ({ user }) => { adminOnly(user); return db.courses.map(courseOut) })
route('POST', '/api/admin/courses', ({ user, body }) => {
  adminOnly(user)
  const code = String(body?.code ?? '').trim().toUpperCase()
  if (db.courses.some((c) => c.code === code)) fail('course_code_taken', 'A course with this code already exists.', 409)
  const c = { id: code.toLowerCase(), code, name: String(body?.name ?? '').trim(), lecturerIds: body?.lecturerIds ?? [] }
  db.courses.push(c)
  audit(user.id, { action: 'Course created', cat: 'course', target: c.code, kind: 'course', details: c.name })
  return courseOut(c)
})
route('PUT', '/api/admin/courses/:id', ({ user, params, body }) => {
  adminOnly(user)
  const c = courseById(params.id) ?? fail('course_not_found', 'This course does not exist.', 404)
  const before = c.lecturerIds.slice()
  const code = String(body?.code ?? c.code).trim().toUpperCase()
  if (code !== c.code && db.courses.some((x) => x.code === code)) fail('course_code_taken', 'A course with this code already exists.', 409)
  const renamed = code !== c.code || (body?.name ?? c.name) !== c.name
  Object.assign(c, { code, name: String(body?.name ?? c.name).trim(), lecturerIds: body?.lecturerIds ?? c.lecturerIds })
  if (renamed) audit(user.id, { action: 'Course edited', cat: 'course', target: c.code, kind: 'course', details: 'Name changed' })
  c.lecturerIds.filter((id) => !before.includes(id)).forEach((id) => audit(user.id, { action: 'Lecturer assigned', cat: 'assign', target: c.code, kind: 'course', details: `${userById(id).fullName} added` }))
  before.filter((id) => !c.lecturerIds.includes(id)).forEach((id) => audit(user.id, { action: 'Lecturer removed', cat: 'assign', target: c.code, kind: 'course', details: `${userById(id).fullName} removed` }))
  return courseOut(c)
})

const aiOut = () => ({ ...clone(db.aiSettings), savedByName: userById(db.aiSettings.savedBy)?.fullName ?? '' })
route('GET', '/api/admin/ai-settings', ({ user }) => { adminOnly(user); return aiOut() })
route('PUT', '/api/admin/ai-settings', ({ user, body }) => {
  adminOnly(user)
  const before = db.aiSettings.language
  if (body?.language && body.language !== before) audit(user.id, { action: 'Speech language changed', cat: 'lang', target: 'STT and TTS', kind: 'ai', details: `${before === 'vi' ? 'Vietnamese' : 'English'} to ${body.language === 'vi' ? 'Vietnamese' : 'English'}` })
  for (const k of ['stt', 'tts', 'llm']) {
    const p = body?.providers?.[k]
    if (!p) continue
    const cur = db.aiSettings.providers[k]
    if (p.key) audit(user.id, { action: 'AI provider changed', cat: 'ai', target: { stt: 'Speech-to-text (STT)', tts: 'Text-to-speech (TTS)', llm: 'Language model' }[k], kind: 'ai', details: 'API key replaced; the key is not stored in the log' })
    db.aiSettings.providers[k] = { provider: p.provider ?? cur.provider, endpoint: p.endpoint ?? cur.endpoint, keySet: cur.keySet || !!p.key }
  }
  if (body?.language) db.aiSettings.language = body.language
  db.aiSettings.savedAt = nowIso()
  db.aiSettings.savedBy = user.id
  return aiOut()
})
route('POST', '/api/admin/ai-settings/test', ({ user, body }) => {
  adminOnly(user)
  const ep = String(body?.endpoint ?? '')
  if (ep && !/^https:\/\/[^\s/]+\.[^\s]+/.test(ep)) fail('endpoint_unreachable', 'AIVES could not reach this endpoint. Check the address; it must start with https://.', 422)
  return { ok: true }
})

route('GET', '/api/admin/audit-logs', ({ user }) => {
  adminOnly(user)
  return db.auditLog.map((e) => ({ ...e, actor: userById(e.actorId)?.fullName ?? 'System' }))
})

// ---------- dispatcher ----------
const PUBLIC = ['/api/auth/login', '/api/auth/google', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/account-names/', '/api/email-links/']

export async function handleMock(method, url, body, token) {
  const [path, qs] = url.split('?')
  const query = Object.fromEntries(new URLSearchParams(qs ?? ''))
  await sleep(LATENCY[0] + Math.random() * (LATENCY[1] - LATENCY[0]))
  simulate()
  for (const r of routes) {
    if (r.method !== method) continue
    const m = path.match(r.re)
    if (!m) continue
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]))
    const isPublic = PUBLIC.some((p) => path.startsWith(p))
    const user = isPublic ? null : me(token)
    return clone(r.handler({ params, query, body, user }))
  }
  fail('not_found', `No mock for ${method} ${path}`, 404)
}
