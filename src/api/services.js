// REST endpoints, grouped by backend module. Paths not yet in the FOUNDATION-02 contract are
// proposals; keep them here so changing one is a single edit.
import { api } from './client.js'

const enc = encodeURIComponent

// AI and speech settings: the API returns a list of configurations (one active per service type)
const AI_TYPES = { stt: 'STT', tts: 'TTS', llm: 'LLM' }
const AI_LANGUAGE_FROM_API = { Vietnamese: 'vi', English: 'en' }
const AI_LANGUAGE_TO_API = { vi: 'Vietnamese', en: 'English' }
const activeAiConfig = (list, serviceType) =>
  list.find((c) => c.serviceType === serviceType && c.isActive) ?? list.find((c) => c.serviceType === serviceType) ?? null
async function readAiSettings() {
  const res = await api.get('/api/admin/ai-settings')
  const list = Array.isArray(res) ? res : []
  const providers = Object.fromEntries(Object.entries(AI_TYPES).map(([k, type]) => [
    k, { endpoint: activeAiConfig(list, type)?.endpointUrl ?? '', key: 'saved' },
  ]))
  // one language for the page: the one of the active speech-to-text configuration
  const language = AI_LANGUAGE_FROM_API[(activeAiConfig(list, 'STT') ?? activeAiConfig(list, 'LLM'))?.language] ?? 'vi'
  return { language, providers }
}

