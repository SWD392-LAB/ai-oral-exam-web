// Mock API: answers request() calls with the same URLs, shapes and error codes the real API will use.
import { ApiError } from '../api/client.js'
import { decodeJwt } from '../features/auth/oidc.js'
import { sessionPhase } from '../utils/enums.js'
import { addAttempt, addUser, db, generateResponses, rand, splitScore } from './db.js'

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
  hasPlatformRubric: true,
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
    examSessionId: s.id,
    examTitle: s.title,
    timeLimitSeconds: s.timeLimitSeconds,
    maxFollowUps: s.maxFollowUps,
    totalQuestions: s.questions.length,
    answeredQuestions: a.responses.filter(Boolean).length,
    completedAt: a.endedAt,
    stateVersion: 1,
    currentTurn: null,
    attemptId: a.id, status: a.status, endReason: a.endReason, startedAt: a.startedAt, endedAt: a.endedAt,
    session: { id: s.id, title: s.title, courseCode: courseById(s.courseId).code, classCode: s.classCode, endAt: s.endAt, timeLimitSeconds: s.timeLimitSeconds, maxFollowUps: s.maxFollowUps, questionCount: s.questions.length },
    answered: a.responses.map((r, i) => ({ index: i, reached: !!r, turns: r ? r.turns.map((t) => ({ type: t.type, durationSeconds: t.dur })) : [] })),
    current: null,
  }
  if (a.current) {
    const qq = s.questions[a.current.qIndex]
    const fu = a.current.followUps
    const qText = fu ? (qq.followUps?.[fu - 1] ?? `Follow-up on ${qq.text}`) : qq.text
    const turnType = fu ? 'FollowUp' : 'Main'
    const turnId = a.current.turnId || `turn-${a.id}-${a.current.qIndex}-${fu}`
    a.current.turnId = turnId
    base.currentTurn = {
      questionResponseId: `qr-${a.id}-${a.current.qIndex}`,
      questionId: qq.id,
      questionOrderNo: a.current.qIndex + 1,
      turnNo: fu ? fu + 1 : 1,
      type: turnType,
      questionText: qText,
      askedAt: a.current.askedAt,
      deadlineAt: new Date(new Date(a.current.askedAt).getTime() + s.timeLimitSeconds * 1000).toISOString(),
      turnId,
    }
    base.current = {
      questionIndex: a.current.qIndex, questionId: qq.id, type: fu ? 'FollowUp' : 'Main', followUpNumber: fu,
      text: fu ? qq.followUps[fu - 1] : qq.text, mainText: qq.text, short: qq.short, askedAt: a.current.askedAt, turnId,
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
    review: a.review ? {
      ...a.review,
      status: a.review.status ?? (a.status === 'Finalized' ? 'Approved' : 'Pending'),
    } : null,
  }
}

// ---------- auth ----------
// Sign-in is Keycloak. The mock does not check the token: it only reads who it belongs to.
// TEMPORARY (remove when the real API is connected, which verifies the Keycloak token itself):
// the demo users of the realm "aives" stand in for existing mock users, so their screens have data.
const KEYCLOAK_DEMO_USERS = {
  'han.hg@aives.edu.vn': 'han', // Student: has the exam open now
  'an.nv@aives.edu.vn': 'bich', // Lecturer: owns the sample sessions
  'admin@aives.edu.vn': 'hoa', // Administrator
}
const me = (token) => {
  const email = String(decodeJwt(token ?? '').email ?? '').toLowerCase()
  const u = userById(KEYCLOAK_DEMO_USERS[email])
  if (!u || !u.active) fail('unauthorized', 'Your session has ended. Sign in again.', 401)
  return u
}
const requireRole = (u, ...roles) => { if (!roles.includes(u.role)) fail('forbidden', 'You do not have access to this page.', 403) }

// ---------- routes ----------
const routes = []
const route = (method, pattern, handler) => {
  const keys = []
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '$')
  routes.push({ method, re, keys, handler })
}

// ---------- health & auth ----------
route('GET', '/health', () => ({ status: 'Healthy', database: 'Healthy' }))
route('GET', '/api/auth/me', ({ user }) => publicUser(user))

// ---------- account ----------
route('GET', '/api/account', ({ user }) => publicUser(user))
route('PATCH', '/api/account', ({ user, body }) => {
  const name = (body?.username ?? '').trim()
  if (!name) fail('username_required', 'Enter a username.')
  if (name.length > 40) fail('username_too_long', 'Use 40 characters or fewer.')
  user.username = name
  return publicUser(user)
})

