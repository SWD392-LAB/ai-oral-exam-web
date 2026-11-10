// Makes sure the demo exam "English AI viva demo" exists. It only CREATES it when no open (Published, not yet
// ended) session with that title exists; when one exists it changes nothing.
//   - signs in as the demo lecturer through the real sign-in page, then uses the app's own API and screens;
//   - adds two simple everyday-topic questions to the question bank (skips them if they already exist), approves them;
//   - creates the session, attaches those two questions, imports the demo student, publishes.
// Usage: node tests/demo-exam.mjs        Needs: backend on :5080, Vite on :5173, Keycloak on :8080 and E2E_PASSWORD
//        (the password of the seeded local test users; never written in a file).
// It writes to whatever database the backend uses. It deletes nothing.
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = 'http://localhost:5173'
const API = 'http://localhost:5080'
const PW = process.env.E2E_PASSWORD
if (!PW) { console.error('Set E2E_PASSWORD (password of the seeded local test users) before running.'); process.exit(2) }
const LECTURER = 'an.nv@aives.edu.vn'
const STUDENT = 'han.hg@aives.edu.vn'
const COURSE_ID = '22222222-0000-0000-0000-000000000001'
const TITLE = process.env.DEMO_TITLE || 'English AI viva demo'
const QUESTIONS = [
  { topic: 'Everyday knowledge', bloom: 'Understand', content: 'What is photosynthesis, and why do plants need sunlight?' },
  { topic: 'Everyday knowledge', bloom: 'Understand', content: 'Why is it important to drink enough water every day?' },
]

const browser = await chromium.launch({ headless: true })
const fail = async (msg) => { console.error('FAIL: ' + msg); await browser.close(); process.exit(1) }
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const settle = (ms = 900) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(ms))

await page.goto(`${BASE}/sign-in`)
await page.click('button:has-text("Sign in")')
await page.waitForURL(/:8080/)
await page.fill('#username', LECTURER)
await page.fill('#password', PW)
await page.click('#kc-login')
// a wrong password leaves the page on the Keycloak form: say so instead of waiting for a timeout
try { await page.waitForURL((u) => !u.toString().includes(':8080'), { timeout: 15000 }) } catch {
  await fail(`sign-in as ${LECTURER} was refused by Keycloak: check the password you typed (E2E_PASSWORD).`)
}
await page.waitForLoadState('networkidle')

