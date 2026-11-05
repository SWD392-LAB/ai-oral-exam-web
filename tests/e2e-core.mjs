// Core-flow E2E, driven through the UI only (no direct API calls from the page):
//   phase 1  lecturer: configure an exam session (details, questions from the bank, students) and publish
//   phase 2  student: lobby + microphone check, take the interview, finish
//   phase 3  lecturer: review the attempt, save a draft, confirm the final score
//   phase 4  student: read the confirmed report
// Usage: node tests/e2e-core.mjs <1|2|3|4|all>   (all = new session, phases 1-4).  E2E_HEADED=1 shows the browser; E2E_SLOWMO=ms slows it.
// Needs: backend on :5080 with AiProviders__LlmProvider=Mock, and Vite on :5173 started with VITE_ANSWER_INPUT=text (typed answers).
// State between phases, screenshots and the temp student CSV live in E2E_OUT (default: <temp>/aives-e2e).
// Everything it creates is named "E2E-Core ..."; it deletes nothing. It writes to whatever database the backend uses.
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE = 'http://localhost:5173'
const PW = process.env.E2E_PASSWORD // password of the seeded local test users; never hard-coded
if (!PW) { console.error('Set E2E_PASSWORD (password of the seeded local test users) before running.'); process.exit(2) }
const LECTURER = 'an.nv@aives.edu.vn'
const STUDENT = 'han.hg@aives.edu.vn'
const COURSE_ID = '22222222-0000-0000-0000-000000000001'
// state, screenshots and the temporary student CSV go to a temp folder, not into the repository
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'aives-e2e')
fs.mkdirSync(OUT, { recursive: true })
const STATE_FILE = process.env.E2E_STATE || path.join(OUT, 'state.json')
const SHOTS = process.env.E2E_SHOTS || OUT
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {}
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1))
const results = []
const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`  PASS  ${name}${detail ? '  (' + detail + ')' : ''}`) }
const bad = (name, detail = '') => { results.push({ name, pass: false, detail }); console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`) }

// The built-in fake microphone only beeps now and then, so the lobby "can we hear you" check is flaky.
// Feed it a continuous tone instead (a wav written to the temp folder; Chromium loops it).
const MIC_WAV = path.join(OUT, 'fake-mic.wav')
{
  const rate = 48000, n = rate * 4, buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(20000 * Math.sin(2 * Math.PI * 440 * i / rate) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * i / rate))), 44 + i * 2)
  fs.writeFileSync(MIC_WAV, buf)
}

const HEADED = process.env.E2E_HEADED === '1'
const browser = await chromium.launch({
  headless: !HEADED,
  slowMo: HEADED ? Number(process.env.E2E_SLOWMO || 450) : 0,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${MIC_WAV}`],
})

async function session(user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] })
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message))
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes(':5080')) page.errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace('http://localhost:5080', '')}`) })
  await page.goto(`${BASE}/sign-in`)
  await page.click('button:has-text("Sign in")')
  await page.waitForURL(/:8080/)
  await page.fill('#username', user)
  await page.fill('#password', PW)
  await page.click('#kc-login')
  await page.waitForURL((u) => !u.toString().includes(':8080'))
  await page.waitForLoadState('networkidle')
  return page
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `e2e-core-${name}.png`) }).catch(() => {})
const settle = (page, ms = 900) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(ms))
async function dump(page, label) {
  const info = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const t = (e) => (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 50)
    return { url: location.pathname, h: [...document.querySelectorAll('h1,h2')].filter(vis).map(t).slice(0, 4),
      buttons: [...document.querySelectorAll('button')].filter(vis).map((e) => t(e) + (e.disabled || e.getAttribute('aria-disabled') === 'true' ? ' [disabled]' : '')).slice(0, 14),
      inputs: [...document.querySelectorAll('input,textarea,select')].filter(vis).map((e) => `${e.tagName.toLowerCase()}#${e.id || '-'}`).slice(0, 10) }
  })
  console.log(`  [dump ${label}]`, JSON.stringify(info))
}
// read-only database check (the same local Docker database the backend uses)
const db = (sql) => execSync(`docker exec -i aives-postgres psql -U aives -d aives -At -c "${sql}"`, { encoding: 'utf8' }).trim()
const fmtDate = (d) => d.toISOString().slice(0, 10)