// ---------- student ----------
route('GET', '/api/interview/my-sessions', ({ user }) => {
  requireRole(user, 'Student')
  return db.sessions
    .filter((s) => s.status === 'Published' && s.participants.includes(user.id))
    .map((s) => {
      const a = db.attempts.find((x) => x.sessionId === s.id && x.studentId === user.id)
      const c = courseById(s.courseId)
      const phase = sessionPhase(s)
      return {
        examSessionId: s.id,
        courseCode: c?.code ?? 'SWD392',
        title: s.title,
        startTime: s.startAt,
        endTime: s.endAt,
        sessionStatus: s.status,
        isOpenNow: phase === 'Open now',
        questionCount: s.questions.length,
        timeLimitPerAnswerSeconds: s.timeLimitSeconds,
        participantStatus: a ? (a.status === 'InProgress' ? 'InProgress' : 'Completed') : 'Registered',
        latestAttemptId: a?.id ?? null,
        latestAttemptStatus: a?.status ?? null,
      }
    })
})

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

  if (sessionPhase(s) === 'Closed') { finishAttempt(a, 'SessionClosed', s.endAt); const st = attemptState(a); return { outcome: 'Completed', timedOut: false, attempt: st, state: st } }

  const words = answer.split(/\s+/).filter(Boolean).length
  const sufficient = words >= 25 || cur.followUps >= s.maxFollowUps || cur.followUps >= (qq.followUps?.length ?? 0)
  if (!sufficient) {
    a.current = { qIndex: cur.qIndex, followUps: cur.followUps + 1, askedAt: nowIso(), turnId: 'turn-' + Date.now().toString(36) }
    const st = attemptState(a); return { outcome: 'FollowUp', timedOut: false, attempt: st, state: st }
  }
  r.ai = scoreAnswer(qq, r.turns)
  if (cur.qIndex + 1 < s.questions.length) {
    a.current = { qIndex: cur.qIndex + 1, followUps: 0, askedAt: nowIso(), turnId: 'turn-' + Date.now().toString(36) }
    a.responses[cur.qIndex + 1] = { questionId: s.questions[cur.qIndex + 1].id, turns: [], ai: null }
    const st = attemptState(a); return { outcome: 'NextQuestion', timedOut: false, attempt: st, state: st }
  }
  finishAttempt(a, 'Completed')
  const finalSt = attemptState(a); return { outcome: 'Completed', timedOut: false, attempt: finalSt, state: finalSt }
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

route('GET', '/api/platform-rubric', () => ({
  id: 'mock-platform-rubric-v1',
  templateId: 'mock-platform-template-v1',
  courseId: null,
  versionNo: 1,
  maxScore: 10.0,
  isSealed: true,
  isActive: true,
  createdBy: 'admin',
  createdAt: '2026-11-01T10:00:00Z',
  criteria: [
    {
      id: 'crit-1',
      orderNo: 1,
      description: 'Kiến thức chuyên môn và độ chính xác của câu trả lời',
      maxPoints: 4.0,
    },
    {
      id: 'crit-2',
      orderNo: 2,
      description: 'Khả năng phân tích, phản biện và trả lời câu hỏi xoáy',
      maxPoints: 3.5,
    },
    {
      id: 'crit-3',
      orderNo: 3,
      description: 'Phong thái, cấu trúc trình bày và sự tự tin',
      maxPoints: 2.5,
    },
  ],
}))

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

// Question Bank API routes
route('GET', '/api/courses/:courseId/question-bank', ({ params, query }) => {
  const cid = String(params.courseId).toLowerCase()
  let list = (db.questionBank ?? []).filter((q) => q.courseId.toLowerCase() === cid)
  if (query?.status && query.status !== 'All') {
    list = list.filter((q) => q.status === query.status)
  }
  return list
})

route('GET', '/api/courses/:courseId/question-bank/:itemId', ({ params }) => {
  const item = (db.questionBank ?? []).find((q) => q.id === params.itemId) ?? fail('question_bank_not_found', 'Question not found in bank.', 404)
  return item
})

route('POST', '/api/courses/:courseId/question-bank', ({ params, body }) => {
  const cid = String(params.courseId).toLowerCase()
  const topic = String(body?.topic ?? '').trim()
  const bloom = body?.bloom ?? 'Understand'
  const content = String(body?.content ?? '').trim()
  if (!topic || !content) fail('question_bank_invalid', 'Topic and content are required.')
  const duplicate = (db.questionBank ?? []).some((q) => q.courseId.toLowerCase() === cid && q.content.trim().toLowerCase() === content.toLowerCase())
  if (duplicate) fail('question_bank_duplicate', 'Nội dung câu hỏi đã tồn tại trong môn học.', 409)
  const item = {
    id: 'qb-' + Date.now().toString(36),
    courseId: params.courseId,
    topic,
    bloom,
    content,
    origin: 'Manual',
    status: 'Draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    revisions: [
      { id: 'rev-' + Date.now().toString(36), revisionNo: 1, content, createdAt: nowIso() },
    ],
  }
  if (!db.questionBank) db.questionBank = []
  db.questionBank.unshift(item)
  return item
})