// Audit log: the API gives action, target entity and who; the page groups entries by category
const humanize = (name = '') => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
function auditCategory(action = '', entity = '') {
  if (entity === 'User') return /Role/i.test(action) ? 'role' : /Deactivat/i.test(action) ? 'deact' : /Create|Import/i.test(action) ? 'created' : 'user'
  if (entity === 'Course') return /Lecturer/i.test(action) ? 'assign' : 'course'
  if (entity === 'AIServiceConfig') return 'ai'
  return 'other'
}
const AUDIT_KIND = { User: 'user', Course: 'course', AIServiceConfig: 'ai' }

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
  get: async (attemptId) => {
    const [report, reviewAttempt] = await Promise.all([
      api.get(`/api/reports/attempts/${enc(attemptId)}`).catch(() => null),
      api.get(`/api/interview-attempts/${enc(attemptId)}/review`).catch(() => null),
    ])
    const r = report || {}
    const a = reviewAttempt || {}
    if (!report && !reviewAttempt) {
      throw new Error('Attempt not found or cannot be reviewed.')
    }
    const sessionId = a.examSessionId ?? r.examSessionId ?? ''
    const status = a.status ?? r.status ?? 'PendingReview'
    const finalScore = a.review?.finalScore ?? r.finalScore ?? null
    const comment = a.review?.comment ?? r.lecturerComment ?? ''
    const confirmedAt = a.review?.reviewedAt ?? r.completedAt ?? r.startedAt

    return {
      id: attemptId,
      status,
      startedAt: a.startedAt ?? r.startedAt,
      endedAt: a.completedAt ?? r.completedAt ?? r.startedAt,
      endReason: 'Finished',
      student: {
        fullName: r.studentName ?? 'Student',
        studentCode: r.studentCode ?? '',
      },
      session: {
        id: sessionId,
        title: r.examTitle ?? 'Viva Exam',
        classCode: '',
        courseCode: r.courseCode ?? '',
        timeLimitSeconds: 60,
      },
      aiTotal: r.suggestedTotalScore ?? 0,
      review: finalScore != null ? {
        finalScore,
        comment,
        confirmedAt,
      } : null,
      questions: (r.questions ?? []).map((q, i) => ({
        index: i,
        order: q.orderNo ?? (i + 1),
        text: q.content ?? '',
        maxScore: q.maxScore ?? 2.5,
        reached: (q.turns?.length ?? 0) > 0 || q.suggestedScore != null,
        ai: {
          score: q.suggestedScore ?? 0,
          comment: q.aiFeedback ?? '',
        },
        turns: (q.turns ?? []).map((t) => {
          const dur = t.answeredAt && t.askedAt
            ? Math.max(1, Math.round((new Date(t.answeredAt) - new Date(t.askedAt)) / 1000))
            : 30
          return {
            type: t.type === 'FollowUp' ? 'FollowUp' : 'Main',
            questionText: t.questionText,
            answerText: t.answerTranscript ?? '',
            durationSeconds: dur,
          }
        }),
      })),
      next: null,
    }
  },
  confirm: async (attemptId, finalScore, comment) => {
    const res = await api.put(`/api/interview-attempts/${enc(attemptId)}/score-review`, {
      finalScore: Number(finalScore),
      comment: comment ?? '',
    })
    return {
      status: 'Finalized',
      review: {
        finalScore: res?.finalScore ?? Number(finalScore),
        comment: res?.comment ?? comment ?? '',
        confirmedAt: res?.reviewedAt ?? new Date().toISOString(),
      },
    }
  },
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
    let res = await api.get('/api/courses/mine').catch(() => null)
    if (!res || !Array.isArray(res) || res.length === 0) {
      res = await api.get('/api/admin/courses').catch(() => [])
    }
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
      const start = s.startTime ? new Date(s.startTime) : (s.startAt ? new Date(s.startAt) : null)
      const end = s.endTime ? new Date(s.endTime) : (s.endAt ? new Date(s.endAt) : null)
      const phase = s.status === 'Draft' ? 'Draft'
        : (s.status === 'Closed' || (end && now > end)) ? 'Closed'
        : (start && end && start <= now && now <= end) ? 'Open now'
        : (s.status === 'Published' ? 'Published' : 'Draft')
      const qCount = s.questionCount ?? (Array.isArray(s.questions) ? s.questions.length : 0)
      const sCount = s.participantCount ?? s.participants?.length ?? s.studentCount ?? 0
      return {
        id: s.id,
        title: s.title || 'Untitled Exam Session',
        courseCode: s.courseCode || 'SWD392',
        courseName: s.courseName || s.courseCode || 'SWD392',
        startAt: s.startTime ?? s.startAt ?? null,
        endAt: s.endTime ?? s.endAt ?? null,
        phase,
        status: phase,
        questionCount: qCount,
        students: sCount,
        // counts come from the API (attempts in PendingReview or Finalized / in PendingReview)
        taken: s.takenCount ?? 0,
        toReview: s.toReviewCount ?? 0,
        answering: 0,
        classCode: s.classCode ?? null,
      }
    })
  },

  get: async (id) => {
    const [s, participantsRaw] = await Promise.all([
      api.get(`/api/exam-sessions/${enc(id)}`),
      api.get(`/api/exam-sessions/${enc(id)}/participants`).catch(() => []),
    ])
    if (!s) return null
    const start = s.startTime ? new Date(s.startTime) : (s.startAt ? new Date(s.startAt) : null)
    const end = s.endTime ? new Date(s.endTime) : (s.endAt ? new Date(s.endAt) : null)
    const now = new Date()
    const phase = s.status === 'Draft' ? 'Draft'
      : (s.status === 'Closed' || (end && now > end)) ? 'Closed'
      : (start && end && start <= now && now <= end) ? 'Open now'
      : (s.status === 'Published' ? 'Published' : 'Draft')

    const questions = (s.questions ?? []).map((q, idx) => {
      const qId = q.id ?? q.questionId ?? `q-${idx + 1}`
      const text = q.content ?? q.text ?? ''
      const criteriaList = q.rubricCriteria ?? q.criteria ?? []
      const hasCriteria = Array.isArray(criteriaList) ? criteriaList.length > 0 : !!criteriaList
      const rubricText = typeof criteriaList === 'string'
        ? criteriaList
        : (Array.isArray(criteriaList) && criteriaList.length > 0 ? criteriaList.map((c) => c.description ?? c.desc ?? '').join('\n') : '')
      const maxPts = q.maxScore ?? (Array.isArray(criteriaList) && criteriaList[0]?.maxPoints ? criteriaList[0].maxPoints : 2.5)

      return {
        id: qId,
        orderNo: q.orderNo ?? (idx + 1),
        text,
        short: text.length > 40 ? text.slice(0, 40) + '…' : text,
        rubric: (hasCriteria || q.rubric) ? {
          maxScore: maxPts,
          criteria: rubricText,
        } : null,
      }
    })

    const participantsList = Array.isArray(participantsRaw) && participantsRaw.length > 0
      ? participantsRaw
      : (Array.isArray(s.participants) ? s.participants : [])

    const participants = participantsList.map((p, idx) => ({
      userId: p.studentId ?? p.userId ?? p.id ?? `u-${idx + 1}`,
      fullName: p.studentName ?? p.fullName ?? p.name ?? 'Student',
      studentCode: p.studentCode ?? '',
      email: p.email ?? '',
      status: p.status ?? 'Registered',
    }))

    const missingRubrics = questions.filter((q) => !q.rubric || !q.rubric.criteria).map((q) => q.id)
    const hasWindow = !!(s.startTime || s.startAt) && !!(s.endTime || s.endAt)

    const publishCheck = {
      hasQuestion: questions.length > 0,
      missingRubrics,
      hasStudent: participants.length > 0,
      hasWindow,
    }

    return {
      id: s.id,
      title: s.title || '',
      courseId: s.courseId,
      courseCode: s.courseCode || '',
      courseName: s.courseName ?? s.courseCode ?? '',
      classCode: s.classCode ?? null,
      status: s.status,
      phase,
      startAt: s.startTime ?? s.startAt ?? null,
      endAt: s.endTime ?? s.endAt ?? null,
      timeLimitSeconds: s.timeLimitPerAnswerSeconds ?? s.timeLimitPerQuestion ?? 90,
      maxFollowUps: s.maxFollowUps ?? 2,
      questions,
      participants,
      skippedRows: s.skippedRows ?? [],
      publishCheck,
    }
  },

  create: async (body = {}) => {
    let courseId = body.courseId
    if (!courseId) {
      const myCourses = await examConfigApi.myCourses().catch(() => [])
      if (myCourses.length > 0) {
        courseId = myCourses[0].id
      }
    }
    const payload = {
      courseId,
      title: body.title?.trim() || 'New Exam Session',
      startTime: body.startTime ?? body.startAt ?? new Date().toISOString(),
      endTime: body.endTime ?? body.endAt ?? new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      timeLimitPerAnswerSeconds: body.timeLimitPerAnswerSeconds ?? body.timeLimitSeconds ?? body.timeLimitPerQuestion ?? 90,
      maxFollowUps: body.maxFollowUps ?? 2,
    }
    const res = await api.post('/api/exam-sessions', payload)
    const createdId = res?.id ?? res
    return examConfigApi.get(createdId)
  },

  update: async (id, body) => {
    const payload = {
      title: body.title || 'Untitled Exam Session',
      startTime: body.startAt ?? body.startTime ?? new Date().toISOString(),
      endTime: body.endAt ?? body.endTime ?? new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      timeLimitPerAnswerSeconds: body.timeLimitSeconds ?? body.timeLimitPerAnswerSeconds ?? 90,
      maxFollowUps: body.maxFollowUps ?? 2,
    }
    await api.put(`/api/exam-sessions/${enc(id)}`, payload)
    return examConfigApi.get(id)
  },

  importQuestions: async (id, questionsOrRows) => {
    const questions = (questionsOrRows || []).map((q, idx) => {
      if (typeof q === 'string') {
        return { orderNo: idx + 1, content: q }
      }
      return {
        orderNo: q.orderNo ?? q.order ?? (idx + 1),
        content: q.content ?? q.text ?? '',
      }
    })
    await api.post(`/api/exam-sessions/${enc(id)}/questions/import`, { questions })
    return examConfigApi.get(id)
  },

  saveRubric: async (id, questionId, criteria, maxScore) => {
    let payloadCriteria = []
    if (Array.isArray(criteria)) {
      payloadCriteria = criteria.map((c, idx) => ({
        id: c.id,
        orderNo: c.orderNo ?? c.order ?? (idx + 1),
        description: c.description ?? c.desc ?? String(c),
        maxPoints: Number(c.maxPoints ?? c.points ?? maxScore ?? 2.5),
      }))
    } else {
      payloadCriteria = [
        {
          orderNo: 1,
          description: typeof criteria === 'string' ? criteria : JSON.stringify(criteria),
          maxPoints: Number(maxScore) || 2.5,
        },
      ]
    }
    await api.put(`/api/exam-sessions/${enc(id)}/questions/${enc(questionId)}/rubric`, {
      criteria: payloadCriteria,
    })
    return examConfigApi.get(id)
  },

  removeQuestion: async (id, questionId) => {
    await api.del(`/api/exam-sessions/${enc(id)}/questions/${enc(questionId)}`)
    return examConfigApi.get(id)
  },

  importParticipants: async (id, rowsOrStudents) => {
    const studentCodes = (rowsOrStudents || [])
      .map((r) => (typeof r === 'string' ? r : (r.studentCode ?? r.code ?? '')).trim())
      .filter(Boolean)
    const res = await api.post(`/api/exam-sessions/${enc(id)}/participants/import`, {
      studentCodes,
    })
    const detail = await examConfigApi.get(id)
    if (res && Array.isArray(res.skippedStudentCodes) && res.skippedStudentCodes.length > 0) {
      detail.skippedRows = res.skippedStudentCodes.map((code, idx) => {
        const original = (rowsOrStudents || []).find((r) => (r.studentCode ?? r.code ?? '') === code)
        return {
          row: original?.row ?? (idx + 1),
          studentCode: code,
          fullName: original?.name ?? original?.fullName ?? code,
          email: original?.email ?? '',
          reason: 'Student not found in system or not in Student role',
        }
      })
    }
    return detail
  },

  publish: async (id) => {
    await api.post(`/api/exam-sessions/${enc(id)}/publish`)
    return examConfigApi.get(id)
  },

  close: async (id) => {
    await api.post(`/api/exam-sessions/${enc(id)}/close`)
    return examConfigApi.get(id)
  },
}