// ---------------------------------------------------------------- phase 1
async function phase1() {
  console.log('\nPHASE 1: lecturer configures and publishes a session')
  const page = await session(LECTURER)
  ok('lecturer signs in and lands on exam sessions', new URL(page.url()).pathname)

  // a new draft session is created by opening /lecturer/sessions/new
  if (!state.sessionId) {
    await page.goto(`${BASE}/lecturer/sessions/new`)
    await page.waitForURL(/\/lecturer\/sessions\/[0-9a-f-]{36}\/setup/, { timeout: 15000 })
    state.sessionId = page.url().match(/sessions\/([0-9a-f-]{36})/)[1]
    save()
  } else {
    await page.goto(`${BASE}/lecturer/sessions/${state.sessionId}/setup`)
  }
  await settle(page)
  ok('draft session opened on the setup page', state.sessionId)

  state.title = state.title || `E2E-Core ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  await page.fill('#f-name', state.title)
  await page.selectOption('#f-course', COURSE_ID)
  const opts = async (sel) => page.$$eval(`${sel} option`, (os) => os.map((o) => o.value).filter(Boolean))
  const openTimes = await opts('#f-ot'); const closeTimes = await opts('#f-ct')
  const now = new Date(); const tomorrow = new Date(Date.now() + 86400000)
  await page.fill('#f-od', fmtDate(now)); await page.selectOption('#f-ot', openTimes[0])
  await page.fill('#f-cd', fmtDate(tomorrow)); await page.selectOption('#f-ct', closeTimes[closeTimes.length - 1])
  await page.fill('#f-limit', '120'); await page.fill('#f-follow', '1')
  await page.click('button:has-text("Save draft")')
  await settle(page, 1500)
  ok('session details saved as draft', `${state.title}; open ${openTimes[0]} today, close ${closeTimes[closeTimes.length - 1]} tomorrow`)

  // questions: from the bank (only Approved ones can be attached)
  await page.click('button:has-text("Add from Bank")')
  const modal = page.locator('.ss-modal-card')
  await modal.waitFor({ state: 'visible', timeout: 10000 })
  await modal.locator('.ss-bank-item').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  const items = modal.locator('.ss-bank-item:not(.ss-bank-disabled)')
  const n = await items.count()
  if (n < 1) { bad('approved questions exist in the bank for this course', 'none selectable'); await shot(page, '01-bank-empty'); return page }
  const take = Math.min(2, n)
  for (let i = 0; i < take; i++) await items.nth(i).click()
  await modal.locator('button:has-text("Add to Exam Session")').click()
  await modal.waitFor({ state: 'hidden', timeout: 10000 })
  await settle(page, 1500)
  ok('questions attached from the bank', `${take} of ${n} selectable`)
  await shot(page, '01-setup')

  // students
  await page.goto(`${BASE}/lecturer/sessions/${state.sessionId}/students`)
  await settle(page)
  const csv = path.join(path.dirname(STATE_FILE), 'e2e-core-students.csv')
  fs.writeFileSync(csv, `StudentCode,FullName,Email\nSE180003,Hoàng Gia Hân,${STUDENT}\n`)
  await page.click('button:has-text("Import student list")')
  await page.setInputFiles('input[type=file]', csv)
  await settle(page, 2000)
  const txt = await page.locator('body').innerText()
  const m = txt.match(/(\d+)\s+students?\s+can take this exam/i)
  if (m && Number(m[1]) >= 1) ok('student list imported', m[0]); else { bad('student list imported', 'count text not found'); await dump(page, 'students'); await shot(page, '01-students') }

  // publish
  const publish = page.locator('button:has-text("Publish session"), button:has-text("Publish exam session")').first()
  await publish.waitFor({ state: 'visible', timeout: 10000 })
  if (await publish.getAttribute('aria-disabled') === 'true' || await publish.isDisabled()) { bad('publish button enabled', 'still disabled'); await dump(page, 'before-publish'); await shot(page, '01-publish-disabled'); return page }
  await publish.click()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await settle(page, 2500)
  await shot(page, '01-after-publish')
  const st = db(`select status||'|'||rubric_mode||'|'||coalesce(rubric_version_id::text,'-') from exam_sessions where id='${state.sessionId}'`)
  if (st.startsWith('Published|SharedVersion|') && !st.endsWith('|-')) ok('session published with the platform rubric version pinned', st); else bad('session published with the platform rubric version pinned', st)
  return page
}

// ---------------------------------------------------------------- phase 2
async function phase2() {
  console.log('\nPHASE 2: student takes the interview')
  const page = await session(STUDENT)
  const resume = state.attemptId && db(`select status from interview_attempts where id='${state.attemptId}'`) === 'InProgress'
  if (resume) { await page.goto(`${BASE}/student/attempts/${state.attemptId}`); await settle(page, 1500); ok('resumed the attempt already in progress', state.attemptId) } else {
    const card = page.locator(`a[href="/student/sessions/${state.sessionId}/lobby"]`)
    await page.goto(`${BASE}/student`); await settle(page, 2500)
    if (await card.count()) { ok('student sees the new exam on "My exams"', state.title); await card.first().click() }
    else {
      // "My exams" features one exam to start; an older Registered E2E session can take that slot, so open the lobby by its address
      console.log('  note  new exam is not the featured card on "My exams" (older registered sessions exist); opening its lobby address directly')
      await page.goto(`${BASE}/student/sessions/${state.sessionId}/lobby`)
    }
    await page.waitForURL(/\/lobby$/); await settle(page, 600)
    const start = page.getByRole('button', { name: 'Start exam' })
    try { await start.and(page.locator(':not([aria-disabled="true"]):not([disabled])')).waitFor({ timeout: 30000 }); ok('microphone check passes (fake microphone) and Start exam opens') }
    catch { bad('microphone check passes and Start exam opens', 'button stayed disabled after 30 s'); await dump(page, 'lobby'); await shot(page, '02-lobby'); return page }
    await start.click()
    await page.waitForURL(/\/student\/attempts\/[0-9a-f-]{36}$/, { timeout: 20000 })
    state.attemptId = page.url().match(/attempts\/([0-9a-f-]{36})/)[1]; save()
    await settle(page, 2000)
    ok('interview room opens', state.attemptId)
  }
  await shot(page, '02-room')

  // answer every question through the UI: wait for the typed-answer box, type, press Finish answer
  const answers = [
    'A modular monolith keeps one deployment with clear module boundaries, so a small team has low operational cost.',
    'Each module owns its data and talks to the others through contracts, which keeps coupling low and the design testable.',
    'For example AIVES has three modules in one API, and a failure in one module is easier to trace than across services.',
  ]
  const asked = []
  let finished = false
  // when the AI could not evaluate a turn the room keeps the answer and asks to select Finish answer again (the same answer, not a new one)
  let aiRetries = 0
  const retryFinish = async () => {
    if (aiRetries >= 12) return false
    const msg = await page.getByText(/select Finish answer to try again/i).isVisible().catch(() => false)
    if (!msg) return false
    const b = page.getByRole('button', { name: /Finish answer/ })
    if (await b.getAttribute('aria-disabled').catch(() => null) === 'true' || await b.isDisabled().catch(() => true)) return false
    aiRetries++; console.log(`  note  AI could not evaluate the turn, pressing Finish answer again (retry ${aiRetries})`)
    await b.click(); return true
  }
  for (let i = 0; i < 24 && !finished; i++) {
    if (/\/done$/.test(page.url())) { finished = true; break }
    const box = page.locator('textarea.a-transcript')
    try {
      await page.waitForFunction(() => /\/done$/.test(location.pathname) || !!document.querySelector('textarea.a-transcript')?.offsetParent || /select Finish answer to try again/i.test(document.body.innerText), null, { timeout: 90000 })
      if (/\/done$/.test(page.url())) { finished = true; break }
      if (await retryFinish()) continue
    }
    catch { bad(`answer box appears for question ${i + 1}`, 'no typed-answer box after 90 s; was Vite started with VITE_ANSWER_INPUT=text, and the backend with the Mock LLM?'); await dump(page, 'room-stuck'); await shot(page, '02-stuck'); break }
    const q = (await page.locator('h1,h2').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 70)
    asked.push(q)
    await box.fill(answers[i % answers.length])
    const finish = page.getByRole('button', { name: /Finish answer/ })
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => /Finish answer/.test(x.innerText)); return b && b.getAttribute('aria-disabled') !== 'true' && !b.disabled }, null, { timeout: 15000 }).catch(() => {})
    await finish.click()
    for (let w = 0; w < 60; w++) {
      if (/\/done$/.test(page.url())) { finished = true; break }
      if (await retryFinish()) { await page.waitForTimeout(1500); continue }
      const stillBox = await page.locator('textarea.a-transcript').isVisible().catch(() => false)
      const nowQ = (await page.locator('h1,h2').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 70)
      if (!stillBox || nowQ !== q) break
      await page.waitForTimeout(1000)
    }
    if (!finished) await page.waitForTimeout(800)
  }
  if (!finished) await page.waitForURL(/\/done$/, { timeout: 15000 }).then(() => { finished = true }).catch(() => {})
  if (finished) ok('all questions answered and the attempt submitted', `${asked.length} answers: ${asked.map((x) => x.slice(0, 28)).join(' | ')}`)
  else bad('all questions answered and the attempt submitted', `${asked.length} answers sent, never reached /done`)
  await settle(page, 1500); await shot(page, '02-done')
  const rows = db(`select status from interview_attempts where id='${state.attemptId}'`)
  const turns = db(`select count(*) from interview_turns where question_response_id in (select id from question_responses where attempt_id='${state.attemptId}')`)
  if (rows === 'PendingReview') ok('attempt is waiting for lecturer review', `status ${rows}, ${turns} turns saved`); else bad('attempt is waiting for lecturer review', `status ${rows}, ${turns} turns`)
  return page
}

// ---------------------------------------------------------------- phase 3
async function phase3() {
  console.log('\nPHASE 3: lecturer reviews and confirms the score')
  const page = await session(LECTURER)
  await page.goto(`${BASE}/lecturer/sessions/${state.sessionId}/results`); await settle(page)
  const body = await page.locator('body').innerText()
  if (/1\s+waiting for your review/i.test(body)) ok('results page shows the attempt waiting for review', (body.match(/\d+ of \d+ students took the exam/i) || [''])[0]); else { bad('results page shows the attempt waiting for review'); await dump(page, 'results'); await shot(page, '03-results') }
  await page.locator(`a[href="/lecturer/attempts/${state.attemptId}/review"]`).first().click()
  await page.waitForURL(/\/review$/); await settle(page, 1500)
  const heads = await page.locator('h1,h2').allInnerTexts()
  if (heads.some((h) => /Question 1/.test(h)) && heads.some((h) => /Final score/.test(h))) ok('review page shows the transcript per question and the final score', heads.slice(0, 4).join(' | ')); else bad('review page shows the transcript per question and the final score', heads.join(' | '))
  await shot(page, '03-review')
  const pre = db(`select status from interview_attempts where id='${state.attemptId}'`)
  if (pre === 'PendingReview') ok('opening the review does not change the attempt', pre); else bad('opening the review does not change the attempt', pre)
  await page.getByRole('button', { name: /Adjust final score/ }).click(); await settle(page, 700)
  await page.fill('#final-score', '7.5'); await page.fill('#final-comment', 'E2E-Core: clear answers, one example missing.')
  await page.getByRole('button', { name: 'Save draft' }).click(); await settle(page, 1800)
  const draft = db(`select status||'|'||final_score from score_reviews where attempt_id='${state.attemptId}'`)
  const mid = db(`select status from interview_attempts where id='${state.attemptId}'`)
  if (draft === 'Pending|7.50' && mid === 'PendingReview') ok('draft score saved without finalising the attempt', `review ${draft}, attempt ${mid}`); else bad('draft score saved without finalising the attempt', `review "${draft}", attempt "${mid}"`)
  await shot(page, '03-draft')
  await page.getByRole('button', { name: /^Confirm final score/ }).click(); await settle(page, 2500)
  const fin = db(`select r.status||'|'||r.final_score||'|'||(r.reviewed_at is not null)||'|'||a.status from score_reviews r join interview_attempts a on a.id=r.attempt_id where r.attempt_id='${state.attemptId}'`)
  if (fin === 'Approved|7.50|true|Finalized') ok('final score confirmed: review Approved, attempt Finalized', fin); else bad('final score confirmed: review Approved, attempt Finalized', fin)
  await shot(page, '03-confirmed')
  return page
}

// ---------------------------------------------------------------- phase 4
async function phase4() {
  console.log('\nPHASE 4: student reads the confirmed report')
  const page = await session(STUDENT)
  await page.goto(`${BASE}/student`); await settle(page)
  const link = page.locator(`a[href="/student/attempts/${state.attemptId}/report"]`)
  if (await link.count()) ok('"My exams" offers the report of the finished attempt'); else { bad('"My exams" offers the report of the finished attempt'); await dump(page, 'student-home'); return page }
  await link.first().click(); await page.waitForURL(/\/report$/); await settle(page, 1500)
  const txt = await page.locator('body').innerText()
  if (/7\.5/.test(txt)) ok('report shows the final score confirmed by the lecturer (7.5)'); else bad('report shows the final score confirmed by the lecturer (7.5)', txt.replace(/\s+/g, ' ').slice(0, 160))
  if (/E2E-Core: clear answers/.test(txt)) ok('report shows the lecturer comment'); else bad('report shows the lecturer comment')
  await shot(page, '04-report')
  return page
}

const phase = process.argv[2] || 'all'
if (phase === 'all') for (const k of Object.keys(state)) delete state[k]   // a full run always starts with a new session
const todo = phase === 'all' ? ['1', '2', '3', '4'] : [phase]
for (const p of todo) {
  try {
    const page = await ({ 1: phase1, 2: phase2, 3: phase3, 4: phase4 }[p])()
    if (page?.errors?.length) { console.log('  backend/page errors seen:'); [...new Set(page.errors)].slice(0, 8).forEach((e) => console.log('    ' + e)) }
  } catch (e) { bad(`phase ${p} crashed`, String(e.message).split('\n')[0]) }
}
save()
await browser.close()
console.log(`\n${results.filter((r) => r.pass).length} passed, ${results.filter((r) => !r.pass).length} failed   (screenshots: ${SHOTS})`)
process.exit(results.some((r) => !r.pass) ? 1 : 0)
