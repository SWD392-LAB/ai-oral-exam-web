// Core-flow E2E, driven through the UI only (no direct API calls from the page):
//   phase 1  lecturer: configure an exam session (details, questions from the bank, students) and publish
//   phase 2  student: lobby + microphone check, take the interview, finish
//   phase 3  lecturer: review the attempt, save a draft, confirm the final score
//   phase 4  student: read the confirmed report
// Phase 0 = Feature 1 (material -> AI question drafts -> review).
// Phase 5 = administrator users list (paging, search, filters, total).
// Phase 6 = lecturer exam session lists (every session, not only the first page).
// Usage: node tests/e2e-core.mjs <0|1|2|3|4|5|6|all>   (all = new session, phases 1-4).  E2E_HEADED=1 shows the browser; E2E_SLOWMO=ms slows it.
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

// ---------------------------------------------------------------- phase 0 (Feature 1)
async function phase0() {
  console.log('\nPHASE 0 (Feature 1): lecturer uploads a course material, AI drafts questions from it, lecturer reviews them')
  const page = await session(LECTURER)
  await page.goto(`${BASE}/lecturer/question-bank`); await settle(page, 1500)
  const sel = page.locator('#course-select')
  await sel.waitFor({ timeout: 15000 })
  await sel.selectOption(COURSE_ID).catch(() => {}); await settle(page, 1200)
  ok('question bank opens for the course', (await sel.locator('option:checked').innerText()).trim())

  // upload a small text material; the page then ingests it by itself
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  const fileName = `e2e-core-material-${stamp}.txt`
  const file = path.join(OUT, fileName)   // the text carries the run stamp: identical drafts would be refused as duplicates (409 question_bank_duplicate)
  fs.writeFileSync(file, [
    `Chapter 1 (run ${stamp}): Modular monolith versus microservices.`,
    `Run ${stamp}: A modular monolith is deployed as one unit but is split into modules with clear boundaries. Each module owns its data and exposes a small contract to the other modules.`,
    `Run ${stamp}: Microservices are deployed independently. They give teams freedom to scale and release on their own, but they add network calls, distributed tracing and eventual consistency.`,
    `Run ${stamp}: A small team usually pays less operational cost with a modular monolith. Splitting a module into a service later is easier when the boundaries and contracts already exist.`,
    'Chapter 2. Bounded contexts. A bounded context is the area in which one model and one vocabulary apply. Two contexts may use the same word with different meanings, so they communicate through explicit contracts.',
    'Chapter 3. Testing the boundaries. Contract tests check that a module still honours the promises other modules rely on. Integration tests check that the modules work together on the real database.',
  ].join('\n\n'))
  await page.getByRole('button', { name: /Course Materials/ }).click(); await settle(page, 600)
  await page.locator('input[type=file]').setInputFiles(file)
  let matId = '', matStatus = ''
  for (let i = 0; i < 40 && matStatus !== 'Ready'; i++) {
    await page.waitForTimeout(1500)
    const row = db(`select id||'|'||status from course_materials where file_name='${fileName}'`)
    if (row) [matId, matStatus] = row.split('|')
    if (matStatus === 'Failed') break
  }
  await shot(page, '00-materials')
  if (matStatus === 'Ready') ok('material uploaded and ingested', `${fileName} -> Ready, ${db(`select count(*) from material_chunks where course_material_id='${matId}'`)} chunks`)
  else { bad('material uploaded and ingested', `status "${matStatus || 'not found'}" ${db(`select coalesce(ingest_error,'') from course_materials where file_name='${fileName}'`)}`); return page }
  state.materialId = matId; save()

  // ask the AI for drafts from that material
  const before = Number(db(`select count(*) from question_bank_items where origin='Ai'`))
  await page.getByRole('button', { name: /Questions \(/ }).click(); await settle(page, 500)
  await page.getByRole('button', { name: /Generate with AI/ }).first().click()
  await page.locator('#ai-topic').waitFor({ timeout: 10000 })
  await page.fill('#ai-topic', `Modular monolith and microservices ${stamp}`)   // unique per run: the bank refuses a draft whose text already exists
  await page.selectOption('#ai-bloom', 'Understand')
  await page.fill('#ai-count', '2')
  const pick = page.locator('.qb-mat-pick-item', { hasText: fileName }).locator('input[type=checkbox]')
  // the modal pre-ticks every ready material: keep only the one just uploaded, so the drafts must come from it
  const boxes = page.locator('.qb-mat-pick-item input[type=checkbox]')
  for (let k = 0; k < await boxes.count(); k++) if (await boxes.nth(k).isChecked()) await boxes.nth(k).uncheck()
  await pick.check()
  await shot(page, '00-ai-modal')
  await page.getByRole('button', { name: /Tạo câu hỏi bằng AI/ }).click()
  let done = false
  for (let i = 0; i < 90 && !done; i++) {          // up to 3 minutes: a real model can be slow
    await page.waitForTimeout(2000)
    done = !(await page.locator('#ai-topic').isVisible().catch(() => false))
  }
  if (!done) {
    const err = (await page.locator('.qb-modal-ai').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-220)
    bad('AI generated question drafts', `modal still open: ${err}`); await shot(page, '00-ai-stuck'); return page
  }
  await settle(page, 1500)
  const drafts = db(`select i.id||'|'||left(replace(replace(i.content,chr(10),' '),chr(13),' '),70) from question_bank_items i join question_bank_revisions r on r.question_bank_item_id=i.id where i.origin='Ai' and i.status='Draft' and r.provenance_json::text like '%${matId}%' order by i.created_at`).split('\n').filter(Boolean).map((l) => { const k = l.indexOf('|'); return { id: l.slice(0, k), text: l.slice(k + 1) } })
  const after = Number(db(`select count(*) from question_bank_items where origin='Ai'`))
  if (drafts.length >= 1) ok('AI created question drafts from the material', `${drafts.length} drafts (AI questions in the bank: ${before} -> ${after})`); else { bad('AI created question drafts from the material', '0 drafts linked to the material'); await shot(page, '00-no-drafts'); return page }
  console.log('        drafts: ' + drafts.map((d) => `"${d.text}"`).join('  |  '))

  // every draft must carry the platform rubric version and cite the material
  const prov = db(`select r.provenance_json->>'PlatformRubricVersionId' from question_bank_revisions r where r.question_bank_item_id='${drafts[0].id}' order by r.revision_no limit 1`)
  const known = db(`select count(*) from rubric_versions where id='${prov}'`) === '1'
  if (known) ok('draft carries an existing platform rubric version', prov); else bad('draft carries an existing platform rubric version', `got "${prov}"`)
  const cites = db(`select (r.provenance_json->'Citations'->0->>'Quote') is not null from question_bank_revisions r where r.question_bank_item_id='${drafts[0].id}' order by r.revision_no limit 1`)
  if (cites === 't') ok('draft cites a quote from the material'); else bad('draft cites a quote from the material', cites)

  // the lecturer reviews: approve the first draft, reject the second one if there is one
  const row = (d) => page.locator('.qb-row', { hasText: d.text.slice(0, 40) }).first()
  await row(drafts[0]).getByRole('button', { name: /Duyệt/ }).click(); await settle(page, 1200)
  const st1 = db(`select status from question_bank_items where id='${drafts[0].id}'`)
  if (st1 === 'Approved') ok('lecturer approved a draft', st1); else bad('lecturer approved a draft', st1)
  state.approvedItemId = drafts[0].id; save()
  if (drafts[1]) {
    await row(drafts[1]).getByRole('button', { name: /Loại/ }).click(); await settle(page, 1200)
    const st2 = db(`select status from question_bank_items where id='${drafts[1].id}'`)
    if (st2 === 'Rejected') ok('lecturer rejected a draft', st2); else bad('lecturer rejected a draft', st2)
  }
  await shot(page, '00-reviewed')
  return page
}

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

// ---------------------------------------------------------------- phase 5 (Users: paging, search, filters, total)
async function phase5() {
  console.log('\nPHASE 5: administrator browses the users list (more users than one page)')
  const page = await session('admin@aives.edu.vn')
  const rows = page.locator('tr.a-row:visible')
  const countText = async () => (await page.locator('p.a-num[aria-live=polite]').first().innerText()).replace(/\s+/g, ' ').trim()
  const pagerText = async () => ((await page.locator('nav[aria-label="Pages of users"]').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
  const firstEmail = async () => (await rows.first().innerText()).match(/[\w.+-]+@[\w.-]+/)?.[0] ?? ''
  const emailsOnPage = async () => (await rows.allInnerTexts()).map((t) => t.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? '')
  await page.goto(`${BASE}/admin/users`); await settle(page, 1500)

  const N = Number(db('select count(*) from users'))
  const pages = Math.ceil(N / 10)
  const nPages = N > 10
  if (!nPages) { bad('need more than 10 users in the database to test paging', `only ${N}`); return page }
  const t1 = await countText()
  if (t1.includes(`1–10 of ${N} users`)) ok('first page shows the real total from the database', t1); else bad('first page shows the real total from the database', `${t1} (database has ${N})`)
  const r1 = await rows.count()
  if (r1 === 10) ok('first page lists 10 accounts'); else bad('first page lists 10 accounts', String(r1))
  const pg = await pagerText()
  if (pg.includes(`Page 1 of ${pages}`)) ok('pager shows the page number and page count', pg); else bad('pager shows the page number and page count', pg || 'no pager')
  const prevOff = await page.getByRole('button', { name: 'Previous' }).getAttribute('aria-disabled')
  if (prevOff === 'true') ok('Previous is disabled on the first page'); else bad('Previous is disabled on the first page', String(prevOff))
  await shot(page, '05-users-page1')
  const emails1 = await emailsOnPage()

  await page.getByRole('button', { name: 'Next' }).click(); await settle(page, 1200)
  const t2 = await countText()
  if (t2.includes(`11–20 of ${N} users`)) ok('Next opens accounts 11 to 20', t2); else bad('Next opens accounts 11 to 20', t2)
  const emails2 = await emailsOnPage()
  if (emails2.length > 0 && !emails2.some((e) => emails1.includes(e))) ok('second page lists different accounts than the first'); else bad('second page lists different accounts than the first', emails2.join(','))
  await shot(page, '05-users-page2')
  await page.getByRole('button', { name: 'Previous' }).click(); await settle(page, 1200)
  if ((await firstEmail()) === emails1[0]) ok('Previous goes back to the first page'); else bad('Previous goes back to the first page')

  // last page
  for (let i = 1; i < pages; i++) { await page.getByRole('button', { name: 'Next' }).click(); await settle(page, 900) }
  const lastRows = await rows.count()
  const expectedLast = N - 10 * (pages - 1)
  if (lastRows === expectedLast) ok(`last page lists the remaining ${expectedLast} accounts`); else bad('last page lists the remaining accounts', `${lastRows} instead of ${expectedLast}`)
  const nextOff = await page.getByRole('button', { name: 'Next' }).getAttribute('aria-disabled')
  if (nextOff === 'true') ok('Next is disabled on the last page'); else bad('Next is disabled on the last page', String(nextOff))
  const lastEmails = await emailsOnPage()
  const target = lastEmails[lastEmails.length - 1]
  await shot(page, '05-users-last')

  // search finds an account that is NOT on the first page
  await page.fill('#f-search', target); await settle(page, 1500)
  const ts = await countText()
  const found = await emailsOnPage()
  if (found.length === 1 && found[0] === target) ok('search finds an account that is not on the first page', `${target} -> ${ts}`); else bad('search finds an account that is not on the first page', `${target} -> ${found.join(',')} | ${ts}`)
  if (/1 user matches/.test(ts)) ok('count text says 1 user matches'); else bad('count text says 1 user matches', ts)
  await shot(page, '05-users-search')

  // duplicate email on another page is refused with a clear message and creates nothing
  await page.getByRole('button', { name: 'Clear filters' }).first().click(); await settle(page, 1200)
  await page.getByRole('button', { name: /Create user/ }).first().click(); await page.locator('#new-email').waitFor({ timeout: 8000 })
  await page.selectOption('#new-role', 'Administrator')
  await page.fill('#new-email', target); await page.fill('#new-name', 'E2E Duplicate Probe')
  await page.getByRole('button', { name: /Create and send setup link/ }).click(); await settle(page, 1800)
  const errText = (await page.locator('#new-email-err').innerText().catch(() => '')).trim()
  const N2 = Number(db('select count(*) from users'))
  if (/already/i.test(errText) && N2 === N) ok('email of an account on another page is refused and nothing is created', errText); else bad('email of an account on another page is refused and nothing is created', `message "${errText}", users ${N} -> ${N2}`)
  await shot(page, '05-users-duplicate')

  // role and status filters count from the whole database, not from the loaded page
  await page.reload(); await settle(page, 1500)
  await page.selectOption('#f-role', 'Lecturer'); await settle(page, 1500)
  const lect = Number(db("select count(*) from users u join roles r on r.id=u.role_id where r.name='Lecturer'"))
  const tl = await countText()
  if (tl.includes(String(lect))) ok('role filter counts all lecturers in the database', `${tl} (database ${lect})`); else bad('role filter counts all lecturers in the database', `${tl} (database ${lect})`)
  await page.selectOption('#f-role', 'all'); await page.selectOption('#f-status', 'Deactivated'); await settle(page, 1500)
  const off = Number(db('select count(*) from users where is_active = false'))
  const td = await countText()
  if (off === 0 ? /No users|0 users|match/.test(td) || (await rows.count()) === 0 : td.includes(String(off))) ok('status filter counts all deactivated accounts in the database', `${td} (database ${off})`); else bad('status filter counts all deactivated accounts in the database', `${td} (database ${off})`)

  // the courses page still needs every lecturer, not just ten
  await page.goto(`${BASE}/admin/courses`); await settle(page, 1800)
  const bodyTxt = await page.locator('body').innerText()
  if (!/something went wrong|could not load|error/i.test(bodyTxt)) ok('courses page still loads'); else bad('courses page still loads', bodyTxt.slice(0, 120))
  await shot(page, '05-courses')
  return page
}

// ---------------------------------------------------------------- phase 6 (exam sessions list: more than one page)
async function phase6() {
  console.log('\nPHASE 6: lecturer sees every exam session (more sessions than one page)')
  const page = await session(LECTURER)
  const lecId = db(`select id from users where email='${LECTURER}'`)
  const mineSql = `from exam_sessions s join course_lecturers cl on cl.course_id=s.course_id where cl.lecturer_id='${lecId}'`
  const mine = Number(db(`select count(*) ${mineSql}`))
  // sessions that have started or finished: not a draft, and closed, past its end or inside its window
  const started = Number(db(`select count(*) ${mineSql} and s.status<>'Draft' and (s.status='Closed' or s.end_time < now() or (s.start_time <= now() and now() <= s.end_time))`))
  if (mine <= 10) { bad('need more than 10 exam sessions in the lecturer courses to test this', `only ${mine}`); return page }
  const countText = async () => (await page.locator('p.a-num[aria-live=polite]').first().innerText()).replace(/\s+/g, ' ').trim()

  await page.goto(`${BASE}/lecturer/sessions`); await settle(page, 2200)
  const t1 = await countText()
  if (t1 === `${mine} sessions`) ok('"Exam sessions" counts every session of the lecturer courses', `${t1} (database ${mine})`); else bad('"Exam sessions" counts every session of the lecturer courses', `${t1} (database ${mine})`)
  await shot(page, '06-sessions')
  // the oldest session is on a later page of the backend list; it must still be on the screen
  const oldest = db(`select s.title ${mineSql} order by s.start_time asc limit 1`)
  const shown = await page.getByText(oldest, { exact: true }).count()
  if (shown > 0) ok('the oldest session is listed too', oldest); else bad('the oldest session is listed too', oldest)

  await page.goto(`${BASE}/lecturer/results`); await settle(page, 2200)
  const t2 = await countText()
  if (t2 === `${started} sessions`) ok('"Results and review" counts every session that has started', `${t2} (database ${started})`); else bad('"Results and review" counts every session that has started', `${t2} (database ${started})`)

  await page.goto(`${BASE}/lecturer/statistics`); await settle(page, 2200)
  const opts = await page.locator('#f-session option').count()
  if (opts === started) ok('"Class statistics" offers every session that has started', `${opts} options (database ${started})`); else bad('"Class statistics" offers every session that has started', `${opts} options (database ${started})`)
  await shot(page, '06-statistics')
  return page
}

const phase = process.argv[2] || 'all'
if (phase === 'all') for (const k of Object.keys(state)) delete state[k]   // a full run always starts with a new session
const todo = phase === 'all' ? ['0', '1', '2', '3', '4', '5', '6'] : [phase]
for (const p of todo) {
  try {
    const page = await ({ 0: phase0, 1: phase1, 2: phase2, 3: phase3, 4: phase4, 5: phase5, 6: phase6 }[p])()
    if (page?.errors?.length) { console.log('  backend/page errors seen:'); [...new Set(page.errors)].slice(0, 8).forEach((e) => console.log('    ' + e)) }
  } catch (e) { bad(`phase ${p} crashed`, String(e.message).split('\n')[0]) }
}
save()
await browser.close()
console.log(`\n${results.filter((r) => r.pass).length} passed, ${results.filter((r) => !r.pass).length} failed   (screenshots: ${SHOTS})`)
process.exit(results.some((r) => !r.pass) ? 1 : 0)
