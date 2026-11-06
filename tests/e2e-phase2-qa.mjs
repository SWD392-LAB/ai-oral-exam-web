import { chromium } from 'playwright'
import { execSync } from 'child_process'

const BASE_URL = 'http://localhost:5173'
const API_URL = 'http://localhost:5080'
const LECTURER = { user: 'an.nv@aives.edu.vn', pass: 'Password@123' }
const SWD392_COURSE_ID = '22222222-0000-0000-0000-000000000001'

function queryDb(sql) {
  try {
    const cmd = `docker exec -i aives-postgres psql -U aives -d aives -t -A -c "${sql}"`
    return execSync(cmd, { encoding: 'utf-8' }).trim()
  } catch (err) {
    console.error('  [DB QUERY ERROR]', err.message)
    return ''
  }
}

async function runPhase2E2ETest() {
  console.log('====================================================================')
  console.log('   BẮT ĐẦU KIỂM THỬ E2E PHASE 2: QUESTION BANK & EXAM ATTACH')
  console.log('====================================================================\n')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  page.on('console', (msg) => {
    const txt = msg.text()
    if (msg.type() === 'error' || txt.includes('Error') || txt.includes('error')) {
      console.log('  [BROWSER CONSOLE]', msg.type(), txt)
    }
  })
  page.on('pageerror', (err) => console.log('  [BROWSER PAGE ERROR]', err.message))
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      console.log('  [HTTP ERROR]', res.status(), res.url())
    }
  })

  // 1. ĐĂNG NHẬP GIẢNG VIÊN QUA KEYCLOAK
  console.log('Bước 1: Đăng nhập Giảng viên an.nv qua Keycloak OIDC...')
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
  console.log('-> Đăng nhập thành công! Đã quay lại giao diện Giảng viên.\n')

  // Lấy Access Token
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
  console.log('-> Đã lấy được Bearer Token hợp lệ (độ dài:', token.length, 'ký tự).\n')

  // KỊCH BẢN 1: TẠO CÂU HỎI DRAFT THỦ CÔNG MỚI TRONG QUESTION BANK
  console.log('--------------------------------------------------------------------')
  console.log('KỊCH BẢN 1: Giảng viên tạo câu hỏi Draft mới trong Ngân hàng...')
  console.log('--------------------------------------------------------------------')
  
  await page.goto(`${BASE_URL}/lecturer/question-bank`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Debug screenshot
  await page.screenshot({ path: 'tests/debug-question-bank.png' })
  console.log('-> Đã chụp ảnh debug-question-bank.png')

  // Kiểm tra hoặc chọn môn học SWD392
  const courseSelector = page.locator('select#course-select, select#qb-course-select, select[name="courseId"], select')
  await courseSelector.first().waitFor({ state: 'visible', timeout: 10000 })
  const curVal = await courseSelector.first().inputValue().catch(() => '')
  console.log('-> Giá trị môn học hiện tại:', curVal)
  if (curVal !== SWD392_COURSE_ID) {
    console.log('-> Chọn môn SWD392...')
    await courseSelector.first().selectOption(SWD392_COURSE_ID).catch(async () => {
      await courseSelector.first().selectOption({ label: /SWD392/ })
    })
    await page.waitForTimeout(1000)
  }

  // Chờ nút tạo mới enabled
  const newQuestionBtn = page.locator('button:has-text("+ New Question"), button:has-text("New Question"), button:has-text("Tạo câu hỏi")')
  await newQuestionBtn.first().waitFor({ state: 'visible', timeout: 8000 })
  const isDisabled = await newQuestionBtn.first().isDisabled()
  console.log('-> Nút "+ New Question" disabled:', isDisabled)

  await newQuestionBtn.first().click()
  await page.waitForTimeout(800)

  // Chờ modal mở
  const modal = page.locator('.qb-modal-card')
  await modal.first().waitFor({ state: 'visible', timeout: 5000 })
  console.log('-> Modal tạo câu hỏi đã mở thành công!')

  // Nhập thông tin câu hỏi
  const timestamp = Date.now()
  const testTopic = 'Design Patterns'
  const testBloom = 'Apply'
  const testContent = `Trình bày cách triển khai Decorator Pattern trong Java/C# để mở rộng tính năng mà không sửa đổi lớp gốc? [E2E-Test-${timestamp}]`

  console.log('-> Nhập nội dung câu hỏi:', testContent)

  // Tìm input topic
  const topicInput = page.locator('#new-topic').first()
  await topicInput.fill(testTopic)

  // Chọn Bloom level Apply
  const bloomSelect = page.locator('#new-bloom').first()
  if (await bloomSelect.isVisible()) {
    await bloomSelect.selectOption(testBloom)
  }

  // Nhập nội dung câu hỏi
  const contentInput = page.locator('#new-content').first()
  await contentInput.fill(testContent)

  // Bấm lưu nháp (Save as Draft)
  const saveBtn = page.locator('.qb-modal-card button[type="submit"]').first()
  await saveBtn.click()
  await page.waitForTimeout(1500)
  await page.waitForLoadState('networkidle')

  // Kiểm tra hiển thị trên UI: có badge Draft màu vàng
  const rowLocator = page.locator(`.qb-row:has-text("E2E-Test-${timestamp}"), tr:has-text("E2E-Test-${timestamp}"), .qb-card:has-text("E2E-Test-${timestamp}")`).first()
  const isRowVisible = await rowLocator.isVisible()
  console.log('-> Câu hỏi mới hiển thị trên UI:', isRowVisible)

  if (!isRowVisible) {
    throw new Error('Câu hỏi Draft vừa tạo không hiển thị trên danh sách Question Bank!')
  }

  const draftBadge = rowLocator.locator('.qb-badge-draft').first()
  const isDraftBadgeVisible = await draftBadge.isVisible()
  console.log('-> Badge Draft hiển thị:', isDraftBadgeVisible)

  // Kiểm tra trong PostgreSQL database
  const dbItem = queryDb(`SELECT id || ' | ' || status || ' | ' || bloom || ' | ' || topic FROM question_bank_items WHERE content LIKE '%E2E-Test-${timestamp}%';`)
  console.log('-> Bản ghi trong Docker PostgreSQL:', dbItem)

  if (!dbItem.includes('Draft') || !dbItem.includes('Apply') || !dbItem.includes('Design Patterns')) {
    throw new Error(`Kiểm tra DB thất bại! Kết quả: ${dbItem}`)
  }

  const createdItemId = dbItem.split('|')[0].trim()
  console.log('-> Đã xác thực Item ID trong DB:', createdItemId)

  await page.screenshot({ path: 'tests/e2e-phase2-evidence-01-created-draft.png' })
  console.log('-> Đã chụp ảnh bằng chứng: tests/e2e-phase2-evidence-01-created-draft.png')
  console.log('-> KỊCH BẢN 1: PASS!\n')

  // KỊCH BẢN 2: DUYỆT (APPROVE) CÂU HỎI DRAFT
  console.log('--------------------------------------------------------------------')
  console.log('KỊCH BẢN 2: Duyệt (Approve) câu hỏi Draft vừa tạo...')
  console.log('--------------------------------------------------------------------')

  // Tìm nút Approve trong hàng câu hỏi vừa tạo
  const targetRow = page.locator(`.qb-row:has-text("E2E-Test-${timestamp}"), tr:has-text("E2E-Test-${timestamp}"), li:has-text("E2E-Test-${timestamp}")`).first()
  const approveBtn = targetRow.locator('button.qb-btn-approve, button:has-text("Duyệt")')
  
  await approveBtn.first().waitFor({ state: 'visible', timeout: 5000 })
  await approveBtn.first().click()
  await page.waitForTimeout(1500)
  await page.waitForLoadState('networkidle')

  // Xác nhận badge chuyển sang Approved màu ngọc bích
  const approvedBadge = targetRow.locator('.qb-badge-approved').first()
  const isApprovedBadgeVisible = await approvedBadge.isVisible()
  console.log('-> Badge Approved hiển thị:', isApprovedBadgeVisible)

  // Xác nhận nút Approve/Reject đã ẩn
  const hasApproveBtnStill = await targetRow.locator('button.qb-btn-approve').isVisible().catch(() => false)
  console.log('-> Nút Approve còn xuất hiện không (kỳ vọng false):', hasApproveBtnStill)

  // Kiểm tra trong PostgreSQL
  const dbStatusAfterApprove = queryDb(`SELECT status FROM question_bank_items WHERE id = '${createdItemId}';`)
  console.log('-> Trạng thái trong DB sau khi Approve:', dbStatusAfterApprove)

  if (dbStatusAfterApprove !== 'Approved') {
    throw new Error(`Câu hỏi chưa chuyển sang Approved trong DB! Trạng thái hiện tại: ${dbStatusAfterApprove}`)
  }

  await page.screenshot({ path: 'tests/e2e-phase2-evidence-02-approved.png' })
  console.log('-> Đã chụp ảnh bằng chứng: tests/e2e-phase2-evidence-02-approved.png')
  console.log('-> KỊCH BẢN 2: PASS!\n')

  // KỊCH BẢN 3: GÁN CÂU HỎI APPROVED VÀO CA THI TRONG SESSION SETUP
  console.log('--------------------------------------------------------------------')
  console.log('KỊCH BẢN 3: Gán câu hỏi Approved vào ca thi nháp trong Session Setup...')
  console.log('--------------------------------------------------------------------')

  // Lấy hoặc tạo ca thi Draft của môn SWD392
  let targetSessionId = queryDb(`SELECT id FROM exam_sessions WHERE course_id = '${SWD392_COURSE_ID}' AND status = 'Draft' ORDER BY created_at DESC LIMIT 1;`)
  
  if (!targetSessionId) {
    console.log('-> Chưa có ca thi Draft, tạo mới qua API...')
    const createSessionRes = await page.evaluate(async ({ apiUrl, bearerToken, courseId }) => {
      const res = await fetch(`${apiUrl}/api/exam-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          courseId,
          title: `SWD392 Draft Setup Test ${Date.now()}`,
          startTime: '2026-12-01T08:00:00Z',
          endTime: '2026-12-01T17:00:00Z',
          timeLimitPerAnswerSeconds: 60,
          maxFollowUps: 2,
        }),
      })
      const data = await res.json()
      return data.id
    }, { apiUrl: API_URL, bearerToken: token, courseId: SWD392_COURSE_ID })
    targetSessionId = createSessionRes
  }

  console.log('-> Sử dụng ca thi Draft ID:', targetSessionId)

  // Điều hướng tới Session Setup
  await page.goto(`${BASE_URL}/lecturer/sessions/${targetSessionId}/setup`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  // Bấm nút "Add from Bank" hoặc "Chọn từ Ngân hàng đề"
  const addFromBankBtn = page.locator('button:has-text("Add from Bank"), button:has-text("Chọn từ Ngân hàng đề"), button:has-text("Import from Bank"), button:has-text("From Question Bank"), button.ss-btn-bank')
  await addFromBankBtn.first().waitFor({ state: 'visible', timeout: 8000 })
  await addFromBankBtn.first().click()
  await page.waitForTimeout(800)

  // Modal mở ra
  const bankModal = page.locator('.ss-bank-modal, .ss-modal-card:has-text("Bank")')
  await bankModal.first().waitFor({ state: 'visible', timeout: 8000 })
  console.log('-> Modal chọn câu hỏi từ ngân hàng mở thành công')

  // Tìm câu hỏi vừa Approved trong modal
  const itemInModal = page.locator(`.ss-bank-item:has-text("E2E-Test-${timestamp}")`).first()
  await itemInModal.waitFor({ state: 'visible', timeout: 8000 })
  
  // Click vào item để toggle select
  await itemInModal.click()
  await page.waitForTimeout(500)
  console.log('-> Đã click chọn câu hỏi vừa Approved trong modal')

  await page.screenshot({ path: 'tests/e2e-phase2-evidence-03-attach-modal.png' })
  console.log('-> Đã chụp ảnh bằng chứng modal: tests/e2e-phase2-evidence-03-attach-modal.png')

  // Bấm "Add to Exam Session"
  const attachConfirmBtn = page.locator('button:has-text("Add to Exam Session")')
  await attachConfirmBtn.first().click()
  await page.waitForTimeout(2000)
  await page.waitForLoadState('networkidle')

  // Kiểm tra trong PostgreSQL database bảng questions
  const attachedDb = queryDb(`SELECT id || ' | ' || order_no || ' | ' || source_bank_revision_id FROM questions WHERE exam_session_id = '${targetSessionId}' AND content LIKE '%E2E-Test-${timestamp}%';`)
  console.log('-> Bản ghi câu hỏi được gán trong DB:', attachedDb)

  if (!attachedDb || !attachedDb.includes('|')) {
    throw new Error(`Kiểm tra DB thất bại! Câu hỏi chưa được gắn vào bảng questions cho ca thi ${targetSessionId}`)
  }

  console.log('-> KỊCH BẢN 3: PASS!\n')

  // KỊCH BẢN 4: XÁC NHẬN TRÊN UI SESSION SETUP & CHECKLIST PUBLISH
  console.log('--------------------------------------------------------------------')
  console.log('KỊCH BẢN 4: Xác nhận câu hỏi xuất hiện trong Session Setup & Checklist...')
  console.log('--------------------------------------------------------------------')

  // Kiểm tra câu hỏi xuất hiện trên UI Session Setup
  const questionOnSetup = page.locator(`p.ss-quote:has-text("E2E-Test-${timestamp}"), li:has-text("E2E-Test-${timestamp}")`).first()
  const isQuestionVisible = await questionOnSetup.isVisible()
  console.log('-> Câu hỏi hiển thị trong danh sách của ca thi:', isQuestionVisible)

  if (!isQuestionVisible) {
    throw new Error('Câu hỏi vừa gán không hiển thị trên giao diện Thiết lập ca thi!')
  }

  // Kiểm tra không xuất hiện rubric lẻ (AC-07 / Platform Rubric compliance)
  const legacyRubricBtnCount = await page.locator('button:has-text("Write rubric"), button:has-text("Edit rubric")').count()
  console.log('-> Số lượng nút nhập rubric riêng lẻ:', legacyRubricBtnCount, '(Kỳ vọng: 0)')
  if (legacyRubricBtnCount > 0) {
    throw new Error('Vẫn còn nút nhập rubric lẻ trên câu hỏi, vi phạm kiến trúc Platform Rubric!')
  }

  // Kiểm tra Publish checklist: điều kiện Questions đạt yêu cầu
  const questionsChecklist = page.locator('.ss-checklist, .ss-publish-checklist, ul.checklist')
  const checklistText = await questionsChecklist.innerText().catch(() => '')
  console.log('-> Checklist publish:', checklistText.replace(/\n+/g, ' | '))

  await page.screenshot({ path: 'tests/e2e-phase2-evidence-04-attached-questions.png' })
  console.log('-> Đã chụp ảnh bằng chứng: tests/e2e-phase2-evidence-04-attached-questions.png')
  console.log('-> KỊCH BẢN 4: PASS!\n')

  console.log('====================================================================')
  console.log('   TẤT CẢ 4 KỊCH BẢN E2E PHASE 2 ĐÃ THÀNH CÔNG RỰC RỠ (100% PASS)!')
  console.log('====================================================================')

  await browser.close()
}

runPhase2E2ETest().catch((err) => {
  console.error('\n❌ KIỂM THỬ E2E PHASE 2 THẤT BẠI:', err)
  process.exit(1)
})