const token = await page.evaluate(() => {
  for (const s of [sessionStorage, localStorage]) for (const k of Object.keys(s)) if (k.startsWith('oidc.user:')) return JSON.parse(s.getItem(k)).access_token
})
if (!token) await fail('could not sign in as the demo lecturer (wrong E2E_PASSWORD, or Keycloak is not running)')
const call = (method, url, body) => page.evaluate(async ([m, u, b, t]) => {
  const r = await fetch(u, { method: m, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  return { status: r.status, text: await r.text() }
}, [method, url, body, token])
const json = (r) => { try { return JSON.parse(r.text) } catch { return null } }
// both list shapes: a plain array, or { items, totalPages }
async function allPages(pathname) {
  const rows = []
  for (let p = 1; p <= 50; p++) {
    const r = await call('GET', `${API}${pathname}${pathname.includes('?') ? '&' : '?'}page=${p}&pageSize=100`)
    const body = json(r)
    if (r.status !== 200 || body == null) await fail(`GET ${pathname} -> ${r.status}`)
    if (Array.isArray(body)) return body
    rows.push(...(body.items ?? []))
    if (p >= (body.totalPages ?? 1)) break
  }
  return rows
}

// 1. already there? then change nothing
const sessions = await allPages('/api/exam-sessions')
const existing = sessions.find((s) => String(s.title ?? '').startsWith(TITLE) && s.status === 'Published' && new Date(s.endTime) > new Date())
if (existing) {
  console.log(`SKIP: "${existing.title}" already exists and is open until ${existing.endTime} (id ${existing.id}). Nothing was created.`)
  await browser.close(); process.exit(0)
}
console.log(`No open "${TITLE}" session found: creating it.`)

// 2. the two questions in the bank, approved
for (const q of QUESTIONS) {
  const c = await call('POST', `${API}/api/courses/${COURSE_ID}/question-bank`, q)
  if (c.status === 201) {
    const a = await call('POST', `${API}/api/courses/${COURSE_ID}/question-bank/${json(c).id}/approve`)
    if (a.status >= 300) await fail(`approve question -> ${a.status} ${a.text.slice(0, 120)}`)
    console.log('  question added and approved: ' + q.content)
  } else if (c.status === 409) {
    const items = json(await call('GET', `${API}/api/courses/${COURSE_ID}/question-bank`)) ?? []
    const hit = (Array.isArray(items) ? items : items.items ?? []).find((i) => i.content === q.content)
    if (!hit) await fail('question exists but could not be found in the bank: ' + q.content)
    if (hit.status !== 'Approved') {
      const a = await call('POST', `${API}/api/courses/${COURSE_ID}/question-bank/${hit.id}/approve`)
      if (a.status >= 300) await fail(`approve existing question (${hit.status}) -> ${a.status} ${a.text.slice(0, 120)}`)
    }
    console.log('  question already in the bank: ' + q.content)
  } else await fail(`create question -> ${c.status} ${c.text.slice(0, 160)}`)
}

// 3. the session, through the lecturer screens
await page.goto(`${BASE}/lecturer/sessions/new`)
await page.waitForURL(/\/lecturer\/sessions\/[0-9a-f-]{36}\/setup/, { timeout: 15000 })
const sessionId = page.url().match(/sessions\/([0-9a-f-]{36})/)[1]
await settle()
await page.fill('#f-name', TITLE)
await page.selectOption('#f-course', COURSE_ID)
const opts = async (sel) => page.$$eval(`${sel} option`, (os) => os.map((o) => o.value).filter(Boolean))
const openTimes = await opts('#f-ot'); const closeTimes = await opts('#f-ct')
const day = (d) => d.toISOString().slice(0, 10)
await page.fill('#f-od', day(new Date())); await page.selectOption('#f-ot', openTimes[0])
await page.fill('#f-cd', day(new Date(Date.now() + 5 * 86400000))); await page.selectOption('#f-ct', closeTimes[closeTimes.length - 1])
await page.fill('#f-limit', '120'); await page.fill('#f-follow', '1')
await page.click('button:has-text("Save draft")'); await settle(1500)

await page.click('button:has-text("Add from Bank")')
const modal = page.locator('.ss-modal-card')
await modal.waitFor({ state: 'visible', timeout: 10000 })
await modal.locator('.ss-bank-item').first().waitFor({ state: 'visible', timeout: 15000 })
for (const q of QUESTIONS) {
  const item = modal.locator('.ss-bank-item:not(.ss-bank-disabled)', { hasText: q.content }).first()
  if (!(await item.count())) await fail('question not selectable in the bank dialog: ' + q.content)
  await item.click()
}
await modal.locator('button:has-text("Add to Exam Session")').click()
await modal.waitFor({ state: 'hidden', timeout: 10000 }); await settle(1500)

await page.goto(`${BASE}/lecturer/sessions/${sessionId}/students`); await settle()
const csv = path.join(os.tmpdir(), 'aives-demo-students.csv')
fs.writeFileSync(csv, `StudentCode,FullName,Email\nSE180003,Hoàng Gia Hân,${STUDENT}\n`)
await page.click('button:has-text("Import student list")')
await page.setInputFiles('input[type=file]', csv); await settle(2000)

const publish = page.locator('button:has-text("Publish session"), button:has-text("Publish exam session")').first()
await publish.waitFor({ state: 'visible', timeout: 10000 })
await publish.click()
await page.getByRole('button', { name: 'Publish', exact: true }).click(); await settle(2500)

// 4. check what the backend now says
const made = json(await call('GET', `${API}/api/exam-sessions/${sessionId}`))
if (!made || made.status !== 'Published') await fail(`session ${sessionId} was not published (status: ${made?.status ?? 'unknown'})`)
console.log(`CREATED: "${made.title}" (id ${sessionId}), open until ${made.endTime}, student ${STUDENT}.`)
await browser.close()
