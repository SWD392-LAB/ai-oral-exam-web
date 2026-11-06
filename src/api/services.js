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
    k, { endpoint: activeAiConfig(list, type)?.endpointUrl ?? '', key: activeAiConfig(list, type)?.hasApiKey ? 'saved' : 'none' },
  ]))
  // one language for the page: the one of the active speech-to-text configuration
  const language = AI_LANGUAGE_FROM_API[(activeAiConfig(list, 'STT') ?? activeAiConfig(list, 'LLM'))?.language] ?? 'vi'
  return { language, providers }
}

// Audit log: the API gives action, target entity, a description and who; the page groups entries by category.
// Older rows use other names (CreateSession, AIServiceConfig, ...), so entity and action are matched loosely.
const ENTITY_NAMES = {
  user: 'User', course: 'Course', examsession: 'Exam session', question: 'Question', rubric: 'Rubric',
  aiserviceconfig: 'AI service settings', interviewattempt: 'Interview attempt',
}
const humanize = (name = '') => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
const entityName = (entity = '') => ENTITY_NAMES[entity.toLowerCase()] ?? humanize(entity)
function auditCategory(action = '', entity = '') {
  const e = entity.toLowerCase()
  if (e === 'user') return /Role/i.test(action) ? 'role' : /Deactivat/i.test(action) ? 'deact' : /Create|Import/i.test(action) ? 'created' : 'user'
  if (e === 'course') return /Lecturer/i.test(action) ? 'assign' : 'course'
  if (e === 'aiserviceconfig') return 'ai'
  return 'other'
}
const AUDIT_KIND = { user: 'user', course: 'course', aiserviceconfig: 'ai' }

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
  // mock only: the mock server changes a username
  changeUsername: (username) => api.patch('/api/account', { username }),
  // real API: changes the account's full name (display name in the AIVES database; Keycloak is not changed)
  changeFullName: (fullName) => api.patch('/api/auth/me', { fullName }),
}

export const rubricApi = {
  getPlatformRubric: async () => api.get('/api/platform-rubric'),
}

// Question Bank & Attach (Feature 1 & Phase 2 Integration)
export const questionBankApi = {
  list: (courseId, status) => api.get(`/api/courses/${enc(courseId)}/question-bank${status ? `?status=${enc(status)}` : ''}`),
  get: (courseId, itemId) => api.get(`/api/courses/${enc(courseId)}/question-bank/${enc(itemId)}`),
  create: (courseId, { topic, bloom, content }) => api.post(`/api/courses/${enc(courseId)}/question-bank`, { topic, bloom, content }),
  updateDraft: (courseId, itemId, { topic, bloom, content }) => api.put(`/api/courses/${enc(courseId)}/question-bank/${enc(itemId)}`, { topic, bloom, content }),
  approve: (courseId, itemId) => api.post(`/api/courses/${enc(courseId)}/question-bank/${enc(itemId)}/approve`),
  reject: (courseId, itemId) => api.post(`/api/courses/${enc(courseId)}/question-bank/${enc(itemId)}/reject`),
  attachToSession: (sessionId, itemIds) => api.post(`/api/exam-sessions/${enc(sessionId)}/questions/from-bank`, { itemIds }),
}

// Course Materials (Feature 1 Complete - Phase 3)
export const courseMaterialsApi = {
  list: (courseId) => api.get(`/api/courses/${enc(courseId)}/materials`),
  upload: (courseId, formData) => api.postFormData(`/api/courses/${enc(courseId)}/materials`, formData),
  ingest: (courseId, materialId) => api.post(`/api/courses/${enc(courseId)}/materials/${enc(materialId)}/ingest`),
}

// AI Question Generation (Feature 1 Complete - Phase 3)
export const questionGenerationApi = {
  generate: (courseId, payload) => api.post(`/api/courses/${enc(courseId)}/question-bank/generations`, payload),
}

