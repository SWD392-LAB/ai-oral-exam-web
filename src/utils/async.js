// Resolves with the promise's value, but never sooner than `ms`, so a state such as
// "Sending the link…" or "Answer saved" stays on screen long enough to be read.
export const atLeast = (promise, ms) =>
  Promise.all([promise, new Promise((r) => setTimeout(r, ms))]).then(([value]) => value)