route('PUT', '/api/courses/:courseId/question-bank/:itemId', ({ params, body }) => {
  const item = (db.questionBank ?? []).find((q) => q.id === params.itemId) ?? fail('question_bank_not_found', 'Question not found.', 404)
  if (item.status !== 'Draft') fail('question_bank_locked', 'Chỉ câu hỏi nháp mới được chỉnh sửa.', 409)
  const topic = String(body?.topic ?? item.topic).trim()
  const bloom = body?.bloom ?? item.bloom
  const content = String(body?.content ?? item.content).trim()
  item.topic = topic
  item.bloom = bloom
  item.content = content
  item.updatedAt = nowIso()
  const revNo = (item.revisions?.length ?? 0) + 1
  if (!item.revisions) item.revisions = []
  item.revisions.push({ id: 'rev-' + Date.now().toString(36), revisionNo: revNo, content, createdAt: nowIso() })
  return item
})

route('POST', '/api/courses/:courseId/question-bank/:itemId/approve', ({ params }) => {
  const item = (db.questionBank ?? []).find((q) => q.id === params.itemId) ?? fail('question_bank_not_found', 'Question not found.', 404)
  if (item.status !== 'Draft') fail('question_bank_not_draft', 'Chỉ câu hỏi nháp mới được duyệt.', 409)
  item.status = 'Approved'
  item.updatedAt = nowIso()
  return item
})

route('POST', '/api/courses/:courseId/question-bank/:itemId/reject', ({ params }) => {
  const item = (db.questionBank ?? []).find((q) => q.id === params.itemId) ?? fail('question_bank_not_found', 'Question not found.', 404)
  if (item.status !== 'Draft') fail('question_bank_not_draft', 'Chỉ câu hỏi nháp mới được từ chối.', 409)
  item.status = 'Rejected'
  item.updatedAt = nowIso()
  return item
})

// Course Materials routes
route('GET', '/api/courses/:courseId/materials', ({ params }) => {
  const cid = String(params.courseId).toLowerCase()
  return (db.courseMaterials ?? []).filter((m) => m.courseId.toLowerCase() === cid)
})

route('POST', '/api/courses/:courseId/materials', ({ params, body }) => {
  const mat = {
    id: 'mat-' + Date.now().toString(36),
    courseId: params.courseId,
    fileName: body?.fileName ?? 'Uploaded_Material.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1850000,
    sha256: 'mock-sha256-' + Date.now().toString(36),
    status: 'Pending',
    ingestError: null,
    createdAt: nowIso(),
  }
  if (!db.courseMaterials) db.courseMaterials = []
  db.courseMaterials.unshift(mat)
  return mat
})

route('POST', '/api/courses/:courseId/materials/:materialId/ingest', ({ params }) => {
  const mat = (db.courseMaterials ?? []).find((m) => m.id === params.materialId)
  if (!mat) fail('material_not_found', 'Tài liệu không tồn tại.', 404)
  mat.status = 'Ready'
  return mat
})

// Question Generation route
route('POST', '/api/courses/:courseId/question-bank/generations', ({ params, body }) => {
  const cid = String(params.courseId).toLowerCase()
  const topic = String(body?.topic ?? '').trim()
  const bloom = body?.bloom ?? 'Understand'
  const count = Math.min(20, Math.max(1, Number(body?.count) || 3))
  const platformRubricVersionId = body?.platformRubricVersionId ?? '44444444-0000-0000-0000-000000000001'
  const sourceMaterialIds = body?.sourceMaterialIds ?? []

  if (!topic) fail('topic_required', 'Chủ đề là bắt buộc.')

  const drafts = []
  for (let i = 1; i <= count; i++) {
    const draftId = 'ai-draft-' + Date.now().toString(36) + '-' + i
    const content = `[${bloom}] Hãy giải thích và phân tích sâu về "${topic}" trong bối cảnh kiến trúc hệ thống (Câu hỏi AI sinh #${i}).`
    const citations = sourceMaterialIds.length > 0 ? [
      {
        sourceId: sourceMaterialIds[0],
        sourceIndex: 1,
        quote: `Tài liệu giáo trình đề cập chi tiết đến ${topic} và các nguyên tắc thiết kế cốt lõi.`,
      },
    ] : []

    const draft = {
      draftId,
      orderNo: i,
      content,
      bloom,
      status: 'Draft',
      platformRubricVersionId,
      citations,
    }
    drafts.push(draft)

    // Tự động lưu vào questionBank
    if (!db.questionBank) db.questionBank = []
    db.questionBank.unshift({
      id: draftId,
      courseId: params.courseId,
      topic,
      bloom,
      content,
      origin: 'Ai',
      status: 'Draft',
      citations,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      revisions: [
        { id: 'rev-' + draftId, revisionNo: 1, content, createdAt: nowIso() },
      ],
    })
  }

  return {
    courseId: params.courseId,
    provider: 'MockAI',
    status: 'Success',
    drafts,
  }
})

