// Names follow the use cases, ERD and class diagram (README, FOUNDATION-01).

export const UserRole = { Student: 'Student', Lecturer: 'Lecturer', Administrator: 'Administrator' }

// Stored session status. "Open now" and "Closed" come from the time window once published.
export const SessionStatus = { Draft: 'Draft', Published: 'Published', Closed: 'Closed' }

export const AttemptStatus = { InProgress: 'InProgress', PendingReview: 'PendingReview', Finalized: 'Finalized' }

// What the server answers after each submitted answer
export const Outcome = { FollowUp: 'FollowUp', NextQuestion: 'NextQuestion', Completed: 'Completed' }

export const TurnType = { Main: 'Main', FollowUp: 'FollowUp' }

// How a published session reads to people, from its window
export const sessionPhase = (session, now = Date.now()) => {
  if (session.status === SessionStatus.Draft) return 'Draft'
  if (!session.startAt) return 'Published'
  const t = typeof now === 'number' ? now : now.getTime()
  if (t >= new Date(session.endAt).getTime()) return 'Closed'
  if (t >= new Date(session.startAt).getTime()) return 'Open now'
  return 'Published'
}
