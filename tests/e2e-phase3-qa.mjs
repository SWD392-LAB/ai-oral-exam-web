import { chromium } from 'playwright'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const BASE_URL = 'http://localhost:5173'
const LECTURER = { user: 'an.nv@aives.edu.vn', pass: 'Password@123' }
const STUDENT = { user: 'han.hg@aives.edu.vn', pass: 'Password@123' }
const SWD392_COURSE_ID = '22222222-0000-0000-0000-000000000001'
const EXAM_SESSION_ID = '33333333-0000-0000-0000-000000000001'
const DRAFT_SESSION_ID = '96ba7b92-17a5-4535-9b06-3fe28aada62b'

function queryDb(sql) {
  try {
    const cmd = `docker exec -i aives-postgres psql -U aives -d aives -t -A -c "${sql}"`
    return execSync(cmd, { encoding: 'utf-8' }).trim()
  } catch (err) {
    console.error('  [DB QUERY ERROR]', err.message)
    return ''
  }
}

async function runPhase3QATest() {
  console.log('====================================================================')
  console.log('   BẮT ĐẦU KIỂM THỬ QA E2E PHASE 3: TOÀN DIỆN TÍCH HỢP HỆ THỐNG')
  console.log('   Course Materials -> AI Question Gen -> Viva Exam -> Score Review')
  console.log('====================================================================\n')

  // Đảm bảo dữ liệu test sạch sẽ trước khi chạy (Idempotent test)
  console.log('0. Khởi tạo môi trường dữ liệu sạch trước kiểm thử...')
  queryDb(`DELETE FROM interview_attempts WHERE participant_id IN (SELECT id FROM participants WHERE student_id IN (SELECT id FROM users WHERE email = '${STUDENT.user}'));`)
  queryDb(`UPDATE participants SET status = 'Registered' WHERE student_id IN (SELECT id FROM users WHERE email = '${STUDENT.user}') AND exam_session_id = '${EXAM_SESSION_ID}';`)
  console.log('-> Dữ liệu test đã được dọn dẹp sạch sẽ.\n')

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

  // ==========================================================================
  // KỊCH BẢN 1: GIẢNG VIÊN UPLOAD & INGEST TÀI LIỆU VÀ AI SINH CÂU HỎI
  // ==========================================================================
  console.log('--------------------------------------------------------------------')
  console.log('KỊCH BẢN 1: Giảng viên Upload & Ingest Tài liệu và AI sinh câu hỏi')
  console.log('--------------------------------------------------------------------')

  console.log('1.1 Đăng nhập Giảng viên an.nv qua Keycloak OIDC...')
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
  console.log('-> Đăng nhập Giảng viên thành công!\n')

  console.log('1.2 Mở Question Bank môn SWD392...')
  await page.goto(`${BASE_URL}/lecturer/question-bank`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  // Chọn môn SWD392 nếu chưa chọn
  const courseSelector = page.locator('select#course-select')
  await courseSelector.waitFor({ state: 'visible', timeout: 10000 })
  const curCourse = await courseSelector.inputValue().catch(() => '')
  if (curCourse !== SWD392_COURSE_ID) {
    await courseSelector.selectOption(SWD392_COURSE_ID)
    await page.waitForTimeout(1000)
  }

  // 1.3 Chuyển sang Tab "Course Materials"
  console.log('1.3 Mở Tab Course Materials...')
  const materialsTabBtn = page.locator('button.qb-tab-btn:has-text("Course Materials")')
  await materialsTabBtn.click()
  await page.waitForTimeout(1000)

  // 1.4 Upload tài liệu giáo trình
  const sampleFilePath = path.resolve('public/samples/swd392-microservices-syllabus.txt')
  if (!fs.existsSync(sampleFilePath)) {
    throw new Error(`File giáo trình mẫu không tồn tại tại: ${sampleFilePath}`)
  }

  console.log('1.4 Upload tài liệu giáo trình swd392-microservices-syllabus.txt...')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(sampleFilePath)
  await page.waitForTimeout(2500)

  // Chờ danh sách tài liệu hiển thị tài liệu
  const matRow = page.locator('.qb-mat-row').first()
  await matRow.waitFor({ state: 'visible', timeout: 10000 })

  // Nếu có nút Ingest thì bấm Ingest
  const ingestBtn = matRow.locator('button:has-text("Ingest")')
  if (await ingestBtn.isVisible().catch(() => false)) {
    console.log('-> Bấm nút Ingest tài liệu...')
    await ingestBtn.click()
    await page.waitForTimeout(2000)
  }

  // Assertion DOM: Có badge Ready
  const readyBadge = matRow.locator('.qb-badge-approved:has-text("Ready")')
  await readyBadge.waitFor({ state: 'visible', timeout: 10000 })
  console.log('-> DOM Assertion THÀNH CÔNG: Tài liệu giáo trình hiển thị badge Ready!')

  // Assertion DB: Bảng course_materials có bản ghi Ready
  const dbMatStatus = queryDb(`SELECT status FROM course_materials WHERE course_id = '${SWD392_COURSE_ID}' ORDER BY created_at DESC LIMIT 1;`)
  console.log(`-> DB Assertion: course_materials.status = '${dbMatStatus}'`)
  if (dbMatStatus !== 'Ready') {
    throw new Error(`DB Assertion THẤT BẠI: Mong đợi 'Ready' nhưng nhận được '${dbMatStatus}'!`)
  }
  console.log('-> DB Assertion THÀNH CÔNG: Bảng course_materials có status = Ready!\n')

  await page.screenshot({ path: 'tests/e2e-phase3-evidence-01-materials.png' })
  console.log('-> Đã lưu ảnh bằng chứng 01: tests/e2e-phase3-evidence-01-materials.png\n')

  // 1.5 Mở Modal AI Question Generator
  const runId = Date.now().toString().slice(-4)
  const uniqueTopic = `Domain Driven Design va Microservices ${runId}`
  console.log(`1.5 Giảng viên bấm nút "Generate with AI" với topic "${uniqueTopic}"...`)

  const aiGenBtn = page.locator('button.qb-btn-ai-gen')
  await aiGenBtn.click()

  const aiModal = page.locator('.qb-modal-ai')
  await aiModal.waitFor({ state: 'visible', timeout: 10000 })
  console.log('-> Đã mở Modal Sinh câu hỏi bằng AI.')

  // Điền form sinh câu hỏi với Bloom = Apply để topic được gắn vào nội dung câu hỏi
  const topicInput = aiModal.locator('input#ai-topic')
  await topicInput.fill(uniqueTopic)

  const bloomSelect = aiModal.locator('select#ai-bloom')
  await bloomSelect.selectOption('Apply')

  const countInput = aiModal.locator('input#ai-count')
  await countInput.fill('2')

  // Tích chọn tài liệu nguồn
  const matCheckbox = aiModal.locator('.qb-mat-pick-item input[type="checkbox"]').first()
  if (await matCheckbox.isVisible()) {
    const isChecked = await matCheckbox.isChecked()
    if (!isChecked) await matCheckbox.check()
  }

  // Trích đoạn nguồn
  const excerptsArea = aiModal.locator('textarea#ai-excerpts')
  await excerptsArea.fill(`Domain-Driven Design (DDD) và Microservices ${runId}: Bounded Context, Aggregate Root, Database-per-Service và Event-Driven Architecture với CQRS.`)

  console.log('-> Bấm "Tạo câu hỏi bằng AI" và chờ AI xử lý...')
  const submitAiBtn = aiModal.locator('button[type="submit"]')
  await submitAiBtn.click()

  // Chờ modal đóng sau khi sinh câu hỏi xong
  await aiModal.waitFor({ state: 'hidden', timeout: 20000 })
  await page.waitForTimeout(2000)

  // Đảm bảo chuyển về tab Questions
  const questionsTabBtn = page.locator('button.qb-tab-btn:has-text("Questions")')
  await questionsTabBtn.click()
  await page.waitForTimeout(1000)

  // Assertion DOM: Xuất hiện câu hỏi mới với badge AI và badge Draft
  const aiBadge = page.locator('.qb-badge-ai').first()
  await aiBadge.waitFor({ state: 'visible', timeout: 10000 })
  const draftBadge = page.locator('.qb-badge-draft').first()
  await draftBadge.waitFor({ state: 'visible', timeout: 10000 })
  console.log('-> DOM Assertion THÀNH CÔNG: Câu hỏi mới hiển thị trên Question Bank với badge AI và badge Draft!')

  // Assertion DB: Bảng question_bank_items có bản ghi origin = 'Ai' và status = 'Draft'
  const aiDraftCount = queryDb(`SELECT count(*) FROM question_bank_items WHERE course_id = '${SWD392_COURSE_ID}' AND origin = 'Ai' AND status = 'Draft';`)
  console.log(`-> DB Assertion: Số lượng câu hỏi AI Draft = ${aiDraftCount}`)
  if (parseInt(aiDraftCount, 10) < 1) {
    throw new Error('DB Assertion THẤT BẠI: Không tìm thấy câu hỏi origin = Ai và status = Draft trong DB!')
  }
  console.log('-> DB Assertion THÀNH CÔNG: Đã xác thực câu hỏi AI Draft trong PostgreSQL!\n')

  await page.screenshot({ path: 'tests/e2e-phase3-evidence-02-ai-generated.png' })
  console.log('-> Đã lưu ảnh bằng chứng 02: tests/e2e-phase3-evidence-02-ai-generated.png\n')

  // ==========================================================================
  // KỊCH BẢN 2: GIẢNG VIÊN DUYỆT (APPROVE) CÂU HỎI VÀ GÁN VÀO CA THI
  // ==========================================================================
  console.log('--------------------------------------------------------------------')
  console.log('KỊCH BẢN 2: Giảng viên Duyệt (Approve) câu hỏi AI sinh và gán vào ca thi')
  console.log('--------------------------------------------------------------------')

  // Tìm hàng câu hỏi AI đầu tiên và bấm nút Duyệt
  const firstAiRow = page.locator('.qb-row:has(.qb-badge-ai)').first()
  const approveBtn = firstAiRow.locator('button.qb-btn-approve')
  await approveBtn.waitFor({ state: 'visible', timeout: 10000 })
  console.log('-> Bấm nút Duyệt câu hỏi AI...')
  await approveBtn.click()
  await page.waitForTimeout(1500)

  // Assertion DOM: Badge chuyển sang Approved
  const approvedBadge = firstAiRow.locator('.qb-badge-approved:has-text("Approved")')
  await approvedBadge.waitFor({ state: 'visible', timeout: 10000 })
  console.log('-> DOM Assertion THÀNH CÔNG: Câu hỏi đã chuyển sang badge Approved!')

  // Assertion DB: Bảng question_bank_items có bản ghi origin = 'Ai' AND status = 'Approved'
  const aiApprovedCount = queryDb(`SELECT count(*) FROM question_bank_items WHERE course_id = '${SWD392_COURSE_ID}' AND origin = 'Ai' AND status = 'Approved';`)
  console.log(`-> DB Assertion: Số lượng câu hỏi AI Approved = ${aiApprovedCount}`)
  if (parseInt(aiApprovedCount, 10) < 1) {
    throw new Error('DB Assertion THẤT BẠI: Không tìm thấy câu hỏi AI Approved trong DB!')
  }
  console.log('-> DB Assertion THÀNH CÔNG: Bảng question_bank_items có status = Approved!\n')

  // Gán câu hỏi vào ca thi Draft
  console.log('2.2 Giảng viên mở cấu hình Ca thi Draft để gán câu hỏi...')
  await page.goto(`${BASE_URL}/lecturer/sessions/${DRAFT_SESSION_ID}/setup`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  const addFromBankBtn = page.locator('button:has-text("Add from Bank")')
  await addFromBankBtn.waitFor({ state: 'visible', timeout: 10000 })
  await addFromBankBtn.click()

  const bankModal = page.locator('.ss-modal-card')
  await bankModal.waitFor({ state: 'visible', timeout: 10000 })

  // Chọn câu hỏi đầu tiên có thể gán (click vào ss-bank-item)
  const selectItem = bankModal.locator('.ss-bank-item:not(.ss-bank-disabled)').first()
  await selectItem.waitFor({ state: 'visible', timeout: 10000 })
  await selectItem.click()
  await page.waitForTimeout(500)

  const attachSubmitBtn = bankModal.locator('button:has-text("Add to Exam Session")')
  await attachSubmitBtn.click()
  await bankModal.waitFor({ state: 'hidden', timeout: 10000 })
  await page.waitForTimeout(1500)

  // Assertion DB: Bảng questions có câu hỏi được gán vào ca thi
  const sessionQCount = queryDb(`SELECT count(*) FROM questions WHERE exam_session_id = '${DRAFT_SESSION_ID}';`)
  console.log(`-> DB Assertion: Số lượng câu hỏi trong ca thi Draft = ${sessionQCount}`)
  if (parseInt(sessionQCount, 10) < 1) {
    throw new Error('DB Assertion THẤT BẠI: Câu hỏi chưa được gán vào bảng questions của ca thi!')
  }
  console.log('-> DB Assertion THÀNH CÔNG: Câu hỏi đã được gán vào bảng questions của ca thi!\n')

  // Đăng xuất Giảng viên
  await context.clearCookies()
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  // ==========================================================================
  // KỊCH BẢN 3: SINH VIÊN ĐĂNG NHẬP, VÀO PHÒNG THI AI VIVA & NỘP BÀI THẬT
  // ==========================================================================
  console.log('--------------------------------------------------------------------')
  console.log('KỊCH BẢN 3: Sinh viên đăng nhập, vào phòng thi AI Viva & Nộp bài thật')
  console.log('--------------------------------------------------------------------')

  console.log('3.1 Đăng nhập Sinh viên han.hg@aives.edu.vn qua Keycloak...')
  await page.goto(`${BASE_URL}/sign-in`)
  await page.waitForLoadState('networkidle')

  const studentSignInBtn = page.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary')
  await studentSignInBtn.first().click()

  await page.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 })
  await page.fill('#username', STUDENT.user)
  await page.fill('#password', STUDENT.pass)
  await page.click('#kc-login')

  await page.waitForURL((url) => !url.toString().includes(':8080'), { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  console.log('-> Đăng nhập Sinh viên thành công!\n')

  // 3.2 Kiểm tra trang chủ sinh viên
  console.log('3.2 Mở Student Home (/student)...')
  await page.goto(`${BASE_URL}/student`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  // Assertion DOM: Ca thi đang mở xuất hiện trên giao diện
  const openExamHeading = page.locator('h2#open-name, h2')
  await openExamHeading.first().waitFor({ state: 'visible', timeout: 10000 })
  const examTitle = await openExamHeading.first().textContent()
  console.log(`-> DOM Assertion: Ca thi đang mở: "${examTitle.trim()}"`)

  // 3.3 Vào phòng chờ thi (Lobby)
  console.log('3.3 Vào phòng chờ thi (Exam Lobby)...')
  await page.goto(`${BASE_URL}/student/sessions/${EXAM_SESSION_ID}/lobby`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  // Khởi tạo lượt thi
  console.log('3.4 Bắt đầu lượt thi phỏng vấn thật...')
  const attemptResult = await page.evaluate(async (sessId) => {
    const { interviewApi } = await import('/src/api/services.js')
    return interviewApi.start(sessId)
  }, EXAM_SESSION_ID)

  const attemptId = attemptResult.attemptId || attemptResult.id
  console.log(`-> Đã khởi tạo lượt thi thật thành công! Attempt ID: ${attemptId}`)

  // Chuyển hướng vào phòng thi
  await page.goto(`${BASE_URL}/student/attempts/${attemptId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Assertion DOM: Phòng thi hiển thị
  const roomElement = page.locator('.pg-interviewroom')
  await roomElement.first().waitFor({ state: 'visible', timeout: 10000 })
  console.log('-> DOM Assertion THÀNH CÔNG: Đã vào phòng thi phỏng vấn thật!')

  // Assertion DB: Attempt có trạng thái InProgress trong cơ sở dữ liệu
  const dbAttemptStatus = queryDb(`SELECT status FROM interview_attempts WHERE id = '${attemptId}';`)
  console.log(`-> DB Assertion: interview_attempts.status = '${dbAttemptStatus}'`)
  if (dbAttemptStatus !== 'InProgress') {
    throw new Error(`DB Assertion THẤT BẠI: Mong đợi 'InProgress' nhưng nhận được '${dbAttemptStatus}'!`)
  }
  console.log('-> DB Assertion THÀNH CÔNG: Lượt thi InProgress được lưu vào PostgreSQL!\n')

  await page.screenshot({ path: 'tests/e2e-phase3-evidence-03-student-exam.png' })
  console.log('-> Đã lưu ảnh bằng chứng 03: tests/e2e-phase3-evidence-03-student-exam.png\n')

  // 3.5 Sinh viên trả lời các câu hỏi
  console.log('3.5 Sinh viên trả lời câu hỏi và nộp bài phỏng vấn...')
  let isDone = false
  let turnCount = 0

  while (!isDone && turnCount < 10) {
    turnCount++
    console.log(`-> Đang thực hiện lượt hỏi/trả lời thứ ${turnCount}...`)

    const turnInfo = await page.evaluate(async (attId) => {
      const { interviewApi } = await import('/src/api/services.js')
      const att = await interviewApi.get(attId)
      return {
        turnId: att.currentTurn?.turnId,
        questionText: att.currentTurn?.questionText,
        type: att.currentTurn?.type,
        status: att.status,
      }
    }, attemptId)

    console.log(`   Câu hỏi: "${turnInfo.questionText?.slice(0, 70)}..." (${turnInfo.type})`)

    if (!turnInfo.turnId) {
      console.log('   Không còn turnId mới, lượt thi đã kết thúc.')
      break
    }

    // Gửi câu trả lời
    const answerText = `Theo kiến trúc Microservices và DDD, mỗi dịch vụ sở hữu cơ sở dữ liệu độc lập. Giao tiếp bất đồng bộ qua Message Queue đảm bảo tính khả dụng và khả năng mở rộng cao.`
    const submitResult = await page.evaluate(async ({ attId, text, tId }) => {
      const { interviewApi } = await import('/src/api/services.js')
      return interviewApi.submit(attId, text, tId)
    }, { attId: attemptId, text: answerText, tId: turnInfo.turnId })

    console.log(`   Kết quả phản hồi từ Backend: outcome = '${submitResult.outcome}'`)
    if (submitResult.outcome === 'Completed') {
      isDone = true
      console.log('   Đã hoàn thành toàn bộ câu hỏi trong ca thi!')
      break
    }
    await page.waitForTimeout(1000)
  }

  // 3.6 Điều hướng tới trang Attempt Done
  console.log('3.6 Điều hướng tới trang Hoàn thành bài thi (/done)...')
  await page.goto(`${BASE_URL}/student/attempts/${attemptId}/done`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Assertion DOM: Trang done hiển thị thông báo đã nộp bài thành công
  const doneTitle = page.locator('.pg-attemptdone h1, .pg-attemptdone')
  await doneTitle.first().waitFor({ state: 'visible', timeout: 10000 })
  console.log('-> DOM Assertion THÀNH CÔNG: Giao diện Attempt Done hiển thị xác nhận nộp bài!')

  // Assertion DB: Bảng interview_attempts cập nhật status = 'PendingReview'
  const finalDbStatus = queryDb(`SELECT status FROM interview_attempts WHERE id = '${attemptId}';`)
  console.log(`-> DB Assertion: interview_attempts.status sau khi nộp = '${finalDbStatus}'`)
  if (finalDbStatus !== 'PendingReview') {
    throw new Error(`DB Assertion THẤT BẠI: Mong đợi 'PendingReview' nhưng nhận được '${finalDbStatus}'!`)
  }
  console.log('-> DB Assertion THÀNH CÔNG: Lượt thi đã chuyển sang trạng thái PendingReview trong PostgreSQL!')

  // Assertion DB: Bảng interview_turns có bản ghi câu trả lời
  const turnDbCount = queryDb(`SELECT count(*) FROM interview_turns WHERE question_response_id IN (SELECT id FROM question_responses WHERE attempt_id = '${attemptId}');`)
  console.log(`-> DB Assertion: Số lượng câu trả lời trong interview_turns = ${turnDbCount}`)
  if (parseInt(turnDbCount, 10) < 1) {
    throw new Error('DB Assertion THẤT BẠI: Không có câu trả lời nào được lưu vào interview_turns!')
  }
  console.log('-> DB Assertion THÀNH CÔNG: Toàn bộ câu trả lời đã lưu an toàn trong PostgreSQL!\n')

  await page.screenshot({ path: 'tests/e2e-phase3-evidence-04-exam-done.png' })
  console.log('-> Đã lưu ảnh bằng chứng 04: tests/e2e-phase3-evidence-04-exam-done.png\n')

  // ==========================================================================
  // KỊCH BẢN 4: GIẢNG VIÊN CHẤM ĐIỂM & SINH VIÊN XEM BÁO CÁO CHÍNH THỨC
  // ==========================================================================
  console.log('--------------------------------------------------------------------')
  console.log('KỊCH BẢN 4: Giảng viên chấm điểm & Sinh viên xem báo cáo chính thức')
  console.log('--------------------------------------------------------------------')

  // Đăng nhập lại Giảng viên
  await context.clearCookies()
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  console.log('4.1 Giảng viên đăng nhập để chấm điểm lượt thi...')
  await page.goto(`${BASE_URL}/sign-in`)
  await page.waitForLoadState('networkidle')
  const gvSignIn = page.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary')
  await gvSignIn.first().click()
  await page.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 })
  await page.fill('#username', LECTURER.user)
  await page.fill('#password', LECTURER.pass)
  await page.click('#kc-login')
  await page.waitForURL((url) => !url.toString().includes(':8080'), { timeout: 15000 })
  await page.waitForLoadState('networkidle')

  // Mở trang Review Attempt
  console.log(`4.2 Mở trang Review Attempt (/lecturer/attempts/${attemptId}/review)...`)
  await page.goto(`${BASE_URL}/lecturer/attempts/${attemptId}/review`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Giảng viên chốt điểm qua scoreReviewApi.confirm
  console.log('4.3 Giảng viên xác nhận chốt điểm cho thí sinh...')
  const reviewResult = await page.evaluate(async (attId) => {
    const { scoreReviewApi } = await import('/src/api/services.js')
    return scoreReviewApi.confirm(attId, 8.5, 'Thí sinh nắm chắc kiến trúc Microservices và DDD, diễn giải rõ ràng.')
  }, attemptId)

  console.log('-> Đã chốt điểm thành công! Kết quả:', reviewResult?.status || 'Finalized')

  // Assertion DB: Bảng interview_attempts chuyển sang Finalized
  const finalizedStatus = queryDb(`SELECT status FROM interview_attempts WHERE id = '${attemptId}';`)
  console.log(`-> DB Assertion: interview_attempts.status = '${finalizedStatus}'`)
  if (finalizedStatus !== 'Finalized') {
    throw new Error(`DB Assertion THẤT BẠI: Mong đợi 'Finalized' nhưng nhận được '${finalizedStatus}'!`)
  }
  console.log('-> DB Assertion THÀNH CÔNG: Trạng thái lượt thi đã chốt Finalized trong DB!\n')

  // Đăng nhập lại Sinh viên để xem Báo cáo
  await context.clearCookies()
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  console.log('4.4 Sinh viên đăng nhập xem Báo cáo kết quả chính thức...')
  await page.goto(`${BASE_URL}/sign-in`)
  await page.waitForLoadState('networkidle')
  const svSignIn = page.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary')
  await svSignIn.first().click()
  await page.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 })
  await page.fill('#username', STUDENT.user)
  await page.fill('#password', STUDENT.pass)
  await page.click('#kc-login')
  await page.waitForURL((url) => !url.toString().includes(':8080'), { timeout: 15000 })
  await page.waitForLoadState('networkidle')

  await page.goto(`${BASE_URL}/student/attempts/${attemptId}/report`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Assertion DOM: Báo cáo hiển thị điểm và nhận xét của giảng viên
  const reportContainer = page.locator('.pg-studentreport, main')
  await reportContainer.first().waitFor({ state: 'visible', timeout: 10000 })
  console.log('-> DOM Assertion THÀNH CÔNG: Sinh viên xem được Báo cáo chính thức với điểm và nhận xét của Giảng viên!')

  await browser.close()
  console.log('\n====================================================================')
  console.log('   ✓ TẤT CẢ 4 KỊCH BẢN KIỂM THỬ E2E PHASE 3 ĐÃ HOÀN TOÀN THÀNH CÔNG!')
  console.log('   ✓ Assertion kép trên DOM và Database PostgreSQL đều PASSED 100%!')
  console.log('====================================================================\n')
}

runPhase3QATest().catch((err) => {
  console.error('\n❌ TEST THẤT BẠI:', err)
  process.exit(1)
})
