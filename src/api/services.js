// REST endpoints, grouped by backend module. Paths not yet in the FOUNDATION-02 contract are
// proposals; keep them here so changing one is a single edit.
import { api } from './client.js'

const enc = encodeURIComponent

// Access Control & Exam Configuration (F7): accounts
export const authApi = {
  login: (login, password) => api.post('/api/auth/login', { login, password }),
  google: (idToken) => api.post('/api/auth/google', { idToken }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
  accountNameAvailability: (name) => api.get(`/api/auth/account-names/${enc(name)}`),
  register: (accountName, email, password) => api.post('/api/auth/register', { accountName, email, password }),
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }),
  readEmailLink: (token) => api.get(`/api/email-links/${enc(token)}`),
  useEmailLink: (token, body) => api.post(`/api/email-links/${enc(token)}`, body),
}

export const accountApi = {
  get: () => api.get('/api/account'),
  changeUsername: (username) => api.patch('/api/account', { username }),
  requestSetupLink: () => api.post('/api/account/setup-link'),
  linkGoogle: (idToken) => api.post('/api/account/google-link', { idToken }),
}

// AI Viva Interview (F3)
export const interviewApi = {
  mySessions: () => api.get('/api/student/exam-sessions'),
  mySession: (id) => api.get(`/api/student/exam-sessions/${enc(id)}`),
  start: (examSessionId) => api.post('/api/interview-attempts', { examSessionId }),
  get: (attemptId) => api.get(`/api/interview-attempts/${enc(attemptId)}`),
  // M1: typed answer. M2 sends the recording as multipart and receives the next question over WebSocket.
  submit: (attemptId, answerText, durationSeconds) => api.post(`/api/interview-attempts/${enc(attemptId)}/responses`, { answerText, durationSeconds }),
}

export const scoreReviewApi = {
  get: (attemptId) => api.get(`/api/interview-attempts/${enc(attemptId)}/review`),
  confirm: (attemptId, finalScore, comment) => api.put(`/api/interview-attempts/${enc(attemptId)}/score-review`, { finalScore, comment }),
}

// Feedback & Reporting (F6): reads stored scores only
export const reportingApi = {
  myReport: (attemptId) => api.get(`/api/interview-attempts/${enc(attemptId)}/report`),
  results: (sessionId) => api.get(`/api/exam-sessions/${enc(sessionId)}/results`),
  statistics: (sessionId) => api.get(`/api/exam-sessions/${enc(sessionId)}/statistics`),
  exportGradeSheet: (sessionId) => api.post(`/api/exam-sessions/${enc(sessionId)}/grade-sheet`),
}

// Exam configuration (F7, lecturer)
export const examConfigApi = {
  myCourses: () => api.get('/api/lecturer/courses'),
  list: () => api.get('/api/exam-sessions'),
  create: (body) => api.post('/api/exam-sessions', body),
  get: (id) => api.get(`/api/exam-sessions/${enc(id)}`),
  update: (id, body) => api.put(`/api/exam-sessions/${enc(id)}`, body),
  importQuestions: (id, questions) => api.post(`/api/exam-sessions/${enc(id)}/questions/import`, { questions }),
  saveRubric: (id, questionId, criteria, maxScore) => api.put(`/api/exam-sessions/${enc(id)}/questions/${enc(questionId)}/rubric`, { criteria, maxScore }),
  removeQuestion: (id, questionId) => api.del(`/api/exam-sessions/${enc(id)}/questions/${enc(questionId)}`),
  importParticipants: (id, rows) => api.post(`/api/exam-sessions/${enc(id)}/participants/import`, { rows }),
  publish: (id) => api.post(`/api/exam-sessions/${enc(id)}/publish`),
}

// Administration (F7, administrator)
export const adminApi = {
  users: () => api.get('/api/admin/users'),
  createUser: (fullName, email, role) => api.post('/api/admin/users', { fullName, email, role }),
  changeRole: (id, role) => api.patch(`/api/admin/users/${enc(id)}/role`, { role }),
  deactivate: (id) => api.post(`/api/admin/users/${enc(id)}/deactivate`),
  resendSetupLink: (id) => api.post(`/api/admin/users/${enc(id)}/setup-link`),
  courses: () => api.get('/api/admin/courses'),
  createCourse: (body) => api.post('/api/admin/courses', body),
  updateCourse: (id, body) => api.put(`/api/admin/courses/${enc(id)}`, body),
  aiSettings: () => api.get('/api/admin/ai-settings'),
  saveAiSettings: (body) => api.put('/api/admin/ai-settings', body),
  testEndpoint: (kind, endpoint) => api.post('/api/admin/ai-settings/test', { kind, endpoint }),
  auditLog: (query) => api.get('/api/admin/audit-logs', query),
}