// Administration (F7, administrator)
export const adminApi = {
  users: async () => {
    const res = await api.get('/api/admin/users')
    return (Array.isArray(res) ? res : []).map((u) => ({
      id: u.id,
      fullName: u.fullName ?? u.username ?? 'User',
      email: u.email ?? '',
      accountName: u.username ?? u.accountName ?? '',
      role: u.role ?? 'Student',
      active: u.isActive !== undefined ? u.isActive : (u.active !== undefined ? u.active : true),
      googleLinked: u.googleLinked ?? false,
      createdAt: u.createdAt,
    }))
  },

  // The API creates the Keycloak account and takes the id from it; a student needs studentCode, a lecturer lecturerCode.
  createUser: async (fullName, email, role, code) => {
    const res = await api.post('/api/admin/users', {
      fullName,
      email,
      role,
      studentCode: role === 'Student' ? code : null,
      lecturerCode: role === 'Lecturer' ? code : null,
    })
    return {
      id: res?.id,
      fullName: res?.fullName ?? fullName,
      email: res?.email ?? email,
      accountName: res?.username ?? '',
      role: res?.role ?? role,
      active: res?.isActive !== undefined ? res?.isActive : true,
      googleLinked: false,
    }
  },

  changeRole: async (id, role) => {
    const res = await api.patch(`/api/admin/users/${enc(id)}/role`, { role })
    return {
      id,
      role: res?.role ?? role,
      fullName: res?.fullName,
      email: res?.email,
      accountName: res?.username,
      active: res?.isActive !== undefined ? res?.isActive : true,
    }
  },

  deactivate: async (id) => {
    const res = await api.post(`/api/admin/users/${enc(id)}/deactivate`)
    return {
      id,
      active: false,
      fullName: res?.fullName,
      email: res?.email,
      accountName: res?.username,
      role: res?.role,
    }
  },

  resendSetupLink: (id) => api.post(`/api/admin/users/${enc(id)}/setup-link`).catch(() => null),

  courses: async () => {
    const res = await api.get('/api/admin/courses')
    const list = Array.isArray(res) ? res : []
    return await Promise.all(
      list.map(async (c) => {
        const lects = await api.get(`/api/courses/${enc(c.id)}/lecturers`).catch(() => [])
        const lecturerIds = (Array.isArray(lects) ? lects : []).map((l) => l.id ?? l.lecturerId)
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          lecturerIds,
          sessions: c.sessions ?? [],
        }
      })
    )
  },

  createCourse: async (body) => {
    const lecturerIds = body.lecturerIds ?? []
    const firstLecturerId = lecturerIds[0]
    if (!firstLecturerId) {
      throw new Error('A lecturer is required to create a course.')
    }
    const res = await api.post('/api/admin/courses', {
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      lecturerId: firstLecturerId,
    })
    const courseId = res?.id
    if (courseId && lecturerIds.length > 1) {
      for (let i = 1; i < lecturerIds.length; i++) {
        await api.post(`/api/courses/${enc(courseId)}/lecturers/${enc(lecturerIds[i])}`).catch(() => {})
      }
    }
    return {
      id: courseId,
      code: res?.code ?? body.code,
      name: res?.name ?? body.name,
      lecturerIds,
      sessions: [],
    }
  },

  updateCourse: async (id, body) => {
    const res = await api.put(`/api/admin/courses/${enc(id)}`, {
      name: body.name.trim(),
    })
    const desired = body.lecturerIds ?? []
    const current = await api.get(`/api/courses/${enc(id)}/lecturers`).catch(() => [])
    const currentIds = (Array.isArray(current) ? current : []).map((l) => l.id ?? l.lecturerId)
    for (const lid of desired) {
      if (!currentIds.includes(lid)) {
        await api.post(`/api/courses/${enc(id)}/lecturers/${enc(lid)}`).catch(() => {})
      }
    }
    for (const lid of currentIds) {
      if (!desired.includes(lid)) {
        await api.del(`/api/courses/${enc(id)}/lecturers/${enc(lid)}`).catch(() => {})
      }
    }
    return {
      id,
      code: res?.code ?? body.code,
      name: res?.name ?? body.name,
      lecturerIds: desired,
      sessions: res?.sessions ?? [],
    }
  },

  deleteCourse: (id) => api.del(`/api/courses/${enc(id)}`),

  aiSettings: () => readAiSettings(),

  // The API keeps one active configuration per service type (STT, TTS, LLM), each with its own language,
  // and saves one type per call. The page shows one language and one endpoint per type.
  saveAiSettings: async (body) => {
    const list = await api.get('/api/admin/ai-settings')
    const language = AI_LANGUAGE_TO_API[body.language]
    const jobs = Object.entries(AI_TYPES)
      .map(([k, serviceType]) => {
        const current = activeAiConfig(list, serviceType)
        const p = body.providers?.[k] ?? {}
        const endpoint = (p.endpoint ?? '').trim()
        // 'saved' only marks that a key is stored; it is never a key to send
        const key = p.key && p.key !== 'saved' ? p.key : ''
        const changed = !current || current.endpointUrl !== endpoint || current.language !== language || !!key
        return { serviceType, current, endpoint, key, changed }
      })
      .filter((j) => j.changed)
    // the API checks the key on every save and never returns it, so a change needs a new key
    const missing = jobs.filter((j) => !j.key).map((j) => j.serviceType)
    if (missing.length) throw new Error(`Enter a new API key for ${missing.join(', ')}: the server asks for the key every time a provider is saved.`)
    for (const j of jobs) {
      await api.put('/api/admin/ai-settings', {
        serviceType: j.serviceType,
        providerName: j.current?.providerName ?? j.serviceType,
        endpointUrl: j.endpoint,
        apiKey: j.key,
        language,
        isActive: true,
      })
    }
    return readAiSettings()
  },

  testEndpoint: (kind, endpoint) => api.post('/api/admin/ai-settings/test', { kind, endpoint }),

  auditLog: async (query) => {
    const res = await api.get('/api/admin/audit-logs', query)
    return (Array.isArray(res) ? res : []).map((e) => ({
      id: e.id,
      at: e.createdAt,
      actor: e.userName ?? e.email ?? 'System',
      action: humanize(e.action),
      details: '',
      target: humanize(e.targetEntity),
      kind: AUDIT_KIND[e.targetEntity] ?? 'other',
      cat: auditCategory(e.action, e.targetEntity),
    }))
  },
}
