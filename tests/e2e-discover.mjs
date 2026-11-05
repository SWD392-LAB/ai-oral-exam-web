// Read-only survey: logs in as a role, opens screens and prints the interactive elements. Clicks nothing.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const PW = process.env.E2E_PASSWORD
if (!PW) { console.error('Set E2E_PASSWORD first.'); process.exit(2) }
const [, , role, ...paths] = process.argv
const USERS = { lecturer: 'an.nv@aives.edu.vn', student: 'han.hg@aives.edu.vn' }

const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.goto(`${BASE}/sign-in`)
await page.click('button:has-text("Sign in")')
await page.waitForURL(/:8080/)
await page.fill('#username', USERS[role])
await page.fill('#password', PW)
await page.click('#kc-login')
await page.waitForURL((u) => !u.toString().includes(':8080'))
await page.waitForLoadState('networkidle')

for (const p of paths) {
  await page.goto(`${BASE}${p}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  const info = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const t = (e) => (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    return {
      url: location.pathname,
      h: [...document.querySelectorAll('h1,h2')].filter(vis).map(t).slice(0, 5),
      buttons: [...document.querySelectorAll('button,a[role=button]')].filter(vis).map((e) => `${t(e)}${e.getAttribute('aria-disabled') === 'true' || e.disabled ? ' [disabled]' : ''}`).filter(Boolean).slice(0, 25),
      inputs: [...document.querySelectorAll('input,textarea,select')].filter(vis).map((e) => `${e.tagName.toLowerCase()}#${e.id || '-'}[${e.type || ''}] ${(e.getAttribute('aria-label') || e.placeholder || '').slice(0, 40)}`).slice(0, 15),
      links: [...document.querySelectorAll('a[href]')].filter(vis).map((e) => `${t(e)} -> ${e.getAttribute('href')}`).slice(0, 14),
    }
  })
  console.log('\n=== ' + p); console.log(JSON.stringify(info, null, 1))
}
await browser.close()
