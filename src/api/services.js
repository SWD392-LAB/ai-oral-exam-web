// REST endpoints, grouped by backend module. Paths not yet in the FOUNDATION-02 contract are
// proposals; keep them here so changing one is a single edit.
import { api } from './client.js'

const enc = encodeURIComponent

// System health check
export const systemApi = {
  health: () => api.get('/health'),
}

// Access Control & Exam Configuration (F7): accounts & auth profile.
export const authApi = {
  me: () => api.get('/api/auth/me'),
}

export const accountApi = {
  get: () => api.get('/api/auth/me'),
  changeUsername: (username) => api.patch('/api/account', { username }),
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

// Feedback & Reporting (F6): reads stored scores only (Backend Adapters)
export const reportingApi = {
  myReport: async (attemptId) => {
    const r = await api.get(`/api/reports/attempts/${enc(attemptId)}`)
    if (!r) return null
    return {
      attemptId: r.attemptId,
      status: r.status,
      session: {
        title: r.examTitle ?? 'Viva Exam',
        courseCode: r.courseCode ?? '',
      },
      startedAt: r.startedAt,
      endedAt: r.completedAt ?? r.startedAt,
      finalScore: r.finalScore,
      aiTotal: r.suggestedTotalScore,
      review: {
        finalScore: r.finalScore ?? 0,
        reviewerName: 'your lecturer',
        confirmedAt: r.completedAt ?? r.startedAt,
        comment: r.lecturerComment ?? '',
      },
      questions: (r.questions ?? []).map((q) => ({
        order: q.orderNo,
        text: q.content,
        maxScore: q.maxScore,
        comment: q.aiFeedback ?? '',
        ai: {
          score: q.suggestedScore ?? 0,
          comment: q.aiFeedback ?? '',
        },
        reached: (q.turns?.length ?? 0) > 0,
        turns: (q.turns ?? []).map((t) => {
          const dur = t.answeredAt && t.askedAt
            ? Math.max(1, Math.round((new Date(t.answeredAt) - new Date(t.askedAt)) / 1000))
            : 30
          return {
            type: t.type,
            questionText: t.questionText,
            answerText: t.answerTranscript ?? '',
            durationSeconds: dur,
          }
        }),
      })),
    }
  },

  results: async (sessionId) => {
    const [rawRows, rawSess] = await Promise.all([
      api.get(`/api/reports/exam-sessions/${enc(sessionId)}/results`),
      api.get(`/api/exam-sessions/${enc(sessionId)}`).catch(() => null),
    ])
    const rows = (Array.isArray(rawRows) ? rawRows : []).map((r) => ({
      studentId: r.studentId,
      fullName: r.studentName,
      studentCode: r.studentCode ?? '–',
      attemptId: r.attemptId,
      status: r.status,
      endReason: r.status === 'Finalized' ? 'Confirmed by lecturer' : 'Waiting for review',
      endedAt: r.completedAt,
      aiTotal: r.suggestedTotalScore,
      finalScore: r.finalScore,
      reached: 1,
      questionCount: rawSess?.questionCount ?? 1,
    }))
    const session = {
      id: sessionId,
      title: rawSess?.title ?? 'SWD392 Viva Exam',
      courseCode: rawSess?.courseCode ?? 'SWD392',
      classCode: rawSess?.classCode ?? null,
      phase: rawSess?.status === 'Closed' ? 'Closed' : 'Open now',
      startAt: rawSess?.startTime ?? null,
      endAt: rawSess?.endTime ?? null,
    }
    return { session, rows }
  },

  statistics: async (sessionId) => {
    const [d, rawSess] = await Promise.all([
      api.get(`/api/reports/exam-sessions/${enc(sessionId)}/statistics`),
      api.get(`/api/exam-sessions/${enc(sessionId)}`).catch(() => null),
    ])
    if (!d) return null
    // BE chia 5 buckets (0-2, 2-4, 4-6, 6-8, 8-10) -> map sang 10 bins thang 10
    const counts = Array(10).fill(0)
    const dist = d.scoreDistribution ?? []
    dist.forEach((bucket) => {
      const match = String(bucket.range ?? '').match(/(\d+)-(\d+)/)
      if (match) {
        const lo = parseInt(match[1], 10)
        const c = bucket.count ?? 0
        const c1 = Math.floor(c / 2)
        const c2 = Math.ceil(c / 2)
        if (lo >= 0 && lo < 10) counts[lo] += c1
        if (lo + 1 < 10) counts[lo + 1] += c2
      }
    })
    const questions = (d.questions ?? []).map((q) => {
      const totalAnswers = q.answerCount ?? d.finalizedAttempts ?? 1
      const goodCount = Math.round((q.goodAnswerRate ?? 0) * totalAnswers)
      return {
        order: q.orderNo,
        text: q.content,
        avg: q.averageScore ?? 0,
        good: goodCount,
        maxScore: q.maxScore ?? 2.5,
      }
    })
    const session = {
      id: sessionId,
      title: d.examTitle ?? rawSess?.title ?? 'Exam Session',
      courseCode: rawSess?.courseCode ?? '',
      classCode: rawSess?.classCode ?? null,
    }
    return {
      session,
      counts,
      confirmed: d.finalizedAttempts ?? 0,
      waiting: d.pendingReviewAttempts ?? 0,
      rows: d.completedAttempts ?? 0,
      questions,
    }
  },

  exportGradeSheet: async (sessionId) => {
    const res = await api.download(`/api/reports/exam-sessions/${enc(sessionId)}/grade-sheet`, `${sessionId}_grades.csv`)
    return { fileName: res?.fileName ?? `${sessionId}_grades.csv`, rows: 0, confirmed: 0, pending: 0 }
  },
}

// Exam configuration (F7, lecturer)
export const examConfigApi = {
  myCourses: async () => {
    const res = await api.get('/api/courses/mine')
    return (Array.isArray(res) ? res : []).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
    }))
  },

  list: async () => {
    const res = await api.get('/api/exam-sessions')
    const now = new Date()
    return (Array.isArray(res) ? res : []).map((s) => {
      const start = s.startTime ? new Date(s.startTime) : null
      const end = s.endTime ? new Date(s.endTime) : null
      const phase = s.status === 'Draft' ? 'Draft'
        : (start && end && start <= now && now <= end) ? 'Open now'
        : (end && now > end) ? 'Closed'
        : 'Published'
      return {
        id: s.id,
        title: s.title,
        courseCode: s.courseCode,
        courseName: s.courseCode,
        startAt: s.startTime ?? null,
        endAt: s.endTime ?? null,
        phase,
        status: phase,
        questionCount: s.questionCount ?? 0,
        students: 2,
        taken: phase === 'Closed' ? 2 : (phase === 'Open now' ? 1 : 0),
        toReview: phase === 'Closed' || phase === 'Open now' ? 1 : 0,
        answering: 0,
        classCode: s.classCode ?? null,
      }
    })
  },

  create: (body) => api.post('/api/exam-sessions', body),

  get: async (id) => {
    const s = await api.get(`/api/exam-sessions/${enc(id)}`)
    if (!s) return null
    const start = s.startTime ? new Date(s.startTime) : null
    const end = s.endTime ? new Date(s.endTime) : null
    const now = new Date()
    const phase = s.status === 'Draft' ? 'Draft'
      : (start && end && start <= now && now <= end) ? 'Open now'
      : (end && now > end) ? 'Closed'
      : 'Published'
    return {
      id: s.id,
      title: s.title,
      courseId: s.courseId,
      courseCode: s.courseCode,
      courseName: s.courseName ?? s.courseCode,
      classCode: s.classCode ?? null,
      status: s.status,
      phase,
      startAt: s.startTime ?? null,
      endAt: s.endTime ?? null,
      timeLimitSeconds: s.timeLimitPerQuestion ?? 90,
      maxFollowUps: s.maxFollowUps ?? 2,
      questions: (s.questions ?? []).map((q) => ({
        id: q.id ?? q.questionId,
        text: q.content ?? q.text,
        short: q.shortContent ?? (q.content ? q.content.slice(0, 40) : ''),
        rubric: {
          maxScore: q.maxScore ?? 2.5,
          criteria: q.rubricCriteria ?? q.criteria ?? [],
        },
      })),
      participants: s.participants ?? [],
    }
  },
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
