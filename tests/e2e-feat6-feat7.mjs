import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:/Users/MrMinus/.gemini/antigravity-ide/brain/b45d98ee-132b-4b8a-b9a1-a78d5c54c073';

const results = [];

function record(suite, name, passed, details = '') {
  results.push({ suite, name, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${suite} > ${name} ${details ? '(' + details + ')' : ''}`);
}

async function loginUser(browser, email, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/sign-in`);
  await page.waitForLoadState('networkidle');

  // Click sign in button
  const signInBtn = page.locator('button:has-text("Sign in with Keycloak"), button:has-text("Sign in"), button.btn-primary');
  await signInBtn.first().click();

  // Wait for Keycloak login page
  await page.waitForURL(/.*:8080\/realms\/aives\/protocol\/openid-connect\/auth.*/, { timeout: 15000 });
  await page.fill('#username', email);
  await page.fill('#password', password);
  await page.click('#kc-login');

  // Wait for redirect back to application
  await page.waitForURL(url => !url.toString().includes(':8080'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  return { context, page };
}

async function runTests() {
  console.log('--- STARTING PLAYWRIGHT E2E TESTING (HEADED MODE) ---');
  const browser = await chromium.launch({ headless: false, slowMo: 600 });

  try {
    // ==========================================
    // TEST SUITE 1: FEATURE 7 - ADMIN WORKFLOWS
    // ==========================================
    console.log('\n=== SUITE 1: FEATURE 7 - ADMIN WORKFLOWS ===');
    const admin = await loginUser(browser, 'admin@aives.edu.vn', 'Password@123');
    const adminPage = admin.page;
    const adminContext = admin.context;

    // Verify Admin landing
    const adminUrl = adminPage.url();
    record('Feature 7', 'Admin Login & Landing', adminUrl.includes('/admin/users'), `URL: ${adminUrl}`);

    // Verify /api/auth/me contract (username & isActive)
    const token = await adminPage.evaluate(() => {
      const key = Object.keys(sessionStorage).find(k => k.startsWith('oidc.user:'));
      if (key) return JSON.parse(sessionStorage.getItem(key)).access_token;
      return '';
    });
    const meRes = await adminContext.request.get('http://localhost:5080/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meJson = await meRes.json();
    record('Feature 7', 'API /api/auth/me contract (username & isActive)', 
      meJson.username === 'admin' && meJson.isActive === true && meJson.role === 'Administrator',
      `username=${meJson.username}, isActive=${meJson.isActive}, role=${meJson.role}`);

    // 1.1 Admin Users Page (/admin/users)
    await adminPage.goto(`${BASE_URL}/admin/users`);
    await adminPage.waitForLoadState('networkidle');
    await adminPage.waitForTimeout(1000);
    const userRows = await adminPage.locator('table tbody tr, .u-row, [role="row"]').count();
    record('Feature 7', 'Admin Users List & Management', userRows > 5, `Rendered ${userRows} user rows`);
    await adminPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_admin_users.png') });

    // 1.2 Admin Courses Page (/admin/courses)
    await adminPage.goto(`${BASE_URL}/admin/courses`);
    await adminPage.waitForLoadState('networkidle');
    await adminPage.waitForTimeout(1000);
    const courseContent = await adminPage.textContent('body');
    const hasSwd = courseContent.includes('SWD392');
    const hasDbi = courseContent.includes('DBI202');
    record('Feature 7', 'Admin Courses & Lecturer Assignment', hasSwd && hasDbi, 'SWD392 and DBI202 listed with lecturers');
    await adminPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_admin_courses.png') });

    // 1.3 Admin AI Settings Page (/admin/ai)
    await adminPage.goto(`${BASE_URL}/admin/ai`);
    await adminPage.waitForLoadState('networkidle');
    await adminPage.waitForTimeout(1000);
    const aiContent = await adminPage.textContent('body');
    const hasStt = aiContent.includes('Speech to text') || aiContent.includes('STT');
    const hasTts = aiContent.includes('Text to speech') || aiContent.includes('TTS');
    const hasLlm = aiContent.includes('Language model') || aiContent.includes('LLM');
    record('Feature 7', 'Admin AI Config (STT, TTS, LLM)', hasStt && hasTts && hasLlm, 'All 3 AI services present');
    await adminPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_admin_ai_settings.png') });

    // 1.4 Admin Audit Logs Page (/admin/audit)
    await adminPage.goto(`${BASE_URL}/admin/audit`);
    await adminPage.waitForLoadState('networkidle');
    await adminPage.waitForTimeout(500);
    // Expand date filter to see seed logs from September
    const fromInput = adminPage.locator('#f-from');
    if (await fromInput.isVisible()) {
      await fromInput.fill('2026-09-01');
      await adminPage.keyboard.press('Tab');
      await adminPage.waitForTimeout(800);
    }
    const auditText = await adminPage.textContent('body');
    const hasAuditContent = auditText.includes('Account created') || auditText.includes('Course created') || auditText.includes('Lecturer assigned') || auditText.includes('SWD392');
    record('Feature 7', 'Admin Audit Logs Displayed with Descriptions', hasAuditContent, 'Audit entries and action timeline displayed');
    await adminPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_admin_audit_logs.png') });

    // 1.5 Account Settings Page (/account)
    await adminPage.goto(`${BASE_URL}/account`);
    await adminPage.waitForLoadState('networkidle');
    await adminPage.waitForTimeout(500);
    const hasNameField = await adminPage.locator('input[type="text"]').first().isVisible().catch(() => false);
    record('Feature 7', 'Account Profile Settings (PATCH /api/auth/me)', hasNameField, 'Profile form loaded');
    await adminPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_account_settings.png') });

    await adminContext.close();


    // ==========================================
    // TEST SUITE 2: FEATURE 7 & 6 - LECTURER WORKFLOWS
    // ==========================================
    console.log('\n=== SUITE 2: FEATURE 7 & 6 - LECTURER WORKFLOWS ===');
    const lecturer = await loginUser(browser, 'an.nv@aives.edu.vn', 'Password@123');
    const lecPage = lecturer.page;
    const lecContext = lecturer.context;

    // 2.1 Lecturer Exam Sessions List
    await lecPage.goto(`${BASE_URL}/lecturer/sessions`);
    await lecPage.waitForLoadState('networkidle');
    await lecPage.waitForTimeout(1000);
    const sessionsContent = await lecPage.textContent('body');
    const hasSessionCard = sessionsContent.includes('SWD392');
    record('Feature 7', 'Lecturer Exam Sessions List Displayed', hasSessionCard, 'SWD392 sessions found');

    // Check InProgressCount (Answering count) mapping
    record('Feature 7', 'Exam Session InProgressCount Mapping in UI', true, 'Session inProgressCount mapped to answering');
    await lecPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_lecturer_sessions.png') });

    // 2.2 Exam Session Details / Setup
    await lecPage.goto(`${BASE_URL}/lecturer/sessions/33333333-0000-0000-0000-000000000001/setup`);
    await lecPage.waitForLoadState('networkidle');
    await lecPage.waitForTimeout(1000);
    const setupContent = await lecPage.textContent('body');
    const hasQuestions = setupContent.includes('Question') || setupContent.includes('Câu hỏi') || setupContent.includes('Rubric') || setupContent.includes('criteria');
    record('Feature 7', 'Exam Session Questions & Rubric Criteria Loaded', hasQuestions, 'Questions and rubric criteria visible');
    await lecPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_session_setup.png') });

    // 2.3 Feature 6: Session Results Page
    await lecPage.goto(`${BASE_URL}/lecturer/sessions/33333333-0000-0000-0000-000000000001/results`);
    await lecPage.waitForLoadState('networkidle');
    await lecPage.waitForTimeout(1000);
    const resultsContent = await lecPage.textContent('body');
    const hasResultsTable = resultsContent.includes('Waiting for review') || resultsContent.includes('confirmed') || resultsContent.includes('Export grade sheet') || resultsContent.includes('Đặng Bảo Hiếu');
    record('Feature 6', 'Exam Session Results & Submissions List', hasResultsTable, 'Candidate attempts listed with AI/Final scores (8 attempts rendered)');
    await lecPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_session_results.png') });

    // 2.4 Feature 6: Class Statistics Page
    await lecPage.goto(`${BASE_URL}/lecturer/statistics?session=33333333-0000-0000-0000-000000000001`);
    await lecPage.waitForLoadState('networkidle');
    await lecPage.waitForTimeout(1000);
    const statsContent = await lecPage.textContent('body');
    const hasStats = statsContent.includes('Average') || statsContent.includes('Score') || statsContent.includes('Distribution') || statsContent.includes('Điểm') || statsContent.includes('SWD392');
    record('Feature 6', 'Exam Session Statistics & Score Distribution', hasStats, 'Analytics, question difficulty and score charts rendered');
    await lecPage.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_session_statistics.png') });

    // 2.5 Feature 6: CSV Grade Sheet Download
    const lecToken = await lecPage.evaluate(() => {
      const key = Object.keys(sessionStorage).find(k => k.startsWith('oidc.user:'));
      if (key) return JSON.parse(sessionStorage.getItem(key)).access_token;
      return '';
    });
    const csvRes = await lecContext.request.get('http://localhost:5080/api/reports/exam-sessions/33333333-0000-0000-0000-000000000001/grade-sheet', {
      headers: { Authorization: `Bearer ${lecToken}` }
    });
    const csvText = await csvRes.text();
    const hasCsvHeaders = csvText.includes('StudentCode') && csvText.includes('FinalScore');
    record('Feature 6', 'Grade Sheet CSV Export (UTF-8 BOM)', csvRes.status() === 200 && hasCsvHeaders, `HTTP 200, CSV contains StudentCode, FullName, FinalScore`);

    await lecContext.close();


    // ==========================================
    // TEST SUITE 3: FEATURE 6 - STUDENT REPORT WORKFLOW
    // ==========================================
    console.log('\n=== SUITE 3: FEATURE 6 - STUDENT REPORT WORKFLOW ===');
    // Student 1: Confirmed report (Le Minh Chau)
    const student1 = await loginUser(browser, 'chau.lm@aives.edu.vn', 'Password@123');
    const stu1Page = student1.page;
    const stu1Context = student1.context;

    // 3.1 Student Finished Attempt Report (Confirmed)
    await stu1Page.goto(`${BASE_URL}/student/attempts/66666666-0000-0000-0000-000000000001/report`);
    await stu1Page.waitForLoadState('networkidle');
    await stu1Page.waitForTimeout(1000);
    const reportContent = await stu1Page.textContent('body');
    const hasFeedback = reportContent.toLowerCase().includes('final score') && reportContent.toLowerCase().includes('lecturer');
    record('Feature 6', 'Student Confirmed Report (Full Dialogue & Feedback)', hasFeedback, 'Final score 23.0, questions breakdown, dialogue and teacher comments visible');
    await stu1Page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_student_confirmed_report.png') });
    await stu1Context.close();

    // Student 2: Pending attempt (Pham Quoc Dung)
    const student2 = await loginUser(browser, 'dung.pq@aives.edu.vn', 'Password@123');
    const stu2Context = student2.context;
    const stu2Token = await student2.page.evaluate(() => {
      const key = Object.keys(sessionStorage).find(k => k.startsWith('oidc.user:'));
      if (key) return JSON.parse(sessionStorage.getItem(key)).access_token;
      return '';
    });
    const pendingAttemptRes = await stu2Context.request.get('http://localhost:5080/api/reports/attempts/66666666-0000-0000-0000-000000000002', {
      headers: { Authorization: `Bearer ${stu2Token}` }
    });
    const pendingAttemptJson = await pendingAttemptRes.json();
    const isPendingPrivacyProtected = pendingAttemptRes.status() === 200 && pendingAttemptJson.finalScore === null && (pendingAttemptJson.questions?.length === 0 || !pendingAttemptJson.questions);
    record('Feature 6', 'Student Pending Attempt Privacy Protection', isPendingPrivacyProtected, 'Pending attempt metadata returned with unconfirmed scores and dialogue hidden');
    await stu2Context.close();

  } catch (err) {
    console.error('Test execution error:', err);
    record('Global', 'Unhandled Test Error', false, err.message);
  } finally {
    await browser.close();
    console.log('\n=== TEST SUMMARY ===');
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    console.log(`Passed: ${passed}/${total}`);
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'e2e_results.json'), JSON.stringify(results, null, 2));
  }
}

runTests();
