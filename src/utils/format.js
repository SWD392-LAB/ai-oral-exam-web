const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad2 = (n) => String(n).padStart(2, '0')

export const formatTime = (date) => {
  const d = new Date(date)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// "Today", "Tomorrow", "Yesterday" or "Tue 13 Oct"
export const formatDay = (date, now = new Date()) => {
  const d = new Date(date)
  const n = new Date(now)
  if (sameDay(d, n)) return 'Today'
  const t = new Date(n); t.setDate(n.getDate() + 1)
  if (sameDay(d, t)) return 'Tomorrow'
  const y = new Date(n); y.setDate(n.getDate() - 1)
  if (sameDay(d, y)) return 'Yesterday'
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export const formatLongDay = (date) => {
  const d = new Date(date)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// "Tue 13 Oct, 13:00 to 15:00" / "Today, 15:30 to 17:30"
export const formatWindow = (startAt, endAt, now) =>
  startAt ? `${formatDay(startAt, now)}, ${formatTime(startAt)} to ${formatTime(endAt)}` : 'Not set'

// 88 -> "1:28"
export const formatClock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`
}

export const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000))

// Scores are kept to quarter points and shown with one decimal when they can be (7.5, 7.25)
export const formatScore = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '–'
  const q = Math.round(v * 4) / 4
  return Math.abs(q * 2 - Math.round(q * 2)) < 1e-9 ? q.toFixed(1) : q.toFixed(2)
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export { pad2 }
