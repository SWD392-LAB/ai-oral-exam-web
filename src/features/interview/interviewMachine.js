// UI state machine of the exam room (FE-INT-02). It mirrors the attempt states agreed in BE-AI-01:
//   WAITING        loading the attempt
//   QUESTION       AIVES reads the question (or a follow-up) aloud; the answer clock has not started
//   LISTENING      the student answers; the clock counts down and runs out into an automatic submit
//   PROCESSING     the answer is saved; the server decides: follow-up, next question or done
//   QUESTION_DONE  a main question and its follow-ups are finished (a short pause before the next)
//   TURN           the revolving lantern turns to the next question or follow-up (FOLLOW_UP when it is one)
//   COMPLETED      the attempt is finished or the session closed; the room hands over to AttemptDone
// READY is the instant between WAITING and QUESTION, so it has no screen of its own.

export const Phase = {
  WAITING: 'WAITING',
  QUESTION: 'QUESTION',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  QUESTION_DONE: 'QUESTION_DONE',
  TURN: 'TURN',
  COMPLETED: 'COMPLETED',
}

export const initialRoom = { phase: Phase.WAITING, attempt: null, previous: null, next: null, answerStartedAt: null, seq: 0 }

// attempt: the server's attempt state (current question, answered turns, session)
export function roomReducer(s, e) {
  const seq = s.seq + 1
  switch (e.type) {
    case 'LOADED':
      if (e.attempt.status !== 'InProgress') return { ...s, seq, attempt: e.attempt, phase: Phase.COMPLETED }
      return { ...s, seq, attempt: e.attempt, phase: Phase.QUESTION }
    case 'READ_DONE':
      return s.phase === Phase.QUESTION ? { ...s, seq, phase: Phase.LISTENING, answerStartedAt: e.at } : s
    case 'SUBMIT':
      return s.phase === Phase.LISTENING ? { ...s, seq, phase: Phase.PROCESSING, answerSeconds: e.seconds } : s
    case 'OUTCOME': {
      if (e.outcome === 'Completed') return { ...s, seq, phase: Phase.COMPLETED, attempt: e.attempt }
      const patch = { seq, previous: s.attempt, next: e.attempt, attempt: e.attempt }
      return e.outcome === 'FollowUp'
        ? { ...s, ...patch, phase: Phase.TURN, attempt: s.attempt }
        : { ...s, ...patch, phase: Phase.QUESTION_DONE, attempt: s.attempt }
    }
    case 'QUESTION_DONE_SHOWN':
      return s.phase === Phase.QUESTION_DONE ? { ...s, seq, phase: Phase.TURN } : s
    case 'TURN_DONE':
      return s.phase === Phase.TURN ? { ...s, seq, phase: Phase.QUESTION, attempt: s.next, previous: null, next: null } : s
    case 'FAILED':
      // the answer could not be saved: back to answering so nothing is lost
      return { ...s, seq, phase: Phase.LISTENING }
    default:
      return s
  }
}
