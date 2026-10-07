// In-memory sample world for the mock API. Times are built around the moment the app loads,
// so "open now" is always open. Names, emails, scores and times are sample data.
import { ANH_VIVA0, ANH_VIVA1, BAO_VIVA1, SWT_VIVA, VIVA0, VIVA1, VIVA2, VIVA3 } from './content.js'

export const PASSWORD = 'Password@123'
const MIN = 60000
const LOAD = Date.now()

const at = (base, minutes) => new Date(base + minutes * MIN).toISOString()
const dayAt = (daysFromToday, h, m = 0) => {
  const d = new Date(LOAD)
  d.setDate(d.getDate() + daysFromToday)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

// deterministic pseudo-random, so the world is the same on every load
const rand = (seed) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

const emailOf = (name) => {
  const p = name.toLowerCase().split(' ')
  return `${p[p.length - 1]}.${p.slice(0, -1).map((w) => w[0]).join('')}@example.com`
}

// ---------- people ----------
const users = []
const addUser = (u) => {
  const user = {
    id: u.id ?? `u${users.length + 1}`,
    fullName: u.fullName,
    username: u.username ?? u.fullName,
    accountName: u.accountName ?? null,
    email: u.email ?? emailOf(u.fullName),
    role: u.role ?? 'Student',
    studentCode: u.studentCode ?? null,
    classCode: u.classCode ?? null,
    active: u.active ?? true,
    emailVerified: u.emailVerified ?? true,
    googleLinked: u.googleLinked ?? false,
    hasPassword: u.hasPassword ?? true,
    setupSentAt: u.setupSentAt ?? null,
    createdAt: u.createdAt ?? at(LOAD, -60 * 24 * 40 + users.length),
  }
  users.push(user)
  return user
}

// lecturers and the administrator (wireframe: AdminUsers)
const staff = {
  bich: addUser({ id: 'bich', fullName: 'Tran Thi Bich', accountName: 'bichtt', email: 'bich.tran@example.com', role: 'Lecturer', googleLinked: true }),
  duc: addUser({ id: 'duc', fullName: 'Le Van Duc', accountName: 'ducle', email: 'duc.le@example.com', role: 'Lecturer' }),
  ha: addUser({ id: 'ha', fullName: 'Pham Thu Ha', email: 'ha.pham@example.com', role: 'Lecturer', hasPassword: false, emailVerified: false, setupSentAt: new Date(dayAt(-1, 10)).toISOString() }),
  khai: addUser({ id: 'khai', fullName: 'Vo Quang Khai', accountName: 'khaivq', email: 'khai.vo@example.com', role: 'Lecturer', active: false }),
  trang: addUser({ id: 'trang', fullName: 'Dang Thu Trang', email: 'trang.dang@example.com', role: 'Lecturer', hasPassword: false, emailVerified: false, setupSentAt: at(LOAD, -120) }),
  hoa: addUser({ id: 'hoa', fullName: 'Ngo Thanh Hoa', accountName: 'hoant', email: 'hoa.ngo@example.com', role: 'Administrator', googleLinked: true }),
}

// Class SE1834 (wireframe: SessionResults). Hoang Gia Han moved to SE1835 for the live exam demo.
const SE1834 = [
  ['Nguyen Minh Anh', 'SE180123'], ['Tran Quoc Bao', 'SE180141'], ['Le Thi Cam', 'SE180156'], ['Bui Thanh Dat', 'SE180129'],
  ['Ngo Bao Chau', 'SE180135'], ['Dang Quang Huy', 'SE180170'], ['Pham Duc Duy', 'SE180162'], ['Hoang Gia Huy', 'SE180177'],
  ['Do Thanh Khang', 'SE180188'], ['Truong My Linh', 'SE180101'], ['Phan Van Long', 'SE180104'], ['Mai Thu Ha', 'SE180108'],
  ['Cao Minh Khoa', 'SE180112'], ['Lam Ngoc Mai', 'SE180115'], ['Dinh Hoang Phuc', 'SE180118'], ['Ta Thi Nga', 'SE180126'],
  ['Huynh Tan Phat', 'SE180131'], ['Luong Bao Ngoc', 'SE180138'], ['Ho Duc Tri', 'SE180144'], ['Kieu Anh Thu', 'SE180147'],
  ['Duong Gia Bao', 'SE180150'], ['Chau Minh Tam', 'SE180153'], ['Vo Thanh Tung', 'SE180159'], ['Quach Ngoc Yen', 'SE180165'],
  ['Lu Van Hau', 'SE180168'], ['Trinh Kim Oanh', 'SE180174'], ['La Quoc Viet', 'SE180181'], ['Tong Thu Trang', 'SE180184'],
  ['Ung Gia Khiem', 'SE180191'], ['Thai Bao Tran', 'SE180197'], ['Vu Ngoc Lan', 'SE180194'], ['Ly Hoang Nam', 'SE180199'],
]
const SE1835 = [
  ['Hoang Gia Han', 'SE180511'], ['Nguyen Thao Vy', 'SE180502'], ['Tran Duc Anh', 'SE180505'], ['Le Hoang Bach', 'SE180508'],
  ['Pham Ngoc Chi', 'SE180514'], ['Vu Minh Dang', 'SE180517'], ['Do Khanh Linh', 'SE180520'], ['Bui Quang Minh', 'SE180523'],
  ['Dang Thu Phuong', 'SE180526'], ['Ngo Tuan Kiet', 'SE180529'], ['Ho Bao Ngan', 'SE180532'], ['Duong Van Quy', 'SE180535'],
  ['Lam Thanh Son', 'SE180538'], ['Mai Gia Tuong', 'SE180541'], ['Trinh Ngoc Uyen', 'SE180544'], ['Phan Minh Vu', 'SE180547'],
  ['Cao Thi Xuan', 'SE180550'], ['Ta Quoc Hung', 'SE180553'], ['Kieu Bao Chau', 'SE180556'], ['Luong Duc Hieu', 'SE180559'],
  ['Chau Thanh Dat', 'SE180562'], ['Huynh Mai Anh', 'SE180565'], ['Quach Van Tai', 'SE180568'], ['Dinh Ngoc Han', 'SE180571'],
  ['Vo Hoang Long', 'SE180574'], ['Thai Minh Quan', 'SE180577'], ['La Thu Thuy', 'SE180580'], ['Tong Gia Phuc', 'SE180583'],
  ['Ung Bao Tran', 'SE180586'], ['Lu Thanh Nhan', 'SE180589'], ['Doan Kim Ngoc', 'SE180592'],
]

const studentsOf = (list, classCode) => list.map(([fullName, studentCode]) => {
  const special = {
    SE180123: { id: 'anh', accountName: 'minhanh.se18', email: 'anh.nguyen@example.com' },
    SE180511: { id: 'han', accountName: 'hanhg.se18', email: 'han.hg@example.com' },
  }[studentCode] ?? { accountName: studentCode.toLowerCase() }
  return addUser({ fullName, studentCode, classCode, ...special })
})
const c34 = studentsOf(SE1834, 'SE1834')
const c35 = studentsOf(SE1835, 'SE1835')
addUser({ id: 'apham', fullName: 'Pham Lan Anh', username: 'anh.pham', email: 'anh.pham@example.com', hasPassword: false, googleLinked: true, studentCode: 'SE180610', classCode: 'SE1836' })

// ---------- courses ----------
const courses = [
  { id: 'swd392', code: 'SWD392', name: 'Software Architecture and Design', lecturerIds: ['bich', 'duc'] },
  { id: 'swt301', code: 'SWT301', name: 'Software Testing', lecturerIds: ['bich'] },
  { id: 'prj301', code: 'PRJ301', name: 'Java Web Application Development', lecturerIds: ['duc'] },
  { id: 'swp391', code: 'SWP391', name: 'Software Development Project', lecturerIds: [] },
]

// ---------- sessions ----------
const openStart = LOAD - 78 * MIN // 42 minutes left when the app loads
const closedEnd = openStart - 30 * MIN
const clone = (qs) => qs.map((x) => ({ ...x, rubric: x.rubric ? { ...x.rubric } : null }))
const session = (s) => ({ timeLimitSeconds: 90, maxFollowUps: 2, createdBy: 'bich', publishedAt: null, ...s })

const sessions = [
  session({ id: 'v2', title: 'Viva 2: Quality attributes', classCode: 'SE1834', courseId: 'swd392', status: 'Published', startAt: new Date(dayAt(7, 13)).toISOString(), endAt: new Date(dayAt(7, 15)).toISOString(), questions: clone(VIVA2), participants: c34.map((u) => u.id) }),
  session({ id: 't1', title: 'Viva: Test design techniques', classCode: null, courseId: 'swt301', status: 'Published', startAt: new Date(dayAt(2, 9)).toISOString(), endAt: new Date(dayAt(2, 10, 30)).toISOString(), questions: clone(SWT_VIVA), participants: [...c34.slice(2, 16), ...c35.slice(1, 15)].map((u) => u.id) }),
  session({ id: 'o1', title: 'Viva 1: Architecture styles', classCode: 'SE1835', courseId: 'swd392', status: 'Published', startAt: new Date(openStart).toISOString(), endAt: new Date(openStart + 120 * MIN).toISOString(), questions: clone(VIVA1), participants: c35.map((u) => u.id) }),
  session({ id: 'c1', title: 'Viva 1: Architecture styles', classCode: 'SE1834', courseId: 'swd392', status: 'Published', startAt: new Date(closedEnd - 120 * MIN).toISOString(), endAt: new Date(closedEnd).toISOString(), questions: clone(VIVA1), participants: c34.map((u) => u.id) }),
  session({ id: 'c0', title: 'Viva 0: Requirements', classCode: 'SE1834', courseId: 'swd392', status: 'Published', startAt: new Date(dayAt(-8, 13)).toISOString(), endAt: new Date(dayAt(-8, 15)).toISOString(), questions: clone(VIVA0), participants: c34.map((u) => u.id) }),
  session({ id: 'd3', title: 'Viva 3: Design patterns', classCode: 'SE1834', courseId: 'swd392', status: 'Draft', startAt: new Date(dayAt(13, 13)).toISOString(), endAt: new Date(dayAt(13, 15)).toISOString(), questions: clone(VIVA3), participants: c34.map((u) => u.id),
    skippedRows: [
      { row: 7, fullName: 'Le Van Cuong', studentCode: 'SE180777', reason: 'No account matches' },
      { row: 15, fullName: 'Pham Thu Ha', studentCode: 'SE180915', reason: 'No account matches' },
      { row: 31, fullName: 'Vo Minh Khoa', studentCode: 'SE180931', reason: 'No account matches' },
    ] }),
]
sessions.forEach((s) => { if (s.status === 'Published') s.publishedAt = new Date(new Date(s.startAt).getTime() - 3 * 24 * 60 * MIN).toISOString() })

// ---------- attempts ----------
const attempts = []
let attemptSeq = 0

const splitScore = (total, n, seed) => {
  // n per-question scores in 0.5 steps, each 0..2.5, adding up to total
  const out = Array(n).fill(0)
  let left = Math.round(total * 2)
  for (let i = 0; i < n && left > 0; i++) {
    const remainingSlots = n - i - 1
    const minHere = Math.max(0, left - remainingSlots * 5)
    const maxHere = Math.min(5, left)
    const v = minHere + Math.floor(rand(seed + i) * (maxHere - minHere + 1))
    out[i] = v / 2
    left -= v
  }
  for (let i = 0; left > 0; i = (i + 1) % n) { if (out[i] < 2.5) { out[i] += 0.5; left -= 1 } }
  return out
}

const tierOf = (score) => (score >= 2 ? 'good' : score >= 1 ? 'mid' : 'weak')
const durOf = (text) => Math.min(88, Math.round(12 + text.split(' ').length * 0.75))

// Builds stored responses from per-question scores; null means the question was never reached.
export function generateResponses(questions, scores, seed) {
  return questions.map((qq, i) => {
    const s = scores[i]
    if (s === null || s === undefined) return null
    const tier = tierOf(s)
    const [answer, comment] = qq.bank ? qq.bank[tier] : ['I would need to think about this more.', 'Answer too short to assess.']
    const turns = [{ type: 'Main', question: qq.text, answer, dur: durOf(answer) }]
    if (tier !== 'good' && qq.followUps?.length) {
      const fa = rand(seed + i * 3) > 0.5 ? 'I am not completely sure, but I think it depends on how the system is used.' : 'I think so, but I would have to check the details.'
      turns.push({ type: 'FollowUp', question: qq.followUps[0], answer: fa, dur: durOf(fa) })
    }
    return { questionId: qq.id, turns, ai: { score: s, comment } }
  })
}

const fromScript = (questions, script) => questions.map((qq, i) => {
  const r = script[i]
  if (!r) return null
  return {
    questionId: qq.id,
    turns: r.turns.map((t) => ({ type: t.type, question: t.question ?? qq.text, answer: t.answer, dur: t.dur })),
    ai: { score: r.ai, comment: r.comment },
  }
})

const addAttempt = (a) => {
  attemptSeq += 1
  const attempt = { id: `a${attemptSeq}`, review: null, current: null, ...a }
  attempts.push(attempt)
  return attempt
}

// c1: closed today, wireframe SessionResults. [key, ai total, final, ended minutes after start, note]
const s1 = sessions.find((s) => s.id === 'c1')
const s1Start = new Date(s1.startAt).getTime()
const C1 = {
  SE180123: ['w', 7.5, null, 81], SE180141: ['w', 5.0, null, 120, 3], SE180156: ['w', 8.0, null, 62], SE180129: ['w', 6.0, null, 93],
  SE180135: ['w', 7.0, null, 107], SE180170: ['w', 4.5, null, 120, 2], SE180162: ['c', 6.5, 7.0, 48], SE180177: ['c', 9.0, 9.0, 55],
  SE180188: ['c', 7.0, 7.0, 100], SE180101: ['c', 8.5, 8.5, 41], SE180104: ['c', 6.0, 6.5, 44], SE180108: ['c', 7.5, 7.5, 46],
  SE180112: ['c', 5.5, 5.0, 50], SE180115: ['c', 8.0, 8.0, 52], SE180118: ['c', 6.5, 6.5, 57], SE180126: ['c', 7.0, 7.5, 59],
  SE180131: ['c', 3.5, 3.5, 64], SE180138: ['c', 8.5, 8.0, 66], SE180144: ['c', 6.0, 6.0, 69], SE180147: ['c', 7.5, 7.0, 71],
  SE180150: ['c', 5.5, 5.5, 74], SE180153: ['c', 9.5, 9.5, 76], SE180159: ['c', 7.5, 7.5, 78], SE180165: ['c', 4.0, 4.5, 85],
  SE180168: ['c', 8.0, 8.5, 88], SE180174: ['c', 6.5, 6.0, 90], SE180181: ['c', 5.5, 5.5, 96], SE180184: ['c', 7.0, 7.5, 104],
  SE180191: ['c', 8.0, 8.0, 112], SE180197: ['c', 6.5, 6.5, 118],
}
c34.forEach((u, idx) => {
  const row = C1[u.studentCode]
  if (!row) return
  const [kind, ai, final, endMin, reached] = row
  const ended = s1Start + endMin * MIN
  let responses
  if (u.id === 'anh') responses = fromScript(s1.questions, ANH_VIVA1)
  else if (u.studentCode === 'SE180141') responses = [...fromScript(s1.questions, BAO_VIVA1), null]
  else {
    const n = reached ?? 4
    const scores = splitScore(ai, n, idx * 11)
    responses = generateResponses(s1.questions, [...scores, ...Array(4 - n).fill(null)], idx * 7)
  }
  addAttempt({
    sessionId: 'c1', studentId: u.id,
    status: kind === 'w' ? 'PendingReview' : 'Finalized',
    startedAt: new Date(ended - (reached ? 41 : 23) * MIN).toISOString(), endedAt: new Date(ended).toISOString(),
    endReason: reached ? 'SessionClosed' : 'Completed',
    responses,
    review: kind === 'c' ? { finalScore: final, comment: '', confirmedAt: new Date(ended + 90 * MIN).toISOString(), reviewerId: 'bich' } : null,
  })
})

// c0: eight days ago, all confirmed. Final scores spread as the wireframe's distribution.
const s0 = sessions.find((s) => s.id === 'c0')
const s0Start = new Date(s0.startAt).getTime()
const C0_FINALS = [3.5, 4.5, 4.0, 5.5, 5.0, 5.5, 6.5, 6.0, 6.5, 6.0, 6.5, 6.0, 7.0, 7.5, 7.0, 7.5, 7.0, 7.5, 7.0, 7.5, 7.0, 8.5, 8.0, 8.5, 8.0, 8.5, 8.0, 8.5, 9.5, 9.0, 9.5]
c34.forEach((u, idx) => {
  if (u.studentCode === 'SE180199') return // Ly Hoang Nam: no attempt
  const ended = s0Start + (25 + idx * 3) * MIN
  const isAnh = u.id === 'anh'
  const final = isAnh ? 8.0 : C0_FINALS[idx % C0_FINALS.length]
  const ai = isAnh ? 7.5 : Math.max(0, Math.min(10, final + (rand(idx) > 0.6 ? -0.5 : rand(idx + 1) > 0.7 ? 0.5 : 0)))
  addAttempt({
    sessionId: 'c0', studentId: u.id, status: 'Finalized',
    startedAt: new Date(ended - 22 * MIN).toISOString(), endedAt: new Date(ended).toISOString(), endReason: 'Completed',
    responses: isAnh ? fromScript(s0.questions, ANH_VIVA0) : generateResponses(s0.questions, splitScore(ai, 4, idx * 5), idx * 13),
    review: { finalScore: final, comment: isAnh ? 'You corrected the vague performance requirement yourself in the follow-up, so I raised the score.' : '', confirmedAt: new Date(ended + 24 * 60 * MIN).toISOString(), reviewerId: 'bich' },
  })
})

// o1: open now. 4 waiting for review, 8 answering, the rest (Han included) not started.
const so = sessions.find((s) => s.id === 'o1')
c35.forEach((u, idx) => {
  if (idx >= 1 && idx <= 4) {
    const ended = openStart + (40 + idx * 6) * MIN
    const ai = [6.5, 8.0, 7.0, 5.5][idx - 1]
    addAttempt({ sessionId: 'o1', studentId: u.id, status: 'PendingReview', startedAt: new Date(ended - 24 * MIN).toISOString(), endedAt: new Date(ended).toISOString(), endReason: 'Completed', responses: generateResponses(so.questions, splitScore(ai, 4, idx * 17), idx * 19) })
  } else if (idx >= 5 && idx <= 12) {
    addAttempt({ sessionId: 'o1', studentId: u.id, status: 'InProgress', startedAt: at(LOAD, -(4 + idx)), endedAt: null, endReason: null, responses: [], simulated: true })
  }
})

// ---------- admin ----------
const auditLog = [
  { id: 'e1', at: at(LOAD, -16), actorId: 'hoa', action: 'Account created', cat: 'created', target: 'Dang Thu Trang', kind: 'user', details: 'Lecturer · setup link sent to trang.dang@example.com' },
  { id: 'e2', at: new Date(dayAt(0, 9, 15)).toISOString(), actorId: 'hoa', action: 'Lecturer assigned', cat: 'assign', target: 'SWD392', kind: 'course', details: 'Le Van Duc added' },
  { id: 'e3', at: new Date(dayAt(-4, 17, 30)).toISOString(), actorId: 'hoa', action: 'AI provider changed', cat: 'ai', target: 'Text-to-speech (TTS)', kind: 'ai', details: 'API key replaced; the key is not stored in the log' },
  { id: 'e4', at: new Date(dayAt(-4, 17, 28)).toISOString(), actorId: 'hoa', action: 'Speech language changed', cat: 'lang', target: 'STT and TTS', kind: 'ai', details: 'English to Vietnamese' },
  { id: 'e5', at: new Date(dayAt(-5, 10, 5)).toISOString(), actorId: 'hoa', action: 'Account deactivated', cat: 'deact', target: 'Vo Quang Khai', kind: 'user', details: 'Lecturer account', danger: true },
  { id: 'e6', at: new Date(dayAt(-6, 14, 40)).toISOString(), actorId: 'hoa', action: 'Course created', cat: 'course', target: 'SWP391', kind: 'course', details: 'Software Development Project' },
  { id: 'e7', at: new Date(dayAt(-6, 14, 20)).toISOString(), actorId: 'hoa', action: 'Course edited', cat: 'course', target: 'PRJ301', kind: 'course', details: 'Name changed' },
  { id: 'e8', at: new Date(dayAt(-8, 8, 50)).toISOString(), actorId: 'hoa', action: 'Role changed', cat: 'role', target: 'Tran Thi Bich', kind: 'user', details: 'Student to Lecturer' },
]

const aiSettings = {
  language: 'vi',
  providers: {
    stt: { provider: '', endpoint: '', keySet: true },
    tts: { provider: '', endpoint: '', keySet: true },
    llm: { provider: '', endpoint: '', keySet: true },
  },
  savedAt: new Date(dayAt(-4, 17, 30)).toISOString(),
  savedBy: 'hoa',
}

// email links: token -> link. "demo-*" tokens let the wireframe states be opened directly.
const emailLinks = {
  'demo-setup': { purpose: 'AccountSetup', userId: 'trang', expiresAt: at(LOAD, 60 * 24), usedAt: null },
  'demo-reset': { purpose: 'PasswordReset', userId: 'anh', expiresAt: at(LOAD, 60), usedAt: null },
  'demo-expired': { purpose: 'PasswordReset', userId: 'anh', expiresAt: at(LOAD, -60), usedAt: null },
}

export const db = { users, courses, sessions, attempts, auditLog, aiSettings, emailLinks, loadedAt: LOAD }
export { addUser, addAttempt, splitScore, rand, staff }
