# Definition of Done (DoD) – Giai đoạn 1: Tích hợp Frontend – Backend
> **Tên tài liệu**: Definition of Done & Architecture Compliance Specification – Phase 1  
> **Dự án**: AIVES (AI-powered Viva Exam System) – SWD392  
> **Phiên bản**: 1.0 (Chốt ngày 02/11/2026)  
> **Chịu trách nhiệm biên soạn**: Agent 1 (DoD Lead & Architecture Compliance)  
> **Áp dụng cho**: Agent 2 (Coder) & Agent 3 (Reviewer)  
> **Căn cứ tài liệu**: `_HANDOFF cho agent moi.md`, `Project-Work-Plan-Minh-Phuc-Khang.md`, `fe_be_integration_plan.md`, `AGENTS.md`.

---

## 1. Mục tiêu & Phạm vi Giai đoạn 1

### 1.2 Nguyên tắc Bất di bất dịch (Ground Rules)
1. **CÔ LẬP DEPENDENCY CỦA KHANG (CHỈ TÍCH HỢP CÁC PHẦN ĐÃ SẴN SÀNG)**:
   - PR #11 của Khang (Question Bank F1) hiện vẫn đang mở và chưa merge vào nhánh `develop` của BE.
   - Do đó, **CHỈ tích hợp các chức năng độc lập đã được merge vào `develop` (từ PR #9 của Minh và PR #8 của Phúc)**:
     - Platform Rubric (`GET /api/platform-rubric`).
     - Quy trình xuất bản ca thi gắn Platform Rubric chuẩn (`POST /api/exam-sessions/{id}/publish`).
     - Quy trình duyệt điểm bài thi có lưu nháp (`PUT .../score-review/draft` và `POST .../score-review/confirm`).
   - Tuyệt đối **KHÔNG** tích hợp các API/chức năng còn phụ thuộc vào PR #11 của Khang (như attach câu hỏi từ Question Bank, duyệt/loại câu hỏi trong ngân hàng) cho đến khi Khang merge xong và chốt hợp đồng.
2. **TUYỆT ĐỐI KHÔNG SỬA CODE BACKEND**:
   - Mọi công việc của Frontend Team CHỈ được phép thực hiện trên repo `ai-oral-exam-web`.
   - Tuyệt đối **KHÔNG** chỉnh sửa bất kỳ file nào trong repo Backend `ai-oral-exam-api` (của Minh, Phúc, Khang) hoặc cấu hình Keycloak.
   - Nếu phát hiện Backend trả mã lỗi, sai DTO hoặc thiếu sót ngoài dự kiến: **phải ghi nhận và báo cáo lại ngay cho Hiệu**, không tự ý "nhảy sang" sửa code BE.
3. **TUYỆT ĐỐI KHÔNG TỰ Ý COMMIT, PUSH GIT**:
   - **CHỈ commit khi Hiệu yêu cầu rõ ràng trong tin nhắn hiện tại.** Tuyệt đối không tự ý commit hay push dưới mọi hình thức.
   - Tác giả commit bắt buộc là `AkioChan0308`. Không thêm dòng credit/co-authored AI.
4. **Bảo tồn mã nguồn & Kiến trúc**:
   - Không tự ý xóa file; giữ nguyên cấu trúc thư mục hiện tại.
   - Không cài thêm TailwindCSS; tuân thủ Design System "Đêm Trung thu" (scoped CSS `.pg-...`, theme Moonlight).

---

## 2. Đặc tả Hợp đồng API (API Contract Specification)

Căn cứ theo code Backend tại `fa76d053` (`AiOralExam.Modules.AccessConfig` và `AiOralExam.Modules.Interview`):

### 2.1 Endpoint Platform Rubric (Chỉ đọc)
- **Route**: `GET /api/platform-rubric`
- **Quyền**: `Lecturer` hoặc `Administrator`
- **Response Model**: `RubricVersionDetailDto`
  ```json
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "templateId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "courseId": null,
    "versionNo": 1,
    "maxScore": 10.0,
    "isSealed": true,
    "isActive": true,
    "createdBy": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "createdAt": "2026-11-01T10:00:00Z",
    "criteria": [
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "orderNo": 1,
        "description": "Kiến thức chuyên môn và độ chính xác của câu trả lời",
        "maxPoints": 4.0
      },
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "orderNo": 2,
        "description": "Khả năng phân tích, phản biện và trả lời câu hỏi xoáy",
        "maxPoints": 3.5
      },
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "orderNo": 3,
        "description": "Phong thái, cấu trúc trình bày và sự tự tin",
        "maxPoints": 2.5
      }
    ]
  }
  ```

### 2.2 Endpoint Tạo & Xuất bản Ca thi (Exam Session Lifecycle)
- **Tạo ca thi nháp**: `POST /api/exam-sessions`
  - Payload mặc định: `rubricMode: "SharedVersion"` (BE tự động gắn `RubricVersionId` của Platform Rubric đang `isActive`).
- **Xuất bản ca thi**: `POST /api/exam-sessions/{id}/publish`
  - Điều kiện Backend kiểm tra:
    - `Status == Draft`
    - `Questions.Count > 0`
    - `Participants.Count > 0`
    - `RubricMode == SharedVersion` và có `selectedVersion` đang hoạt động.
    - **LƯU Ý CỰC KỲ QUAN TRỌNG**: Backend cấm `s.Questions.Any(x => x.Rubric is not null)`. Không được gửi `saveRubric` riêng cho câu hỏi trong session `SharedVersion`.
- **Đóng ca thi bằng tay**: `POST /api/exam-sessions/{id}/close`

### 2.3 Endpoint Duyệt & Chốt Điểm (Score Review Lifecycle)
- **Lấy bài thi để review**: `GET /api/interview-attempts/{id}/review`
  - Trả về `AttemptResult`:
    ```json
    {
      "attemptId": "...",
      "examSessionId": "...",
      "studentId": "...",
      "status": "PendingReview" | "Finalized",
      "startedAt": "...",
      "completedAt": "...",
      "review": {
        "reviewerId": "...",
        "finalScore": 8.5,
        "comment": "Trả lời tốt phần kiến thức nền tảng...",
        "status": "Pending" | "Approved",
        "reviewedAt": "..."
      } | null,
      "responses": [ ... ]
    }
    ```
- **Lưu nháp đánh giá**: `PUT /api/interview-attempts/{id}/score-review/draft`
  - Payload: `{ "finalScore": 8.5, "comment": "Nháp nhận xét..." }`
  - Response: `ScoreReviewResult` có `"status": "Pending"`.
  - Trạng thái bài thi vẫn giữ: `PendingReview`.
- **Chốt điểm chính thức từ bản nháp**: `POST /api/interview-attempts/{id}/score-review/confirm`
  - Không cần payload.
  - Chuyển `ScoreReview` sang `"status": "Approved"` và bài thi sang `"status": "Finalized"`.
- **Chốt điểm trực tiếp (1 bước)**: `PUT /api/interview-attempts/{id}/score-review`
  - Payload: `{ "finalScore": 8.5, "comment": "Chốt điểm..." }`
  - Response: `ScoreReviewResult` có `"status": "Approved"`.

---

## 3. Danh sách File Cần Thay đổi / Bổ sung

| STT | Đường dẫn file | Vai trò | Thay đổi chính |
|---|---|---|---|
| 1 | `src/api/services.js` | Shared API Service Adapter | Thêm `rubricApi.getPlatformRubric()`; cập nhật `examConfigApi.get()` & `publishCheck`; cập nhật `scoreReviewApi.saveDraft()` & `scoreReviewApi.confirm()`. |
| 2 | `src/features/exam-config/SessionSetupPage.jsx` | UI Quản lý ca thi | Bỏ toàn bộ form nhập rubric từng câu; thêm nút và modal xem Platform Rubric; sửa 3 tiêu chí Publish check. |
| 3 | `src/features/exam-config/SessionSetup.css` | Scoped Styling | Bổ sung style cho modal/panel xem Platform Rubric theo chuẩn Moonlight / Đêm Trung thu. |
| 4 | `src/features/score-review/ReviewAttemptPage.jsx` | UI Chấm điểm GV | Thêm nút "Save draft"; hiển thị trạng thái bản nháp (`Pending`); hỗ trợ chốt điểm (`Approved`); hiển thị badge đã chốt. |
| 5 | `src/features/score-review/ReviewAttempt.css` | Scoped Styling | Bổ sung styling cho badge trạng thái Nháp / Đã chốt và các nút thao tác. |
| 6 | `src/mocks/handlers.js` / mock services | Mock Data Fallback | Đồng bộ mock platform rubric và score review draft để chạy offline mượt mà. |

---

## 4. Quy chuẩn UI/UX "Đêm Trung thu" & Thiết kế Bắt buộc

1. **Theme Portal Giảng viên**: Sử dụng bảng màu `Moonlight` (sáng ngà dịu nhẹ, thanh nhã):
   - Nền chính: `#F4F6FC` hoặc `var(--bg-moonlight)` / `var(--paper)`
   - Màu chữ tiêu đề: `var(--night-indigo)` (`#0F1630`)
   - Font chữ: Tiêu đề dùng `Alegreya` (serif sang trọng), nội dung dùng `Lexend` (sans-serif hiện đại, rõ ràng).
   - Màu ngữ nghĩa:
     - Vàng rằm (`var(--lantern-gold)` / `var(--gold-ink)`): AI gợi ý điểm, biểu tượng trăng khuyết crescent gold.
     - Xanh ngọc bích (`var(--jade-ink)`): Trạng thái hoàn thành, lưu thành công, thông tin tham chiếu chuẩn.
     - Đỏ sơn mài (`var(--red-ink)` / `var(--ember-text)`): Cảnh báo, lỗi, điểm đóng ca thi.
2. **Quy tắc Scoped CSS**:
   - Mọi class CSS của `SessionSetupPage` bắt buộc nằm trong phạm vi `.pg-sessionsetup` hoặc prefix `.ss-`.
   - Mọi class CSS của `ReviewAttemptPage` bắt buộc nằm trong phạm vi `.pg-reviewattempt` hoặc prefix `.a-`.
   - **Tuyệt đối KHÔNG** viết CSS toàn cục vỡ layout màn khác. **Tuyệt đối KHÔNG** thêm TailwindCSS.
3. **Trải nghiệm thao tác (Micro-interactions)**:
   - Các thao tác lưu nháp và chốt điểm phải có trạng thái loading, feedback rõ ràng (toast/badge báo "Bản nháp đã lưu lúc HH:mm").
   - Modal xem Platform Rubric có nút đóng (Esc hoặc click backdrop), hiển thị bảng tiêu chí gọn gàng, rõ ràng từng tiêu chí và điểm tối đa.

---

## 5. Bộ Tiêu chí Kiểm thử Nghiệm thu (Acceptance Criteria - AC)

### AC-01: Lấy và Xem Platform Rubric trên Session Setup
- **Given**: Giảng viên đang ở màn hình Thiết lập ca thi (`/lecturer/exam-sessions/{id}/setup`).
- **When**: Giảng viên bấm nút "Platform Rubric Standards" (hoặc "Xem tiêu chí chuẩn nền tảng").
- **Then**:
  - Modal/Drawer mở ra, hiển thị tiêu đề bộ tiêu chí nền tảng, số hiệu phiên bản (ví dụ: `v1`), trạng thái `Active & Sealed`.
  - Danh sách tiêu chí hiển thị đầy đủ: Thứ tự, Tên/Mô tả tiêu chí, Thang điểm tối đa của từng tiêu chí.
  - Tổng điểm các tiêu chí khớp với điểm chuẩn nền tảng (ví dụ: `10.0` điểm).

### AC-02: Loại bỏ Luồng Viết Rubric Riêng cho Từng Câu hỏi
- **Given**: Giảng viên nạp danh sách câu hỏi qua import file hoặc nhập tay.
- **When**: Quan sát danh sách câu hỏi hiển thị trong mục "Questions".
- **Then**:
  - Không còn nút "Write rubric" / "Edit rubric" tại từng câu hỏi.
  - Không còn ô nhập điểm tối đa hay hướng dẫn chấm lẻ cho từng câu.
  - Không còn badge cảnh báo "No rubric yet" màu đỏ ở từng câu hỏi.
  - Mỗi câu hỏi chỉ hiển thị nội dung câu hỏi và thứ tự câu (`Question 1`, `Question 2`...).

### AC-03: Điều kiện Xuất bản Ca thi (Publish Checklist)
- **Given**: Giảng viên ở màn hình Thiết lập ca thi.
- **When**: Kiểm tra thanh checklist xuất bản "checks met".
- **Then**:
  - Hệ thống kiểm tra 3 điều kiện chính:
    1. **Questions**: Đã có ≥ 1 câu hỏi (`hasQuestion`).
    2. **Platform Rubric**: Đã gắn bộ tiêu chí chuẩn của nền tảng (`hasPlatformRubric` luôn thỏa mãn với session mới).
    3. **Students**: Đã có ≥ 1 sinh viên đăng ký trong danh sách (`hasStudent`).
  - Kèm điều kiện khung giờ: `startTime < endTime` (`hasWindow`).
  - Khi đủ điều kiện, nút **Publish exam session** chuyển sang trạng thái sẵn sàng (active).
  - Khi bấm Publish, hệ thống gọi `POST /api/exam-sessions/{id}/publish` thành công, chuyển trạng thái sang `Published`.

### AC-04: Lưu Nháp Đánh giá Chấm điểm (Score Review - Save Draft)
- **Given**: Giảng viên mở bài thi của sinh viên ở trạng thái `PendingReview` tại `/lecturer/review/{attemptId}`.
- **When**: Giảng viên điều chỉnh điểm số cuối (Final Score) và nhập nhận xét (Comment), sau đó bấm nút **"Save Draft"** (Lưu nháp).
- **Then**:
  - Frontend gọi `PUT /api/interview-attempts/{id}/score-review/draft` với đúng payload `{ finalScore, comment }`.
  - Phản hồi trả về `ScoreReviewResult` với `status: 'Pending'`.
  - Giao diện hiển thị badge hoặc thông báo: "Draft saved at HH:mm" (hoặc "Bản nháp đã lưu").
  - Trạng thái bài thi vẫn là `Waiting for review` / `PendingReview` (chưa khóa bài).
  - Sinh viên vẫn thấy trạng thái "Waiting for lecturer review", chưa xem được điểm chính thức.

### AC-05: Tải Lại Bản Nháp Đã Lưu (Load Draft Review)
- **Given**: Bài thi đã có bản nháp được lưu trước đó (`review.status === 'Pending'`).
- **When**: Giảng viên tải lại trang (reload) hoặc truy cập lại `/lecturer/review/{attemptId}`.
- **Then**:
  - Dữ liệu hiển thị nạp đúng điểm số đã lưu nháp trong ô điểm và nhận xét đã lưu trong ô comment.
  - Hiển thị rõ trạng thái: "Draft review (Pending approval)" kèm thời gian lưu gần nhất.
  - Cung cấp 2 lựa chọn hành động:
    - **"Confirm Final Score"**: Chốt điểm chính thức từ bản nháp.
    - **"Update Draft"**: Tiếp tục chỉnh sửa và cập nhật lại bản nháp.

### AC-06: Chốt Điểm Chính Thức (Score Review - Confirm Final Score)
- **Given**: Giảng viên đã sẵn sàng chốt điểm cho bài thi (có thể từ điểm AI gợi ý, từ bản nháp hoặc nhập trực tiếp).
- **When**: Giảng viên bấm nút **"Confirm Final Score"**.
- **Then**:
  - Frontend gọi API chốt điểm (`POST .../score-review/confirm` nếu đã có nháp, hoặc `PUT .../score-review` nếu chốt trực tiếp).
  - Phản hồi trả về `ScoreReviewResult` có `status: 'Approved'`, trạng thái bài thi chuyển thành `Finalized`.
  - Giao diện chuyển sang trạng thái Confirmed (Đã chốt điểm):
    - Khóa các ô nhập điểm và nhận xét (chuyển sang hiển thị chỉ đọc).
    - Ẩn nút "Save Draft" và "Confirm Final Score".
    - Hiển thị badge trăng tròn ngọc bích `Confirmed by you at HH:mm`.
  - Nút điều hướng sang bài thi tiếp theo hiển thị rõ ràng.

### AC-07: Khả năng Chạy Tương thích Đôi (Mock Mode & Real API Mode)
- **Given**: Ứng dụng chạy ở chế độ `VITE_USE_MOCKS=true` hoặc `VITE_USE_MOCKS=false`.
- **When**: Thực hiện luồng xem Platform Rubric, tạo ca thi, lưu nháp điểm và chốt điểm.
- **Then**:
  - Khi `VITE_USE_MOCKS=true`: Dữ liệu mock trả về đầy đủ DTO Platform Rubric và hỗ trợ lưu nháp vào bộ nhớ client/mock handlers mà không sinh lỗi console.
  - Khi `VITE_USE_MOCKS=false`: Kết nối trơn tru với Backend `http://localhost:5080`, gửi token Bearer Keycloak chuẩn xác, mã HTTP trả về đúng chuẩn (200/204).

### AC-08: Kiểm tra Không phát sinh Lỗi Lệch luồng (Zero Regression)
- **Given**: Các màn hình khác trong hệ thống: Admin Users (`AdminUsersPage`), Admin Courses (`AdminCoursesPage`), Class Results (`ClassResultsPage`), Class Statistics (`ClassStatisticsPage`).
- **When**: Điều hướng và thao tác trên các màn hình này.
- **Then**:
  - Toàn bộ hoạt động bình thường, không bị vỡ giao diện hoặc mất dữ liệu.
  - Lệnh build `npm run build` chạy thành công không có lỗi syntax, TypeScript hoặc ESLint blocking.

---

## 6. Checklist Kiểm tra cho Agent 2 (Coder)

Agent 2 đã hoàn thành đối chiếu từng mục trước khi bàn giao:

- [x] **1. API Services Layer (`src/api/services.js`)**:
  - [x] Bổ sung object `rubricApi`:
    ```javascript
    export const rubricApi = {
      getPlatformRubric: async () => { ... } // GET /api/platform-rubric
    }
    ```
  - [x] Cập nhật `scoreReviewApi`:
    - `saveDraft(attemptId, finalScore, comment)`: Gọi `PUT /api/interview-attempts/{id}/score-review/draft`.
    - `confirm(attemptId, finalScore, comment)`: Gọi `POST /api/interview-attempts/{id}/score-review/confirm` hoặc `PUT /api/interview-attempts/{id}/score-review`.
    - `get(attemptId)`: Parse chính xác trường `review.status` (`'Pending'` vs `'Approved'`).
  - [x] Cập nhật `examConfigApi.get()`:
    - Loại bỏ lọc `missingRubrics` theo từng câu hỏi.
    - Cập nhật `publishCheck`: `{ hasQuestion, hasPlatformRubric: true, hasStudent, hasWindow }`.
- [x] **2. Màn hình Thiết lập Ca thi (`SessionSetupPage.jsx`)**:
  - [x] Xóa bỏ toàn bộ phần editor rubric ở từng item câu hỏi.
  - [x] Xóa bỏ các state và handler không còn dùng: `maxes`, `guides`, `saveRubric`, `openEditor`, `closeEditor`.
  - [x] Thêm nút/panel "Platform Rubric Standards" hiển thị thông tin tiêu chí chuẩn.
  - [x] Thêm modal hoặc drawer xem chi tiết tiêu chí nền tảng khi bấm xem.
  - [x] Cập nhật thanh Publish checklist: hiển thị "Platform Rubric (Pinned)" đạt tích xanh, kiểm tra câu hỏi và sinh viên.
- [x] **3. Màn hình Chấm điểm (`ReviewAttemptPage.jsx`)**:
  - [x] Phân biệt rõ 3 trạng thái của bài thi:
    1. Chưa chấm / Đang xem gợi ý AI (`view === 'pending'`, `review === null`).
    2. Đã có bản nháp lưu (`review?.status === 'Pending'`).
    3. Đã chốt điểm chính thức (`review?.status === 'Approved'` hoặc `status === 'Finalized'`).
  - [x] Thêm nút **"Save Draft"** trong giao diện điều chỉnh điểm (`isAdjusting`).
  - [x] Hiển thị thông báo "Bản nháp đã lưu lúc ..." khi lưu nháp thành công.
  - [x] Khi đã chốt điểm (`isConfirmed`): Hiển thị view chỉ đọc, không cho sửa hay lưu nháp tiếp.
- [x] **4. Mock Handlers (`src/mocks/`)**:
  - [x] Thêm mock handler cho `GET /api/platform-rubric`.
  - [x] Cập nhật mock handler cho `PUT /api/interview-attempts/{id}/score-review/draft`.
  - [x] Đảm bảo chuyển đổi giữa mock và API thật không gây crash.
- [x] **5. Tuân thủ Quy tắc Dự án**:
  - [x] **Tuyệt đối KHÔNG sửa bất kỳ file nào trong repo Backend (`ai-oral-exam-api`) hay Keycloak**. Nếu gặp lỗi từ BE, ghi nhận để báo cáo Hiệu.
  - [x] Không tự ý commit hay push git (chờ Hiệu ra lệnh trực tiếp).
  - [x] Không dùng TailwindCSS; viết scoped CSS sạch sẽ.
  - [x] Giữ nguyên font Alegreya + Lexend và hệ màu Đêm Trung thu.
  - [x] Chạy `npm run build` kiểm tra xanh 100%.

---

## 7. Checklist Kiểm tra cho Agent 3 (Reviewer)

Agent 3 đã thẩm định nghiêm ngặt theo các tiêu chí:

- [x] **1. Kiểm tra Mã nguồn (Code Quality & Karpathy Mindset)**:
  - [x] **Phạm vi file sửa**: Xác nhận Agent 2 CHỈ sửa file trong repo `ai-oral-exam-web`, KHÔNG đụng vào repo BE `ai-oral-exam-api`.
  - [x] Mã nguồn có ngắn gọn, đúng trọng tâm không? Có sinh code thừa (dead code) từ logic rubric cũ không?
  - [x] Các hàm helper có được tái sử dụng từ `utils/format.js` không?
  - [x] Có tồn tại `console.log` rác hoặc comment AI hoa mỹ không?
- [x] **2. Kiểm tra Tuân thủ Kiến trúc (Architecture & API Contract Compliance)**:
  - [x] Route `GET /api/platform-rubric` có đúng đường dẫn chuẩn không? (Không nhầm sang `/api/rubrics/platform`).
  - [x] Route lưu nháp có đúng `PUT /api/interview-attempts/{id}/score-review/draft` không?
  - [x] Phương thức publish có tuyệt đối KHÔNG gửi kèm rubric lẻ cho câu hỏi không?
- [x] **3. Kiểm tra Trải nghiệm & Giao diện (UI/UX Review)**:
  - [x] Modal xem Platform Rubric có hiển thị trang nhã, đúng phong cách Moonlight không?
  - [x] Nút Save Draft và Confirm Final Score có phân cấp thị giác rõ ràng không (Primary vs Secondary)?
  - [x] Trạng thái đã lưu nháp có thông báo thời gian rõ ràng, không làm người dùng hoang mang không?
- [x] **4. Kiểm tra Chức năng, Unit Test & Kiểm thử E2E trên Docker DB (Testing & E2E Verification)**:
  - [x] **Unit / Build Test**: Chạy `npm run build` xác nhận không có lỗi build/lint/syntax.
  - [x] **Kiểm thử Mock Mode**: Chạy với `VITE_USE_MOCKS=true`, xác nhận UI hoạt động mượt mà không có lỗi console.
  - [x] **Kiểm thử E2E trên Docker DB (BẮT BUỘC theo yêu cầu của Hiệu)**:
    - [x] Khởi động Docker containers: `aives-postgres` (port 5432) và `Keycloak` (port 8080).
    - [x] Chạy Backend API tại `http://localhost:5080` (`ASPNETCORE_ENVIRONMENT=Development dotnet run --no-launch-profile --urls http://localhost:5080`).
    - [x] Chạy Frontend với `VITE_USE_MOCKS=false` tại cổng `5173`.
    - [x] Thực hiện kịch bản E2E thực tế:
      1. Đăng nhập Giảng viên qua Keycloak thật (`an.nv@aives.edu.vn`).
      2. Mở thiết lập ca thi: Gọi API thật `GET /api/platform-rubric`, mở modal xem Platform Rubric chuẩn của nền tảng thành công.
      3. Tạo ca thi mới, nạp câu hỏi và sinh viên -> Bấm **Publish**: Backend lưu trạng thái `Published` và pin Platform Rubric thành công.
      4. Mở bài thi chờ duyệt (`/lecturer/attempts/{id}/review`): Nhập điểm và nhận xét -> Bấm **Save Draft** -> API `PUT .../score-review/draft` trả về 200, DB lưu bản ghi `score_reviews` trạng thái `Pending`.
      5. F5 / Reload trang: Dữ liệu bản nháp được load lại chính xác.
      6. Bấm **Confirm Final Score**: API `POST .../score-review/confirm` (hoặc `PUT .../score-review`) trả về 200, bài thi chuyển sang `Finalized`, `score_reviews` chuyển sang `Approved`.
    - [x] Ghi lại bằng chứng kiểm thử (ảnh chụp hoặc log test) đính kèm vào báo cáo nghiệm thu.

---

## 8. Quy trình Nghiệm thu Cuối cùng (Agent 1 Sign-Off)

Sau khi Agent 2 hoàn tất lập trình và Agent 3 gửi báo cáo Review đạt yêu cầu:
1. **Agent 1** đã kiểm tra đối chiếu trực tiếp trên mã nguồn và chạy nghiệm thu tổng thể.
2. Xác nhận 8 tiêu chí Acceptance Criteria (AC-01 -> AC-08) đều đạt trạng thái **PASS**.
3. Lập báo cáo nghiệm thu chính thức và trình bày kết quả cho Hiệu (`AkioChan0308`) phê duyệt trước khi commit.

---

## 9. Biên bản Nghiệm thu Chính thức Giai đoạn 1 (Official Sign-Off)

- **Người thẩm định & Nghiệm thu**: Agent 1 (DoD Lead & Architecture Compliance)
- **Thời điểm nghiệm thu**: 02/11/2026 – 21:05 (UTC+7)
- **Trạng thái nghiệm thu**: **APPROVED & READY FOR COMMIT**

### 9.1 Bảng Tổng hợp Thẩm định Acceptance Criteria (AC-01 -> AC-08)

| Mã AC | Tiêu chí Nghiệm thu | Kết quả | Ghi chú Thẩm định |
|---|---|:---:|---|
| **AC-01** | Lấy và Xem Platform Rubric trên Session Setup | **PASS** | Modal Platform Rubric hiển thị chuẩn v1, Active & Sealed, 3 tiêu chí tổng 10.0 pts. Bằng chứng: `tests/e2e-evidence-01-rubric-modal.png`. |
| **AC-02** | Loại bỏ Luồng Viết Rubric Riêng Từng Câu hỏi | **PASS** | Xóa hoàn toàn 100% nút Write/Edit rubric lẻ, dead state (`guides`, `maxes`). |
| **AC-03** | Điều kiện Xuất bản Ca thi (Publish Checklist) | **PASS** | Checklist 3 điều kiện hoạt động chuẩn xác; API `POST .../publish` thành công; DB ghi nhận `status = 'Published'`. |
| **AC-04** | Lưu Nháp Đánh giá Chấm điểm (Save Draft) | **PASS** | Gọi `PUT .../score-review/draft` thành công; PostgreSQL lưu `score_reviews.status = 'Pending'`; attempt giữ `PendingReview`. Bằng chứng: `tests/e2e-evidence-02-draft-saved.png`. |
| **AC-05** | Tải Lại Bản Nháp Đã Lưu (Load Draft) | **PASS** | F5 reload nạp đúng điểm và nhận xét nháp; hiển thị badge `Draft review (Pending approval)` vàng rằm; 2 nút Confirm và Update draft. Bằng chứng: `tests/e2e-evidence-03-draft-reloaded.png`. |
| **AC-06** | Chốt Điểm Chính Thức (Confirm Final Score) | **PASS** | Gọi API chốt điểm thành công; DB ghi nhận `score_reviews.status = 'Approved'`, `interview_attempts.status = 'Finalized'`; UI chuyển chỉ đọc và hiển thị badge Confirmed ngọc bích. Bằng chứng: `tests/e2e-evidence-04-score-confirmed.png`. |
| **AC-07** | Khả năng Chạy Tương thích Đôi (Mock & Real API) | **PASS** | Cả `src/mocks/server.js` và `src/api/services.js` đều hỗ trợ trơn tru, không phát sinh lỗi lệch chuẩn. |
| **AC-08** | Kiểm tra Không Phát sinh Lỗi (Zero Regression) | **PASS** | `npm.cmd run build` thành công 100% (735ms), không có lỗi TypeScript, syntax hay linter blocking. |

### 9.2 Đánh giá Tuân thủ Quy tắc Dự án (Compliance Check)

1. **Repo Backend `ai-oral-exam-api`**: Giữ nguyên vẹn 100% sạch sẽ (0 file bị sửa, `git status` sạch).
2. **Quy tắc Git**: Tuyệt đối chưa commit / push git. Toàn bộ mã nguồn sẵn sàng chờ lệnh từ Hiệu (`AkioChan0308`).
3. **Design System "Đêm Trung thu"**: Toàn bộ CSS scoped chuẩn (`.pg-sessionsetup`, `.pg-reviewattempt`), sử dụng đúng bảng màu Moonlight (`var(--night-indigo)`, `var(--jade-ink)`, `var(--gold-ink)`), font Alegreya + Lexend, không cài đặt TailwindCSS.
4. **Kiểm thử E2E Thực tế trên Docker DB**: Đầy đủ 4 file ảnh bằng chứng thực nghiệm tại thư mục `tests/`.

**KẾT LUẬN**: Giai đoạn 1 đã hoàn thành xuất sắc toàn bộ mục tiêu kỹ thuật, chất lượng code và trải nghiệm người dùng theo đúng Definition of Done. Kính trình Hiệu (`AkioChan0308`) phê duyệt nghiệm thu và quyết định commit.
