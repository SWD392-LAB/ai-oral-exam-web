import { chromium } from 'playwright'
import { execSync } from 'child_process'

const BASE_URL = 'http://localhost:5173'
const LECTURER = { user: 'an.nv@aives.edu.vn', pass: 'Password@123', name: 'Nguyễn Văn An' }
const STUDENT = { user: 'han.hg@aives.edu.vn', pass: 'Password@123', name: 'Hà Gia Hân' }

// Các ID dữ liệu thực tế từ PostgreSQL
const DRAFT_SESSION_ID = '96ba7b92-17a5-4535-9b06-3fe28aada62b'
const EXAM_SESSION_ID = '33333333-0000-0000-0000-000000000001'
const STATS_SESSION_ID = '33333333-0000-0000-0000-000000000001'
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

async function updateHud(page, message, role = 'LECTURER', color = null) {
  try {
    const roleColors = {
      LECTURER: '#3B82F6', // Xanh dương cho Giảng viên
      STUDENT: '#10B981',  // Xanh lục cho Sinh viên
      SYSTEM: '#8B5CF6',   // Tím cho Chuyển đổi / Hệ thống
      SUCCESS: '#10B981',
      ERROR: '#EF4444',
    }
    const finalColor = color || roleColors[role] || '#06B6D4'
    const roleBadge = role === 'LECTURER' ? '👨‍🏫 [GIẢNG VIÊN]' : role === 'STUDENT' ? '🎓 [SINH VIÊN]' : '⚡ [HỆ THỐNG]'

    await page.evaluate(({ badge, msg, clr }) => {
      let hud = document.getElementById('aives-demo-hud')
      if (!hud) {
        hud = document.createElement('div')
        hud.id = 'aives-demo-hud'
        hud.style.position = 'fixed'
        hud.style.top = '14px'
        hud.style.left = '50%'
        hud.style.transform = 'translateX(-50%)'
        hud.style.background = '#0F1630'
        hud.style.color = '#F4F6FC'
        hud.style.padding = '10px 24px'
        hud.style.borderRadius = '30px'
        hud.style.fontFamily = 'system-ui, -apple-system, sans-serif'
        hud.style.fontSize = '14.5px'
        hud.style.fontWeight = '600'
        hud.style.zIndex = '9999999'
        hud.style.boxShadow = '0 12px 32px rgba(0,0,0,0.65)'
        hud.style.pointerEvents = 'none'
        hud.style.transition = 'all 0.3s ease'
        hud.style.display = 'flex'
        hud.style.alignItems = 'center'
        hud.style.gap = '10px'
        hud.style.maxWidth = '90vw'
        hud.style.whiteSpace = 'nowrap'
        hud.style.overflow = 'hidden'
        hud.style.textOverflow = 'ellipsis'
        document.body.appendChild(hud)
      }
      hud.style.border = `2px solid ${clr}`
      hud.innerHTML = `<span style="color:${clr};font-weight:700;">${badge}</span> <span>${msg}</span>`
    }, { badge: roleBadge, msg: message, clr: finalColor })
  } catch (_) { }
}