// AI Viva Interview (F3 & Phase 3 Integration)
export const interviewApi = {
  mySessions: async () => {
    let list
    try {
      list = await api.get('/api/interview/my-sessions')
    } catch {
      list = await api.get('/api/student/exam-sessions').catch(() => [])
    }
    const arr = Array.isArray(list) ? list : []
    return arr.map((s) => {
      const sessionId = s.examSessionId ?? s.id
      const startAt = s.startTime ?? s.startAt
      const endAt = s.endTime ?? s.endAt
      const now = new Date().getTime()
      const startMs = startAt ? new Date(startAt).getTime() : 0
      const endMs = endAt ? new Date(endAt).getTime() : 0
      const isOpen = s.isOpenNow !== undefined ? s.isOpenNow : (startMs <= now && now <= endMs)
      const phase = s.sessionStatus === 'Closed' || s.phase === 'Closed' ? 'Closed' : (isOpen ? 'Open now' : 'Published')
      const latestAttemptId = s.latestAttemptId ?? s.attempt?.id ?? null
      const latestStatus = s.latestAttemptStatus ?? s.attempt?.status ?? null
      return {
        ...s,
        id: sessionId,
        examSessionId: sessionId,
        title: s.title || 'Viva Exam',
        courseCode: s.courseCode || 'SWD392',
        courseName: s.courseName || s.courseCode || 'SWD392',
        startAt,
        endAt,
        startTime: startAt,
        endTime: endAt,
        phase,
        sessionStatus: s.sessionStatus ?? (phase === 'Closed' ? 'Closed' : 'Published'),
        isOpenNow: isOpen,
        questionCount: s.questionCount ?? 0,
        timeLimitSeconds: s.timeLimitPerAnswerSeconds ?? s.timeLimitSeconds ?? 90,
        timeLimitPerAnswerSeconds: s.timeLimitPerAnswerSeconds ?? s.timeLimitSeconds ?? 90,
        maxFollowUps: s.maxFollowUps ?? 2,
        participantStatus: s.participantStatus ?? 'Registered',
        latestAttemptId,
        latestAttemptStatus: latestStatus,
        attempt: latestAttemptId ? {
          id: latestAttemptId,
          status: latestStatus,
          endedAt: latestStatus === 'Finalized' || latestStatus === 'PendingReview' ? endAt : null,
          finalScore: s.attempt?.finalScore ?? null,
          maxScore: s.attempt?.maxScore ?? 10,
        } : null,
      }
    })
  },
  mySession: async (id) => {
    const list = await interviewApi.mySessions()
    return (list || []).find((s) => s.examSessionId === id || s.id === id) || null
  },
  start: (examSessionId) => api.post('/api/interview-attempts', { examSessionId }),
  get: async (attemptId) => {
    const raw = await api.get(`/api/interview-attempts/${enc(attemptId)}`)
    if (!raw) return null
    const currentTurn = raw.currentTurn
    const isFollowUp = currentTurn?.type === 'FollowUp'
    const followUpNumber = isFollowUp ? Math.max(1, (currentTurn?.turnNo ?? 2) - 1) : 0
    const qIndex = (currentTurn?.questionOrderNo ?? 1) - 1
    const totalQuestions = raw.totalQuestions ?? raw.session?.questionCount ?? 1
    const limit = raw.timeLimitSeconds ?? raw.session?.timeLimitSeconds ?? 90
    const maxFu = raw.maxFollowUps ?? raw.session?.maxFollowUps ?? 2
    const title = raw.examTitle ?? raw.session?.title ?? 'Viva Exam'
    const courseCode = raw.courseCode ?? raw.session?.courseCode ?? 'SWD392'

    return {
      ...raw,
      id: raw.attemptId ?? raw.id,
      attemptId: raw.attemptId ?? raw.id,
      status: raw.status,
      startedAt: raw.startedAt,
      endedAt: raw.completedAt ?? raw.endedAt,
      session: {
        id: raw.examSessionId ?? raw.session?.id,
        title,
        courseCode,
        questionCount: totalQuestions,
        timeLimitSeconds: limit,
        maxFollowUps: maxFu,
        endAt: raw.sessionEndAt ?? raw.session?.endAt ?? new Date(Date.now() + 4 * 3600000).toISOString(),
      },
      currentTurn: currentTurn ? {
        ...currentTurn,
        turnId: currentTurn.turnId,
        questionText: currentTurn.questionText,
        type: currentTurn.type,
        questionOrderNo: currentTurn.questionOrderNo,
        turnNo: currentTurn.turnNo,
      } : null,
      current: currentTurn ? {
        text: currentTurn.questionText,
        questionIndex: qIndex,
        followUpNumber: followUpNumber,
        type: currentTurn.type,
        turnId: currentTurn.turnId,
        mainText: isFollowUp ? 'Follow-up question' : '',
      } : (raw.current ?? null),
      answered: Array.isArray(raw.answered) && raw.answered.length > 0 ? raw.answered : Array.from({ length: raw.answeredQuestions || 0 }, (_, i) => ({
        index: i,
        reached: true,
        turns: [{ type: 'Main', durationSeconds: 30 }],
      })),
    }
  },
  submit: (attemptId, answerText, turnId) => api.post(`/api/interview-attempts/${enc(attemptId)}/responses`, { answerText, turnId }),
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
    const confirmedAt = a.review?.reviewedAt ?? a.review?.confirmedAt ?? r.completedAt ?? r.startedAt
    const reviewStatus = a.review?.status ?? (status === 'Finalized' ? 'Approved' : (finalScore != null ? 'Pending' : null))

    return {
      id: attemptId,
      status,
      startedAt: a.startedAt ?? r.startedAt,
      endedAt: a.completedAt ?? r.completedAt ?? r.startedAt,
      endReason: a.endReason ?? 'Finished',
      student: {
        fullName: r.studentName ?? a.student?.fullName ?? 'Student',
        studentCode: r.studentCode ?? a.student?.studentCode ?? '',
      },
      session: {
        id: sessionId,
        title: r.examTitle ?? a.session?.title ?? 'Viva Exam',
        classCode: a.session?.classCode ?? '',
        courseCode: r.courseCode ?? a.session?.courseCode ?? '',
        timeLimitSeconds: a.session?.timeLimitSeconds ?? 60,
      },
      aiTotal: r.suggestedTotalScore ?? a.aiTotal ?? 0,
      maxScore: r.maxTotalScore ?? (Array.isArray(r.questions) ? r.questions.reduce((sum, q) => sum + (q.maxScore ?? 0), 0) : 10),
      review: (finalScore != null || a.review != null) ? {
        finalScore: finalScore ?? 0,
        comment,
        confirmedAt,
        status: reviewStatus,
      } : null,
      questions: (r.questions ?? a.questions ?? []).map((q, i) => ({
        index: i,
        order: q.orderNo ?? (i + 1),
        text: q.content ?? q.text ?? '',
        maxScore: q.maxScore ?? 2.5,
        reached: (q.turns?.length ?? 0) > 0 || q.suggestedScore != null || q.reached,
        ai: {
          score: q.suggestedScore ?? q.ai?.score ?? 0,
          comment: q.aiFeedback ?? q.ai?.comment ?? '',
        },
        turns: (q.turns ?? []).map((t) => {
          const dur = t.durationSeconds ?? (t.answeredAt && t.askedAt
            ? Math.max(1, Math.round((new Date(t.answeredAt) - new Date(t.askedAt)) / 1000))
            : 30)
          return {
            type: t.type === 'FollowUp' ? 'FollowUp' : 'Main',
            questionText: t.questionText ?? t.question,
            answerText: t.answerTranscript ?? t.answerText ?? t.answer ?? '',
            durationSeconds: dur,
          }
        }),
      })),
      next: a.next ?? null,
    }
  },
  saveDraft: async (attemptId, finalScore, comment) => {
    const res = await api.put(`/api/interview-attempts/${enc(attemptId)}/score-review/draft`, {
      finalScore: Number(finalScore),
      comment: comment ?? '',
    })
    return {
      status: 'PendingReview',
      review: {
        finalScore: res?.finalScore ?? Number(finalScore),
        comment: res?.comment ?? comment ?? '',
        confirmedAt: res?.reviewedAt ?? new Date().toISOString(),
        status: 'Pending',
      },
    }
  },
  confirm: async (attemptId, finalScore, comment) => {
    let res
    try {
      res = await api.post(`/api/interview-attempts/${enc(attemptId)}/score-review/confirm`)
    } catch {
      res = await api.put(`/api/interview-attempts/${enc(attemptId)}/score-review`, {
        finalScore: Number(finalScore),
        comment: comment ?? '',
      })
    }
    return {
      status: 'Finalized',
      review: {
        finalScore: res?.finalScore ?? Number(finalScore),
        comment: res?.comment ?? comment ?? '',
        confirmedAt: res?.reviewedAt ?? new Date().toISOString(),
        status: 'Approved',
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
      maxScore: r.maxTotalScore ?? (Array.isArray(r.questions) ? r.questions.reduce((sum, q) => sum + (q.maxScore ?? 0), 0) : 10),
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
    // the backend may answer a plain array or a paged result { items, page, pageSize, totalCount, totalPages }
    return (Array.isArray(res) ? res : (res?.items ?? [])).map((s) => {
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
        // counts come from the API (attempts in PendingReview or Finalized / in PendingReview / in InProgress)
        taken: s.takenCount ?? 0,
        toReview: s.toReviewCount ?? 0,
        answering: s.inProgressCount ?? 0,
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

    const hasWindow = !!(s.startTime || s.startAt) && !!(s.endTime || s.endAt)

    const publishCheck = {
      hasQuestion: questions.length > 0,
      hasPlatformRubric: true,
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

  attachQuestionsFromBank: async (sessionId, itemIds) => {
    return questionBankApi.attachToSession(sessionId, itemIds)
  },

  getQuestions: async (sessionId) => {
    return api.get(`/api/exam-sessions/${enc(sessionId)}/questions`)
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
    // the backend may answer a plain array or a paged result { items, page, pageSize, totalCount, totalPages }
    return (Array.isArray(res) ? res : (res?.items ?? [])).map((u) => ({
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

  // A student needs studentCode and a lecturer lecturerCode, otherwise the API answers 400.
  changeRole: async (id, role, code) => {
    const res = await api.patch(`/api/admin/users/${enc(id)}/role`, {
      role,
      studentCode: role === 'Student' ? code : null,
      lecturerCode: role === 'Lecturer' ? code : null,
    })
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
        // the admin list carries the lecturers; older API versions need one more call per course
        const lects = Array.isArray(c.lecturers) ? c.lecturers : await api.get(`/api/courses/${enc(c.id)}/lecturers`).catch(() => [])
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
  // and saves one type per call; a blank key keeps the stored one. The page shows one language and one endpoint per type.
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
    // a blank key keeps the stored one; a service with no configuration yet needs a key
    const missing = jobs.filter((j) => !j.current && !j.key).map((j) => j.serviceType)
    if (missing.length) throw new Error(`Enter an API key for ${missing.join(', ')}.`)
    for (const j of jobs) {
      await api.put('/api/admin/ai-settings', {
        serviceType: j.serviceType,
        providerName: j.current?.providerName ?? j.serviceType,
        endpointUrl: j.endpoint,
        apiKey: j.key || null,
        language,
        isActive: true,
      })
    }
    return readAiSettings()
  },

  auditLog: async (query) => {
    const res = await api.get('/api/admin/audit-logs', query)
    return (Array.isArray(res) ? res : []).map((e) => ({
      id: e.id,
      at: e.createdAt,
      actor: e.userName ?? e.email ?? 'System',
      action: humanize(e.action),
      details: e.description ?? '',
      target: entityName(e.targetEntity),
      kind: AUDIT_KIND[(e.targetEntity ?? '').toLowerCase()] ?? 'other',
      cat: auditCategory(e.action, e.targetEntity),
    }))
  },
}