route('POST', '/api/exam-sessions/:id/questions/from-bank', ({ user, params, body }) => {
  const s = ownSession(user, params.id)
  if (s.status !== 'Draft') fail('exam_session_locked', 'A published session cannot be changed.', 409)
  const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : []
  const attachedIds = []
  for (const itemId of itemIds) {
    const item = (db.questionBank ?? []).find((q) => q.id === itemId)
    if (!item) continue
    if (item.status !== 'Approved') fail('question_bank_item_not_approved', 'Only approved questions can be attached.', 409)
    const exists = s.questions.some((q) => q.bankItemId === itemId || (q.text && q.text.trim() === item.content.trim()))
    if (!exists) {
      s.questions.push({
        id: `${s.id}q${s.questions.length + 1}`,
        orderNo: s.questions.length + 1,
        text: item.content,
        content: item.content,
        short: item.content.length > 40 ? item.content.slice(0, 40) + '…' : item.content,
        bankItemId: item.id,
        rubric: null,
      })
      attachedIds.push(item.id)
    }
  }
  return attachedIds
})

route('GET', '/api/exam-sessions/:id/questions', ({ user, params }) => {
  const s = ownSession(user, params.id)
  return s.questions
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
  if (!c.hasQuestion || !c.hasStudent || !c.hasWindow) fail('exam_session_not_ready', 'This session is not ready to publish.', 409, c)
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

route('PUT', '/api/interview-attempts/:id/score-review/draft', ({ user, params, body }) => {
  requireRole(user, 'Lecturer')
  const a = attemptById(params.id)
  ownSession(user, a.sessionId)
  if (a.status === 'InProgress') fail('attempt_not_finished', 'This attempt is still in progress.', 409)
  const v = Number(body?.finalScore)
  if (!(v >= 0 && v <= 10) || Math.abs(v * 4 - Math.round(v * 4)) > 1e-9) fail('final_score_invalid', 'Use a score from 0 to 10 in steps of 0.25.')
  a.review = { finalScore: v, comment: String(body?.comment ?? '').trim(), confirmedAt: nowIso(), reviewerId: user.id, status: 'Pending' }
  return { finalScore: v, comment: a.review.comment, status: 'Pending', reviewedAt: a.review.confirmedAt }
})

route('POST', '/api/interview-attempts/:id/score-review/confirm', ({ user, params }) => {
  requireRole(user, 'Lecturer')
  const a = attemptById(params.id)
  ownSession(user, a.sessionId)
  if (a.status === 'InProgress') fail('attempt_not_finished', 'This attempt is still in progress.', 409)
  const v = a.review?.finalScore ?? aiTotal(a)
  a.review = {
    finalScore: v,
    comment: a.review?.comment ?? '',
    confirmedAt: nowIso(),
    reviewerId: user.id,
    status: 'Approved',
  }
  a.status = 'Finalized'
  return { finalScore: v, comment: a.review.comment, status: 'Approved', reviewedAt: a.review.confirmedAt }
})

route('PUT', '/api/interview-attempts/:id/score-review', ({ user, params, body }) => {
  requireRole(user, 'Lecturer')
  const a = attemptById(params.id)
  ownSession(user, a.sessionId)
  if (a.status === 'InProgress') fail('attempt_not_finished', 'This attempt is still in progress.', 409)
  const v = Number(body?.finalScore)
  if (!(v >= 0 && v <= 10) || Math.abs(v * 4 - Math.round(v * 4)) > 1e-9) fail('final_score_invalid', 'Use a score from 0 to 10 in steps of 0.25.')
  a.review = { finalScore: v, comment: String(body?.comment ?? '').trim(), confirmedAt: nowIso(), reviewerId: user.id, status: 'Approved' }
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
    const user = me(token)
    return clone(r.handler({ params, query, body, user }))
  }
  fail('not_found', `No mock for ${method} ${path}`, 404)
}