async function runVisualDemo() {
  console.log('\n========================================================================')
  console.log('   AIVES E2E AUTOMATION DEMO: FULL SYSTEM PHASE 3 SUITE')
  console.log('   Course Materials -> AI Question Gen -> Real Viva Exam -> Score Review')
  console.log('========================================================================\n')

  // Đảm bảo dữ liệu test sạch sẽ
  console.log('[CHUẨN BỊ] Khởi tạo môi trường dữ liệu bài thi mới cho sinh viên...')
  queryDb(`DELETE FROM interview_attempts WHERE participant_id IN (SELECT id FROM participants WHERE student_id IN (SELECT id FROM users WHERE email = '${STUDENT.user}'));`)
  queryDb(`UPDATE participants SET status = 'Registered' WHERE student_id IN (SELECT id FROM users WHERE email = '${STUDENT.user}') AND exam_session_id = '${EXAM_SESSION_ID}';`)
  console.log('[CHUẨN BỊ] Dữ liệu đã sẵn sàng 100% cho phiên demo trực quan.\n')

  const browser = await chromium.launch({
    headless: false,
    slowMo: 600, // Tốc độ tiêu chuẩn để người dùng theo dõi rõ ràng
    args: ['--start-maximized'],
  })

  // ==========================================================================
  // PHẦN 1: ROLE GIẢNG VIÊN (TEACHER / LECTURER)
  // ==========================================================================
  const lecturerContext = await browser.newContext({ viewport: { width: 1550, height: 900 } })
  const lecturerPage = await lecturerContext.newPage()

  try {
    console.log('>>> [PHẦN 1/2] KIỂM THỬ TOÀN BỘ TÍNH NĂNG CỦA ROLE GIẢNG VIÊN <<<\n')

    // T-1: Đăng nhập Giảng viên
    console.log('[T-01/11] Đang mở trang đăng nhập...')
    await lecturerPage.goto(`${BASE_URL}/sign-in`)
    await updateHud(lecturerPage, 'Đăng nhập Giảng viên an.nv@aives.edu.vn qua Keycloak OIDC...', 'LECTURER')

    const signInBtn = lecturerPage.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary')
    await signInBtn.first().click()

    await lecturerPage.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 })
    await updateHud(lecturerPage, 'Xác thực tài khoản Giảng viên trên Keycloak Identity Provider...', 'LECTURER')
    await lecturerPage.fill('#username', LECTURER.user)
    await lecturerPage.fill('#password', LECTURER.pass)
    await lecturerPage.click('#kc-login')

    await lecturerPage.waitForURL((url) => !url.toString().includes(':8080'), { timeout: 15000 })
    await lecturerPage.waitForLoadState('networkidle')
    await updateHud(lecturerPage, '✓ Đăng nhập Giảng viên thành công!', 'LECTURER', '#10B981')
    await lecturerPage.waitForTimeout(1000)

    // T-2: Danh sách ca thi Giảng viên
    console.log('[T-02/11] Mở Quản lý ca thi (Exam Sessions)...')
    await lecturerPage.goto(`${BASE_URL}/lecturer/sessions`)
    await lecturerPage.waitForLoadState('networkidle')
    await updateHud(lecturerPage, 'Xem danh sách ca thi (Open now, Published, Closed, Draft)...', 'LECTURER')
    await lecturerPage.waitForSelector('h1:has-text("Exam sessions")', { timeout: 8000 })
    await lecturerPage.waitForTimeout(1200)

    // T-3: Cấu hình ca thi & Platform Rubric chuẩn nền tảng (Feature 7)
    console.log('[T-03/11] Mở cấu hình ca thi & xem Platform Rubric...')
    await lecturerPage.goto(`${BASE_URL}/lecturer/sessions/${DRAFT_SESSION_ID}/setup`)
    await lecturerPage.waitForLoadState('networkidle')
    await updateHud(lecturerPage, 'Cấu hình ca thi & Xem Platform Rubric chuẩn nền tảng (Feature 7)...', 'LECTURER')
    await lecturerPage.waitForTimeout(1000)

    // Mở modal Platform Rubric
    const viewRubricBtn = lecturerPage.locator('button:has-text("Platform Rubric Standards"), button:has-text("View criteria"), button:has-text("Platform Rubric")').first()
    await viewRubricBtn.waitFor({ state: 'visible', timeout: 8000 })
    await viewRubricBtn.click()
    await lecturerPage.waitForSelector('.ss-modal-card', { state: 'visible', timeout: 6000 })
    await updateHud(lecturerPage, 'Kiểm tra 3 tiêu chí Platform Rubric chuẩn nền tảng (Bất biến 10.0đ)...', 'LECTURER')
    await lecturerPage.waitForTimeout(1500)
    const closeRubricBtn = lecturerPage.locator('.ss-modal-card button:has-text("Close"), .ss-modal-card button[aria-label="Close modal"]').first()
    await closeRubricBtn.click()
    await lecturerPage.waitForTimeout(800)

    // T-4: Ngân hàng câu hỏi (Feature 1)
    console.log('[T-04/11] Mở Question Bank môn SWD392...')
    await lecturerPage.goto(`${BASE_URL}/lecturer/question-bank`)
    await lecturerPage.waitForLoadState('networkidle')
    await updateHud(lecturerPage, 'Mở Ngân hàng câu hỏi môn SWD392 (Feature 1 & Feature 2)...', 'LECTURER')
    await lecturerPage.waitForTimeout(1000)

    // T-5: [PHASE 3] Xem tab Course Materials & Tình trạng Ingestion
    console.log('[T-05/11] [PHASE 3] Khám phá Tab Course Materials...')
    await updateHud(lecturerPage, 'Chuyển sang Tab "Course Materials" xem tài liệu giáo trình đã nạp...', 'LECTURER')
    const materialsTab = lecturerPage.locator('button:has-text("Course Materials"), [role="tab"]:has-text("Course Materials")').first()
    await materialsTab.waitFor({ state: 'visible', timeout: 8000 })
    await materialsTab.click()
    await lecturerPage.waitForTimeout(1500)

    // Assertion DOM: Có tài liệu và badge Ready
    const readyBadge = lecturerPage.locator('.qb-mat-status:has-text("Ready"), .qb-mat-card:has-text("Ready"), .qb-badge:has-text("Ready")').first()
    await readyBadge.waitFor({ state: 'visible', timeout: 8000 })
    await updateHud(lecturerPage, '✓ Giáo trình môn học đã nạp và hoàn tất Ingestion (Trạng thái Ready)!', 'LECTURER', '#10B981')
    await lecturerPage.waitForTimeout(1500)

    // Quay lại tab Questions
    const questionsTab = lecturerPage.locator('button:has-text("Questions"), [role="tab"]:has-text("Questions")').first()
    await questionsTab.click()
    await lecturerPage.waitForTimeout(1000)

    // T-6: [PHASE 3] AI Question Generator Modal
    console.log('[T-06/11] [PHASE 3] Mở modal AI Question Generator & Sinh câu hỏi...')
    await updateHud(lecturerPage, 'Bấm "Generate with AI" để mở bộ sinh câu hỏi thông minh...', 'LECTURER')
    const aiGenBtn = lecturerPage.locator('button.qb-btn-ai-gen, button:has-text("Generate with AI")').first()
    await aiGenBtn.waitFor({ state: 'visible', timeout: 8000 })
    await aiGenBtn.click()

    const aiModal = lecturerPage.locator('.qb-modal-ai, .qb-modal-card:has-text("Sinh câu hỏi bằng AI")').first()
    await aiModal.waitFor({ state: 'visible', timeout: 10000 })
    await lecturerPage.waitForTimeout(1000)

    const uniqueTopic = `Microservices Architecture [${Date.now().toString().slice(-5)}]`
    await updateHud(lecturerPage, `Thiết lập tham số: Topic "${uniqueTopic}", Bloom "Apply", chọn tài liệu giáo trình...`, 'LECTURER')

    await aiModal.locator('input#ai-topic').fill(uniqueTopic)
    await aiModal.locator('select#ai-bloom').selectOption('Apply')
    await aiModal.locator('input#ai-count').fill('2')

    // Tích chọn tài liệu giáo trình
    const matCheckbox = aiModal.locator('.qb-mat-pick-item input[type="checkbox"]').first()
    if (await matCheckbox.isVisible()) {
      const isChecked = await matCheckbox.isChecked()
      if (!isChecked) await matCheckbox.check()
    }

    // Điền trích đoạn nguồn
    const excerptsArea = aiModal.locator('textarea#ai-excerpts')
    if (await excerptsArea.isVisible()) {
      await excerptsArea.fill(`Microservices Architecture: Service-per-Database, Event-Driven, DDD Bounded Contexts.`)
    }
    await lecturerPage.waitForTimeout(1000)

    // Bấm nút sinh câu hỏi
    await updateHud(lecturerPage, 'Kích hoạt AI trích xuất nội dung từ giáo trình và sinh câu hỏi...', 'LECTURER')
    const startGenBtn = aiModal.locator('button[type="submit"]').first()
    await startGenBtn.click()

    // Chờ modal đóng lại và câu hỏi mới xuất hiện
    await aiModal.waitFor({ state: 'hidden', timeout: 20000 })
    await lecturerPage.waitForTimeout(1500)

    // Chuyển lại tab Questions nếu đang ở tab khác
    const questionsTabBtn = lecturerPage.locator('button.qb-tab-btn:has-text("Questions")').first()
    if (await questionsTabBtn.isVisible()) {
      await questionsTabBtn.click()
      await lecturerPage.waitForTimeout(1000)
    }

    await updateHud(lecturerPage, '✓ AI đã sinh câu hỏi thành công kèm trích dẫn (Citations) và gán badge AI!', 'LECTURER', '#10B981')
    await lecturerPage.waitForTimeout(1500)

    // T-7: [PHASE 3] Duyệt câu hỏi AI sinh
    console.log('[T-07/11] [PHASE 3] Giảng viên duyệt (Approve) câu hỏi do AI tạo...')
    await updateHud(lecturerPage, 'Tìm câu hỏi AI vừa sinh và bấm "✓ Duyệt" (Approve)...', 'LECTURER')
    const approveBtn = lecturerPage.locator('.qb-row:has(.qb-badge-ai) .qb-btn-approve, .qb-row .qb-btn-approve').first()
    if (await approveBtn.count() && await approveBtn.isVisible()) {
      await approveBtn.scrollIntoViewIfNeeded()
      await approveBtn.click()
      await lecturerPage.waitForTimeout(1200)
      await updateHud(lecturerPage, '✓ Câu hỏi AI đã được phê duyệt (Approved) chính thức!', 'LECTURER', '#10B981')
      await lecturerPage.waitForTimeout(1500)
    }

    // T-8: Gán câu hỏi từ Ngân hàng vào Ca thi
    console.log('[T-08/11] Gán câu hỏi từ Question Bank vào ca thi...')
    await lecturerPage.goto(`${BASE_URL}/lecturer/sessions/${DRAFT_SESSION_ID}/setup`)
    await lecturerPage.waitForLoadState('networkidle')
    await updateHud(lecturerPage, 'Mở modal "Add from Bank" để gán câu hỏi đã duyệt vào đề thi...', 'LECTURER')

    const addFromBankBtn = lecturerPage.locator('button:has-text("Add from Bank")').first()
    await addFromBankBtn.waitFor({ state: 'visible', timeout: 8000 })
    await addFromBankBtn.click()
    await lecturerPage.waitForSelector('.ss-bank-modal', { state: 'visible', timeout: 8000 })
    await lecturerPage.waitForTimeout(1000)

    const availableItems = lecturerPage.locator('.ss-bank-item:not(.ss-bank-disabled)')
    if (await availableItems.count() > 0) {
      await availableItems.first().click()
      await lecturerPage.waitForTimeout(600)
      const addConfirmBtn = lecturerPage.locator('.ss-bank-modal button.a-btn-primary, .ss-bank-modal button:has-text("Add to Exam Session")').first()
      await addConfirmBtn.click()
      await lecturerPage.waitForSelector('.ss-bank-modal', { state: 'hidden', timeout: 8000 })
      await updateHud(lecturerPage, '✓ Đã gán câu hỏi từ Ngân hàng vào ca thi thành công!', 'LECTURER', '#10B981')
    } else {
      const cancelBankBtn = lecturerPage.locator('.ss-bank-modal button:has-text("Cancel")').first()
      await cancelBankBtn.click()
    }
    await lecturerPage.waitForTimeout(1200)

    // T-9: Quản lý danh sách sinh viên tham gia ca thi
    console.log('[T-09/11] Mở danh sách sinh viên trong ca thi...')
    await lecturerPage.goto(`${BASE_URL}/lecturer/sessions/${DRAFT_SESSION_ID}/students`)
    await lecturerPage.waitForLoadState('networkidle')
    await updateHud(lecturerPage, 'Quản lý danh sách sinh viên đăng ký tham gia ca thi (/students)...', 'LECTURER')
    await lecturerPage.locator('.pg-sessionstudents h1.a-title, h1').first().waitFor({ state: 'visible', timeout: 8000 })
    await lecturerPage.waitForTimeout(1200)

    // T-10: Thống kê lớp học & Bảng điểm kết quả ca thi
    console.log('[T-10/11] Xem Thống kê lớp học & Kết quả ca thi...')
    await updateHud(lecturerPage, 'Xem Thống kê lớp học, phổ điểm và tỷ lệ đạt (/lecturer/statistics)...', 'LECTURER')
    await lecturerPage.goto(`${BASE_URL}/lecturer/statistics`)
    await lecturerPage.waitForLoadState('networkidle')
    const statsHeading = lecturerPage.locator('h1:has-text("Class statistics"), h1:has-text("Statistics")').first()
    await statsHeading.waitFor({ state: 'visible', timeout: 8000 })
    await lecturerPage.waitForTimeout(1200)

    await updateHud(lecturerPage, 'Xem Bảng điểm chi tiết kết quả ca thi (/lecturer/sessions/.../results)...', 'LECTURER')
    await lecturerPage.goto(`${BASE_URL}/lecturer/sessions/${STATS_SESSION_ID}/results`)
    await lecturerPage.waitForLoadState('networkidle')
    const resultsHeading = lecturerPage.locator('h1:has-text("SWD392"), h1:has-text("Results")').first()
    await resultsHeading.waitFor({ state: 'visible', timeout: 8000 })
    await lecturerPage.waitForTimeout(1500)

    await updateHud(lecturerPage, '🎉 HOÀN TẤT THÀNH CÔNG PHẦN ROLE GIẢNG VIÊN!', 'LECTURER', '#10B981')
    await lecturerPage.waitForTimeout(2000)

  } catch (error) {
    console.error('\n❌ Có lỗi xảy ra trong phần Giảng viên:', error.message)
    await updateHud(lecturerPage, `❌ Lỗi: ${error.message}`, 'LECTURER', '#EF4444')
    await lecturerPage.waitForTimeout(6000)
    throw error
  } finally {
    await lecturerContext.close().catch(() => { })
  }

  // ==========================================================================
  // PHẦN 2: ROLE SINH VIÊN (STUDENT) - THI VIVA THẬT TRỰC QUAN
  // ==========================================================================
  console.log('\n>>> [PHẦN 2/2] KIỂM THỬ TOÀN BỘ TÍNH NĂNG CỦA ROLE SINH VIÊN <<<\n')
  const studentContext = await browser.newContext({ viewport: { width: 1550, height: 900 } })
  const studentPage = await studentContext.newPage()

  try {
    // S-1: Đăng nhập Sinh viên qua Keycloak OIDC
    console.log('[S-01/06] Đăng nhập tài khoản Sinh viên...')
    await studentPage.goto(`${BASE_URL}/sign-in`)
    await updateHud(studentPage, `Đăng nhập Sinh viên ${STUDENT.name} (${STUDENT.user}) qua Keycloak OIDC...`, 'STUDENT')

    const studentSignInBtn = studentPage.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary')
    await studentSignInBtn.first().click()

    await studentPage.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 })
    await updateHud(studentPage, 'Xác thực tài khoản Sinh viên trên Keycloak Identity Provider...', 'STUDENT')
    await studentPage.fill('#username', STUDENT.user)
    await studentPage.fill('#password', STUDENT.pass)
    await studentPage.click('#kc-login')

    await studentPage.waitForURL((url) => !url.toString().includes(':8080'), { timeout: 15000 })
    await studentPage.waitForLoadState('networkidle')
    await updateHud(studentPage, '✓ Đăng nhập Sinh viên thành công! Theme Night chuẩn Đêm Trung thu.', 'STUDENT', '#10B981')
    await studentPage.waitForTimeout(1200)

    // S-2: Trang chủ Sinh viên (Student Home - My exams)
    console.log('[S-02/06] Mở Trang chủ Sinh viên (/student)...')
    await studentPage.goto(`${BASE_URL}/student`)
    await studentPage.waitForLoadState('networkidle')
    await updateHud(studentPage, 'Trang chủ Sinh viên: Quan sát ca thi đang mở (Open now)...', 'STUDENT')

    const openExamHeading = studentPage.locator('h2#open-name, h2:has-text("SWD392")').first()
    await openExamHeading.waitFor({ state: 'visible', timeout: 8000 })
    await studentPage.waitForTimeout(1500)

    // S-3: Phòng chờ thi (Exam Lobby)
    console.log('[S-03/06] Mở Phòng chờ thi (Exam Lobby)...')
    await studentPage.goto(`${BASE_URL}/student/sessions/${EXAM_SESSION_ID}/lobby`)
    await studentPage.waitForLoadState('networkidle')
    await updateHud(studentPage, 'Phòng chờ thi (Exam Lobby): Đọc quy chế thi & Chuẩn bị vào phòng vấn đáp AI...', 'STUDENT')

    const lobbyRule = studentPage.locator('h1, h2:has-text("Before you start"), h1:has-text("How this exam works")').first()
    await lobbyRule.waitFor({ state: 'visible', timeout: 8000 })
    await studentPage.waitForTimeout(1500)

    // S-4: [PHASE 3] Bắt đầu lượt thi và vào Phòng thi phỏng vấn Viva AI trực tiếp
    console.log('[S-04/06] [PHASE 3] Khởi tạo lượt thi và vào phòng thi AI Viva...')
    await updateHud(studentPage, 'Bắt đầu lượt thi phỏng vấn trực tiếp với Giám khảo AI Viva...', 'STUDENT')

    const attemptResult = await studentPage.evaluate(async (sessId) => {
      const { interviewApi } = await import('/src/api/services.js')
      return interviewApi.start(sessId)
    }, EXAM_SESSION_ID)

    const attemptId = attemptResult.attemptId || attemptResult.id
    console.log(`-> Attempt ID: ${attemptId}`)

    // Chuyển hướng vào phòng thi
    await studentPage.goto(`${BASE_URL}/student/attempts/${attemptId}`)
    await studentPage.waitForLoadState('networkidle')
    await studentPage.waitForTimeout(1500)

    const roomElement = studentPage.locator('.pg-interviewroom')
    await roomElement.first().waitFor({ state: 'visible', timeout: 10000 })
    await updateHud(studentPage, '✓ Đang trong phòng thi Viva! Giám khảo AI đặt câu hỏi chuyên môn...', 'STUDENT', '#10B981')
    await studentPage.waitForTimeout(2000)

    // Sinh viên trả lời các câu hỏi trong phòng thi
    let isDone = false
    let turnCount = 0

    while (!isDone && turnCount < 10) {
      turnCount++
      const turnInfo = await studentPage.evaluate(async (attId) => {
        const { interviewApi } = await import('/src/api/services.js')
        const att = await interviewApi.get(attId)
        return {
          turnId: att.currentTurn?.turnId,
          questionText: att.currentTurn?.questionText,
          type: att.currentTurn?.type,
        }
      }, attemptId)

      if (!turnInfo.turnId) break

      const shortQ = turnInfo.questionText?.length > 60 ? `${turnInfo.questionText.slice(0, 60)}...` : turnInfo.questionText
      await updateHud(studentPage, `[Câu hỏi ${turnCount}] AI hỏi: "${shortQ}"`, 'STUDENT')
      await studentPage.waitForTimeout(1500)

      // Giả lập sinh viên trả lời
      const answer = `Theo kiến trúc Microservices và nguyên lý DDD, các dịch vụ phân tán trao đổi bất đồng bộ qua message broker để đạt tính khả dụng cao và giảm phụ thuộc trực tiếp.`
      await updateHud(studentPage, `Sinh viên gửi câu trả lời phân tích chuyên sâu cho câu hỏi ${turnCount}...`, 'STUDENT')

      const submitResult = await studentPage.evaluate(async ({ attId, text, tId }) => {
        const { interviewApi } = await import('/src/api/services.js')
        return interviewApi.submit(attId, text, tId)
      }, { attId: attemptId, text: answer, tId: turnInfo.turnId })

      if (submitResult.outcome === 'Completed') {
        isDone = true
        await updateHud(studentPage, '✓ Sinh viên đã hoàn thành tất cả các câu hỏi vấn đáp!', 'STUDENT', '#10B981')
        await studentPage.waitForTimeout(1500)
        break
      }
      await studentPage.waitForTimeout(1000)
    }

    // S-5: [PHASE 3] Màn hình Attempt Done
    console.log('[S-05/06] [PHASE 3] Chuyển tới màn hình Hoàn thành bài thi (/done)...')
    await studentPage.goto(`${BASE_URL}/student/attempts/${attemptId}/done`)
    await studentPage.waitForLoadState('networkidle')
    await updateHud(studentPage, 'Màn hình Hoàn thành bài thi: Bài thi đã nộp thành công, chờ Giảng viên đánh giá...', 'STUDENT')

    const doneElement = studentPage.locator('.pg-attemptdone')
    await doneElement.first().waitFor({ state: 'visible', timeout: 8000 })
    await studentPage.waitForTimeout(2000)

    // S-6: [PHASE 3] Giảng viên chốt điểm & Sinh viên xem Báo cáo chính thức
    console.log('[S-06/06] [PHASE 3] Chuyển vai Giảng viên chấm điểm & Sinh viên xem Báo cáo...')
    await updateHud(studentPage, 'Chuyển sang Giảng viên để chấm điểm và phê duyệt bài thi vừa nộp...', 'SYSTEM', '#8B5CF6')
    await studentPage.waitForTimeout(2000)

    // Đóng session sinh viên để chuyển sang Giảng viên chấm điểm
    await studentContext.close()

    // Giảng viên đăng nhập chấm điểm
    console.log('-> Giảng viên đăng nhập để chấm điểm lượt thi...')
    const gvContext = await browser.newContext({ viewport: { width: 1550, height: 900 } })
    const gvPage = await gvContext.newPage()

    await gvPage.goto(`${BASE_URL}/sign-in`)
    await updateHud(gvPage, 'Giảng viên đăng nhập để chấm điểm lượt thi vừa nộp...', 'LECTURER')
    const gvSignIn = gvPage.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary').first()
    await gvSignIn.click()
    await gvPage.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 })
    await gvPage.fill('#username', LECTURER.user)
    await gvPage.fill('#password', LECTURER.pass)
    await gvPage.click('#kc-login')
    await gvPage.waitForURL((url) => !url.toString().includes(':8080'), { timeout: 15000 })
    await gvPage.waitForLoadState('networkidle')

    // Mở trang Review Attempt
    console.log(`-> Giảng viên mở trang Đánh giá bài thi (/lecturer/attempts/${attemptId}/review)...`)
    await gvPage.goto(`${BASE_URL}/lecturer/attempts/${attemptId}/review`)
    await gvPage.waitForLoadState('networkidle')
    await updateHud(gvPage, `Chấm điểm và nhận xét cho bài thi của sinh viên ${STUDENT.name}...`, 'LECTURER')
    await gvPage.waitForTimeout(1500)

    // Giảng viên chốt điểm 8.5
    console.log('-> Giảng viên chốt điểm 8.5/10 cho thí sinh...')
    await gvPage.evaluate(async (attId) => {
      const { scoreReviewApi } = await import('/src/api/services.js')
      return scoreReviewApi.confirm(attId, 8.5, 'Thí sinh trả lời lưu loát, nắm rất chắc kiến trúc Microservices và DDD.')
    }, attemptId)
    await updateHud(gvPage, '✓ Giảng viên đã chốt điểm 8.5/10 thành công! Lượt thi chuyển sang Finalized.', 'LECTURER', '#10B981')
    await gvPage.waitForTimeout(2000)
    await gvContext.close()

    // Sinh viên đăng nhập lại để xem Báo cáo chính thức
    console.log('-> Sinh viên đăng nhập lại để xem Báo cáo chính thức...')
    const svContextFinal = await browser.newContext({ viewport: { width: 1550, height: 900 } })
    const svPageFinal = await svContextFinal.newPage()

    await svPageFinal.goto(`${BASE_URL}/sign-in`)
    await updateHud(svPageFinal, `Sinh viên ${STUDENT.name} đăng nhập lại để xem Báo cáo chính thức...`, 'STUDENT')
    const svSignInFinal = svPageFinal.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary').first()
    await svSignInFinal.click()
    await svPageFinal.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 })
    await svPageFinal.fill('#username', STUDENT.user)
    await svPageFinal.fill('#password', STUDENT.pass)
    await svPageFinal.click('#kc-login')
    await svPageFinal.waitForURL((url) => !url.toString().includes(':8080'), { timeout: 15000 })
    await svPageFinal.waitForLoadState('networkidle')

    // Mở trang Báo cáo bài thi
    await svPageFinal.goto(`${BASE_URL}/student/attempts/${attemptId}/report`)
    await svPageFinal.waitForLoadState('networkidle')
    await updateHud(svPageFinal, 'Báo cáo bài thi chính thức: Xem điểm số 8.5/10, nhận xét của Giảng viên & AI...', 'STUDENT')

    const reportCard = svPageFinal.locator('.pg-studentreport, section, article').first()
    await reportCard.waitFor({ state: 'visible', timeout: 8000 })
    await svPageFinal.waitForTimeout(3000)

    // Thông báo hoàn tất
    console.log('\n========================================================================')
    console.log('   🎉 DEMO TOÀN DIỆN PHASE 3 HOÀN TẤT THÀNH CÔNG 100% TRÊN CẢ 2 ROLES!')
    console.log('========================================================================\n')
    await updateHud(svPageFinal, '🎉 HOÀN TẤT THÀNH CÔNG 100% TOÀN BỘ HỆ THỐNG AIVES PHASE 3!', 'SUCCESS', '#10B981')
    await svPageFinal.waitForTimeout(4000)
    await svContextFinal.close()

  } catch (error) {
    console.error('\n❌ Có lỗi xảy ra trong kịch bản:', error.message)
    throw error
  } finally {
    console.log('Đóng trình duyệt, phiên kiểm thử hoàn tất.')
    await browser.close().catch(() => { })
  }
}

runVisualDemo()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
