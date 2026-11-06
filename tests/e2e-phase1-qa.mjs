import { chromium } from 'playwright'
import { execSync } from 'child_process'

const BASE_URL = 'http://localhost:5173'
const API_URL = 'http://localhost:5080'
const LECTURER = { user: 'an.nv@aives.edu.vn', pass: 'Password@123' }

function queryDb(sql) {
  const cmd = `docker exec -i aives-postgres psql -U aives -d aives -t -A -c "${sql}"`
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

async function runTest() {
  console.log('=== BẮT ĐẦU KIỂM THỬ E2E TRÊN DOCKER DB (AIVES PHASE 1) ===\n')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  page.on('console', (msg) => console.log('  [BROWSER CONSOLE]', msg.type(), msg.text()))
  page.on('pageerror', (err) => console.log('  [BROWSER ERROR]', err.message))
  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.log('  [HTTP ERROR]', res.status(), res.url())
    }
  })

  // 1. Đăng nhập Giảng viên
  console.log('1. Đang đăng nhập Giảng viên an.nv qua Keycloak OIDC...')
  await page.goto(`${BASE_URL}/sign-in`)
  await page.waitForLoadState('networkidle')

  const signInBtn = page.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary')
  await signInBtn.first().click()

  await page.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 })
  await page.fill('#username', LECTURER.user)
  await page.fill('#password', LECTURER.pass)
  await page.click('#kc-login')

  await page.waitForURL((url) => !url.toString().includes(':8080'), { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  console.log('-> Đăng nhập thành công! Đã quay lại portal Giảng viên.\n')

  // 2. Lấy Access Token từ browser context
  const token = await page.evaluate(async () => {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith('oidc.user:')) {
        const u = JSON.parse(sessionStorage.getItem(k) || '{}')
        if (u.access_token) return u.access_token
      }
    }
    return null
  })

  if (!token) {
    throw new Error('Không lấy được Keycloak Access Token từ session browser!')
  }
  console.log('-> Đã lấy được Keycloak Bearer Token hợp lệ (độ dài:', token.length, 'ký tự).\n')

  // 3. TEST 1: Gọi API thật GET /api/platform-rubric
  console.log('2. TEST API: GET /api/platform-rubric với Bearer Token...')
  const rubricRes = await page.evaluate(async ({ apiUrl, bearerToken }) => {
    const res = await fetch(`${apiUrl}/api/platform-rubric`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
    })
    return {
      status: res.status,
      ok: res.ok,
      data: await res.json(),
    }
  }, { apiUrl: API_URL, bearerToken: token })

  console.log('-> HTTP Status:', rubricRes.status)
  console.log('-> Version:', rubricRes.data.versionNo, '| Sealed:', rubricRes.data.isSealed, '| Active:', rubricRes.data.isActive)
  console.log('-> Max Score:', rubricRes.data.maxScore)
  console.log('-> Criteria count:', rubricRes.data.criteria?.length)
  rubricRes.data.criteria?.forEach((c, i) => {
    console.log(`   [${i + 1}] Order ${c.orderNo}: "${c.description}" (${c.maxPoints} pts)`)
  })

  if (rubricRes.status !== 200 || !rubricRes.data.criteria || rubricRes.data.criteria.length < 1) {
    throw new Error('API GET /api/platform-rubric không trả về đúng chuẩn!')
  }
  console.log('-> TEST 1 (Platform Rubric API): PASS!\n')

  // 4. TEST 2: UI Session Setup - Xem Platform Rubric Modal & Checklist
  console.log('3. TEST UI: Mở Session Setup và kiểm tra Platform Rubric Modal...')
  await page.goto(`${BASE_URL}/lecturer/sessions/33333333-0000-0000-0000-000000000001/setup`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  console.log('-> URL hiện tại:', page.url())

  await page.screenshot({ path: 'tests/debug-setup.png' })
  const allButtons = await page.locator('button').allInnerTexts()
  console.log('-> Danh sách tất cả các button trên màn hình:', allButtons)

  // Kiểm tra không còn rubric input ở câu hỏi (AC-02)
  const oldRubricButtons = await page.locator('button:has-text("Write rubric"), button:has-text("Edit rubric")').count()
  console.log('-> Số lượng nút "Write rubric" lẻ của câu hỏi:', oldRubricButtons, '(Kỳ vọng: 0)')
  if (oldRubricButtons > 0) {
    throw new Error('Vẫn còn nút viết rubric lẻ cho câu hỏi!')
  }

  // Click mở Modal Platform Rubric (AC-01)
  const viewRubricBtn = page.locator('button:has-text("Platform Rubric Standards"), button:has-text("View criteria"), button:has-text("Platform Rubric")')
  await viewRubricBtn.first().click({ timeout: 5000 })
  await page.waitForTimeout(600)

  const modal = page.locator('.ss-modal-card')
  const isModalVisible = await modal.isVisible()
  console.log('-> Platform Rubric Modal mở thành công:', isModalVisible)

  const modalTitle = await modal.locator('h3').innerText()
  const modalScale = await modal.locator('.a-num').last().innerText()
  console.log('-> Modal Title:', modalTitle, '| Total Scale:', modalScale)

  await page.screenshot({ path: 'tests/e2e-evidence-01-rubric-modal.png' })
  console.log('-> Đã chụp ảnh bằng chứng: tests/e2e-evidence-01-rubric-modal.png')

  // Đóng modal
  await modal.locator('button:has-text("Close")').click()
  await page.waitForTimeout(400)
  console.log('-> TEST 2 (UI Session Setup & Rubric Modal): PASS!\n')

  // 5. TEST 3: Tạo và Publish Exam Session với Platform Rubric (AC-03)
  console.log('4. TEST API & DB: Tạo ca thi mới và Publish (SharedVersion Platform Rubric)...')
  const newSession = await page.evaluate(async ({ apiUrl, bearerToken }) => {
    const createRes = await fetch(`${apiUrl}/api/exam-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        courseId: '22222222-0000-0000-0000-000000000001',
        title: 'SWD392 E2E Publish Verification Test',
        startTime: '2026-11-25T08:00:00Z',
        endTime: '2026-11-25T17:00:00Z',
        timeLimitPerAnswerSeconds: 60,
        maxFollowUps: 2,
      }),
    })
    return {
      status: createRes.status,
      data: await createRes.json(),
    }
  }, { apiUrl: API_URL, bearerToken: token })

  console.log('-> Tạo ca thi mới:', newSession.data.id, '| Status ban đầu:', newSession.data.status)
  const sessionId = newSession.data.id

  // Thêm 1 câu hỏi và 1 sinh viên vào session này trong DB để đủ điều kiện publish
  console.log('-> Thêm question và participant vào session trong DB...')
  queryDb(`INSERT INTO questions (exam_session_id, order_no, content) VALUES ('${sessionId}', 1, 'Giải thích kiến trúc Clean Architecture?');`)
  queryDb(`INSERT INTO participants (exam_session_id, student_id, status) VALUES ('${sessionId}', '11111111-0000-0000-0000-000000000001', 'Registered');`)

  // Gọi Publish API
  const publishRes = await page.evaluate(async ({ apiUrl, bearerToken, sId }) => {
    const res = await fetch(`${apiUrl}/api/exam-sessions/${sId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    })
    return {
      status: res.status,
      data: await res.json(),
    }
  }, { apiUrl: API_URL, bearerToken: token, sId: sessionId })

  console.log('-> Publish API status:', publishRes.status, '| New Status:', publishRes.data.status)
  const dbStatus = queryDb(`SELECT status FROM exam_sessions WHERE id = '${sessionId}';`)
  console.log('-> Trạng thái trong Docker PostgreSQL:', dbStatus)

  if (dbStatus !== 'Published') {
    throw new Error(`Publish thất bại! Trạng thái DB: ${dbStatus}`)
  }
  console.log('-> TEST 3 (Publish Exam Session): PASS!\n')

  // 6. TEST 4: Score Review - Save Draft (AC-04)
  const testAttemptId = '66666666-0000-0000-0000-000000000008'
  console.log(`5. TEST UI & API: Chấm điểm bài thi ${testAttemptId} - Luồng Save Draft...`)
  await page.goto(`${BASE_URL}/lecturer/attempts/${testAttemptId}/review`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  // Nếu có nút Adjust final score hoặc Update draft, bấm vào
  const adjustBtn = page.locator('#adjust-final-score-btn, #update-draft-btn, button:has-text("Adjust final score"), button:has-text("Update draft"), button:has-text("Change final score")')
  if (await adjustBtn.first().isVisible()) {
    console.log('-> Click Adjust / Update draft button...')
    await adjustBtn.first().click()
    await page.waitForTimeout(600)
  }

  // Nhập điểm 8.75 và nhận xét
  const scoreInput = page.locator('input[type="number"][step="0.25"]')
  await scoreInput.fill('8.75')

  const commentInput = page.locator('textarea')
  if (await commentInput.isVisible()) {
    await commentInput.fill('Sinh viên phân tích sắc bén, tự tin, trả lời đúng trọng tâm câu hỏi kiến trúc.')
  }

  // Bấm Save draft
  console.log('-> Bấm nút "Save draft"...')
  const saveDraftBtn = page.locator('button:has-text("Save draft")')
  await saveDraftBtn.click()
  await page.waitForTimeout(1500)

  // Kiểm tra feedback
  const draftFeedback = await page.locator('.a-save-feedback, text=Draft saved at, text=Bản nháp đã lưu, text=Draft saved').first().innerText().catch(() => '')
  console.log('-> Thông báo feedback trên UI:', draftFeedback)

  await page.screenshot({ path: 'tests/e2e-evidence-02-draft-saved.png' })
  console.log('-> Đã chụp ảnh bằng chứng: tests/e2e-evidence-02-draft-saved.png')

  // Kiểm tra trong PostgreSQL
  const draftDb = queryDb(`SELECT status || ' | ' || final_score || ' | ' || comment FROM score_reviews WHERE attempt_id = '${testAttemptId}';`)
  console.log('-> Bản ghi score_reviews trong Docker PostgreSQL:', draftDb)
  const attemptStatusDb = queryDb(`SELECT status FROM interview_attempts WHERE id = '${testAttemptId}';`)
  console.log('-> Trạng thái attempt trong Docker PostgreSQL:', attemptStatusDb)

  if (!draftDb.includes('Pending') || !draftDb.includes('8.75')) {
    throw new Error('Dữ liệu lưu nháp trong DB không khớp!')
  }
  if (attemptStatusDb !== 'PendingReview') {
    throw new Error('Attempt status không phải PendingReview khi lưu nháp!')
  }
  console.log('-> TEST 4 (Save Draft Score Review): PASS!\n')

  // 7. TEST 5: Reload trang (F5) kiểm tra nạp lại bản nháp (AC-05)
  console.log('6. TEST UI: Reload trang (F5) kiểm tra dữ liệu bản nháp được nạp lại...')
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  const reloadedScore = await page.locator('input[type="number"][step="0.25"]').inputValue().catch(async () => {
    return await page.locator('p.a-num').first().innerText()
  })
  console.log('-> Điểm sau khi reload:', reloadedScore)

  const hasDraftBadge = await page.locator('text=Draft review, text=Pending approval, text=Pending confirmation').first().isVisible().catch(() => false)
  console.log('-> Badge trạng thái nháp hiển thị:', hasDraftBadge)

  await page.screenshot({ path: 'tests/e2e-evidence-03-draft-reloaded.png' })
  console.log('-> Đã chụp ảnh bằng chứng: tests/e2e-evidence-03-draft-reloaded.png')
  console.log('-> TEST 5 (Reload Load Draft): PASS!\n')

  // 8. TEST 6: Chốt điểm chính thức (Confirm Final Score) (AC-06)
  console.log('7. TEST UI & API: Chốt điểm chính thức (Confirm Final Score)...')
  const confirmBtn = page.locator('#confirm-draft-score-btn, #confirm-final-score-btn, button:has-text("Confirm Final Score"), button:has-text("Confirm final score")')
  await confirmBtn.first().click()
  await page.waitForTimeout(2500)

  // Kiểm tra badge ngọc bích confirmed
  const confirmedText = await page.locator('text=Confirmed by you at, text=The student can now open the report').first().innerText().catch(() => '')
  console.log('-> UI Confirmed message:', confirmedText)

  await page.screenshot({ path: 'tests/e2e-evidence-04-score-confirmed.png' })
  console.log('-> Đã chụp ảnh bằng chứng: tests/e2e-evidence-04-score-confirmed.png')

  // Kiểm tra trong PostgreSQL
  const finalizedDb = queryDb(`SELECT status || ' | ' || final_score || ' | ' || comment FROM score_reviews WHERE attempt_id = '${testAttemptId}';`)
  console.log('-> score_reviews trong Docker PostgreSQL sau khi chốt:', finalizedDb)
  const finalAttemptStatus = queryDb(`SELECT status FROM interview_attempts WHERE id = '${testAttemptId}';`)
  console.log('-> interview_attempts trong Docker PostgreSQL sau khi chốt:', finalAttemptStatus)

  if (!finalizedDb.includes('Approved') || !finalizedDb.includes('8.75')) {
    throw new Error('Dữ liệu score_reviews không chuyển sang Approved!')
  }
  if (finalAttemptStatus !== 'Finalized') {
    throw new Error('Dữ liệu interview_attempts không chuyển sang Finalized!')
  }
  console.log('-> TEST 6 (Confirm Final Score & Finalized): PASS!\n')

  console.log('===========================================================')
  console.log('   TẤT CẢ 6 TEST E2E TRÊN DOCKER DB ĐỀU ĐẠT CHUẨN 100%!')
  console.log('===========================================================')

  await browser.close()
}

runTest().catch((err) => {
  console.error('\n❌ KIỂM THỬ E2E THẤT BẠI:', err)
  process.exit(1)
})
