# Definition of Done (DoD) – Giai đoạn 2: Tích hợp Ngân hàng Câu hỏi & Gán Ca thi (Question Bank & Exam Attach)

> **Tên tài liệu**: Definition of Done & Architecture Compliance Specification – Phase 2  
> **Dự án**: AIVES (AI-powered Viva Exam System) – SWD392  
> **Phiên bản**: 2.0 (Chốt ngày 03/11/2026)  
> **Chịu trách nhiệm biên soạn**: Agent 1 (DoD Lead & Architecture Compliance)  
> **Áp dụng cho**: Agent 2 (Coder) & Agent 3 (Reviewer)  
> **Căn cứ tài liệu**: PR #11 backend merged into `develop` (`ef2f20a`), `docs/DOD_PHASE_1_INTEGRATION.md`, `AGENTS.md`, `GEMINI.md`.

---

## 1. Mục tiêu & Bối cảnh Giai đoạn 2

Backend PR #11 của Khang đã được Phúc merge chính thức vào nhánh `develop` (commit `ef2f20a`). Hệ thống Backend hiện đã có đầy đủ API Feature 1 (Question Bank & Approval) và gán câu hỏi từ Bank vào Ca thi (Exam Attach).

Giai đoạn 2 tập trung hoàn thiện trọn vẹn luồng nghiệp vụ của Giảng viên (Lecturer):
1. **Quản lý Ngân hàng câu hỏi theo Môn học (Question Bank Management)**: Xem danh sách câu hỏi, lọc đa chiều (Topic, Bloom, Status), tạo câu hỏi Draft thủ công, chỉnh sửa (Revise) tạo revision mới, Duyệt (Approve) và Loại (Reject).
2. **Gán câu hỏi từ Ngân hàng vào Ca thi (Attach Questions from Bank)**: Tích hợp trực tiếp vào màn hình Thiết lập ca thi (`SessionSetupPage`), cho phép Giảng viên duyệt ngân hàng câu hỏi `Approved` của môn học và gán hàng loạt vào ca thi nháp một cách trực quan, chính xác.

---

## 2. Quy tắc Bất di bất dịch (Ground Rules & Core Regulations)

1. **TUÂN THỦ AGENTS.MD & GEMINI.MD**:
   - **Ngôn ngữ**: 100% giao tiếp, comment mã nguồn và giải thích bằng **Tiếng Việt**.
   - **Chặn AI slop**: Tuyệt đối không viết code dài dòng hoa mỹ, không nịnh bợ, không sinh code thừa/dead code. Bám sát thực tế kiến trúc dự án.
   - **Bảo tồn Git**: **CHỈ commit khi Hiệu (`AkioChan0308`) yêu cầu rõ ràng trong tin nhắn hiện tại.** Tuyệt đối KHÔNG tự ý commit hay push Git. Tác giả commit bắt buộc là `AkioChan0308`, không thêm `Co-Authored-By` hay dấu hiệu AI.
   - **Bảo vệ mã nguồn**: Tuyệt đối **KHÔNG** chỉnh sửa bất kỳ file nào trong repo Backend `ai-oral-exam-api` hay cấu hình Keycloak. Frontend chỉ tương tác qua HTTP API chuẩn.
2. **DESIGN SYSTEM "ĐÊM TRUNG THU" & SCOPED CSS**:
   - Theme Giảng viên: Bắt buộc dùng bảng màu **Moonlight** (`#F4F6FC`, `var(--bg-moonlight)`, `var(--night-indigo)`).
   - Typography: Font đôi `Alegreya` (tiêu đề serif sang trọng) và `Lexend` (nội dung sans-serif hiện đại).
   - Màu ngữ nghĩa: Vàng rằm (`var(--lantern-gold)` / `var(--gold-ink)` - Draft/AI), Ngọc bích (`var(--jade-ink)` - Approved/Thành công), Đỏ sơn mài (`var(--red-ink)` - Rejected/Cảnh báo).
   - Scoped CSS: Mọi CSS cho tính năng mới phải scoped nghiêm ngặt theo `.pg-questionbank` (hoặc prefix `.qb-`) và `.pg-sessionsetup` (hoặc prefix `.ss-`). **Tuyệt đối KHÔNG dùng TailwindCSS**, không viết CSS toàn cục gây vỡ giao diện khác.

---

## 3. Bộ Nguyên tắc Andrej Karpathy (Karpathy Guidelines)

Mọi thay đổi trong Giai đoạn 2 phải được thực hiện theo 4 tư duy cốt lõi của Andrej Karpathy:

1. **Think Before Coding**:
   - Đọc kỹ hợp đồng API thực tế trong backend (`QuestionBankController.cs`, `QuestionBankAttachController.cs`, `QuestionBankService.cs`).
   - Hiểu rõ vòng đời trạng thái của câu hỏi: `Draft` ➔ `Approved` / `Rejected`. Chỉ có câu hỏi `Approved` mới được phép attach vào ca thi.
   - Hiểu rõ cơ chế Revision: mỗi lần sửa đổi câu hỏi Draft tạo một revision mới.
2. **Simplicity First (Tối giản trên hết)**:
   - Không xây dựng cấu trúc component lồng nhau quá 3 tầng nếu không cần thiết.
   - Không cài thêm thư viện bên ngoài (no external table/modal libraries). Tái sử dụng các UI primitives và helper có sẵn trong `src/utils/` (`format.js`, `async.js`, `pending.js`).
3. **Surgical Changes (Can thiệp chuẩn xác)**:
   - Chỉ chỉnh sửa đúng các file được phân công. Không đụng chạm tới các màn hình đã nghiệm thu xong ở Giai đoạn 1 (`ReviewAttemptPage`, `StudentReportPage`, `ClassStatsPage`...).
   - Giữ nguyên luồng nhập câu hỏi bằng file CSV/txt có sẵn trong `SessionSetupPage`, chỉ bổ sung thêm nhánh chọn từ Question Bank.
4. **Goal-Driven Execution (Thực thi theo mục tiêu)**:
   - Mỗi hàm API, mỗi tương tác UI đều phải có mục đích rõ ràng và kịch bản kiểm thử (Assertion) cụ thể trước khi kết luận hoàn thành.

---

## 4. Bộ Nguyên tắc Impeccable (Impeccable Principles - Mode Operate)

Áp dụng tiêu chuẩn Impeccable hướng tới chế độ **Operate** – tối ưu hóa năng suất và sự chính xác cho Giảng viên:

1. **Visual Hierarchy & State Clarity**:
   - Phân biệt rõ ràng 3 trạng thái câu hỏi bằng Badge màu ngữ nghĩa Moonlight:
     - `Draft`: Nền vàng nhạt ngà (`#FEF9E7`), viền hổ phách, chữ nâu vàng (`#8F6B00`).
     - `Approved`: Nền xanh ngọc bích nhạt (`#E8F8F2`), viền ngọc bích, chữ xanh sẫm (`#0E6245`).
     - `Rejected`: Nền đỏ sơn mài nhạt (`#FDF0F0`), viền san hô, chữ đỏ đậm (`#A32020`).
   - Các mức Bloom (`Remember`, `Understand`, `Apply`, `Analyze`) có badge phụ màu ghi thanh lịch để Giảng viên nhận diện cấp độ tư duy trong 0.5 giây.
2. **Trải nghiệm Thao tác Nhanh (High-Efficiency Workflows)**:
   - Thao tác Approve/Reject trực tiếp trên hàng mà không cần mở modal sâu nếu không cần sửa nội dung.
   - Modal "Revise Draft" mở nhanh, tự focus vào ô nội dung, có phím tắt `Esc` để đóng.
   - Modal "Attach from Question Bank" trong `SessionSetupPage` hỗ trợ:
     - Checkbox chọn từng câu hoặc chọn tất cả (Select All Approved).
     - Đếm số lượng câu đã chọn (`Đã chọn: X câu`).
     - Tự động disable hoặc đánh dấu các câu hỏi đã có sẵn trong ca thi để tránh trùng lặp.
3. **Phòng vệ Trạng thái & Xử lý Ngoại lệ (Defensive UX)**:
   - **Empty States**: Khi môn học chưa có câu hỏi nào trong ngân hàng, hiển thị minh họa trực quan kèm nút "Tạo câu hỏi đầu tiên". Khi bộ lọc không có kết quả, hiển thị thông báo nhẹ nhàng kèm nút "Xóa bộ lọc".
   - **Loading States**: Hiển thị spinner/skeleton Moonlight dịu mắt khi gọi API, không để màn hình giật lag hoặc đơ.
   - **Error Handling**: Hiển thị thông báo lỗi thân thiện khi backend từ chối (ví dụ: "Nội dung câu hỏi đã tồn tại trong môn học" khi trùng hash, hoặc "Ca thi đã xuất bản không thể gán thêm câu hỏi").

---

## 5. Đặc tả Hợp đồng API (API Contract Specification)

Căn cứ chính xác theo mã nguồn backend đã merge tại commit `ef2f20a` (`AiOralExam.Modules.AccessConfig`):

### 5.1 Enums & Types
```typescript
// Bloom taxonomy level
type BloomLevel = 'Remember' | 'Understand' | 'Apply' | 'Analyze';

// Trạng thái câu hỏi trong ngân hàng
type QuestionBankStatus = 'Draft' | 'Approved' | 'Rejected' | 'Archived';

// Nguồn gốc câu hỏi
type QuestionBankOrigin = 'Manual' | 'Import' | 'Ai';
```

### 5.2 Mô hình Dữ liệu (DTO Models)
```typescript
interface QuestionBankRevisionDto {
  id: string; // Guid
  revisionNo: number;
  content: string;
  provenanceJson: string | null;
  createdAt: string; // ISO DateTime
}

interface QuestionBankItemDto {
  id: string; // Guid
  courseId: string; // Guid
  topic: string;
  bloom: BloomLevel;
  content: string;
  origin: QuestionBankOrigin;
  status: QuestionBankStatus;
  createdAt: string; // ISO DateTime
  updatedAt: string; // ISO DateTime
  revisions: QuestionBankRevisionDto[];
}
```

### 5.3 Chi tiết các Endpoints

#### 1. Lấy danh sách câu hỏi trong ngân hàng của môn học
- **Endpoint**: `GET /api/courses/{courseId}/question-bank`
- **Query Params**: `status` (tùy chọn: `Draft` | `Approved` | `Rejected` | `Archived`)
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `200 OK` ➔ `IReadOnlyList<QuestionBankItemDto>`

#### 2. Lấy chi tiết 1 câu hỏi
- **Endpoint**: `GET /api/courses/{courseId}/question-bank/{itemId}`
- **Response**: `200 OK` ➔ `QuestionBankItemDto`

#### 3. Tạo câu hỏi thủ công (Draft)
- **Endpoint**: `POST /api/courses/{courseId}/question-bank`
- **Payload**:
  ```json
  {
    "topic": "Microservices Architecture",
    "bloom": "Understand",
    "content": "Trình bày sự khác biệt giữa Saga Pattern Orchestration và Choreography?"
  }
  ```
- **Response**: `201 Created` ➔ `QuestionBankItemDto` (status: `"Draft"`)
- **Lưu ý**: Nếu `content` bị trùng lặp với câu đã có trong môn học, backend trả về `409 Conflict` (`question_bank_duplicate`).

#### 4. Cập nhật câu hỏi Draft (Tạo revision mới)
- **Endpoint**: `PUT /api/courses/{courseId}/question-bank/{itemId}`
- **Payload**:
  ```json
  {
    "topic": "Microservices Architecture",
    "bloom": "Analyze",
    "content": "Nội dung câu hỏi đã qua chỉnh sửa chi tiết hơn..."
  }
  ```
- **Response**: `200 OK` ➔ `QuestionBankItemDto`
- **Lưu ý**: Chỉ câu hỏi đang có `status == "Draft"` mới được phép sửa. Nếu câu hỏi đã Approved/Rejected, backend trả về `409 Conflict` (`question_bank_locked`).

#### 5. Duyệt câu hỏi (Approve)
- **Endpoint**: `POST /api/courses/{courseId}/question-bank/{itemId}/approve`
- **Payload**: None
- **Response**: `200 OK` ➔ `QuestionBankItemDto` (status: `"Approved"`)
- **Lưu ý**: Chỉ câu hỏi đang là `"Draft"` mới được duyệt.

#### 6. Từ chối câu hỏi (Reject)
- **Endpoint**: `POST /api/courses/{courseId}/question-bank/{itemId}/reject`
- **Payload**: None
- **Response**: `200 OK` ➔ `QuestionBankItemDto` (status: `"Rejected"`)
- **Lưu ý**: Chỉ câu hỏi đang là `"Draft"` mới được từ chối.

#### 7. Gán danh sách câu hỏi Approved vào Ca thi
- **Endpoint**: `POST /api/exam-sessions/{sessionId}/questions/from-bank`
- **Payload**:
  ```json
  {
    "itemIds": [
      "c0a80123-0000-0000-0000-000000000001",
      "c0a80123-0000-0000-0000-000000000002"
    ]
  }
  ```
- **Response**: `200 OK` ➔ `IReadOnlyList<Guid>` (Danh sách ItemId đã được gán)
- **Điều kiện Backend kiểm tra**:
  - Ca thi phải đang ở trạng thái `Draft` (`exam_session_locked`).
  - Mọi `itemIds` được chọn **bắt buộc phải có `status == "Approved"`** và thuộc đúng `courseId` của ca thi (`question_bank_item_not_approved`).
  - Không được trùng revision với câu hỏi đã có trong ca thi (`question_bank_item_already_attached`).

---

## 6. Danh sách File Cần Thay đổi / Bổ sung

| STT | Đường dẫn file | Hành động | Vai trò & Nội dung thay đổi |
|---|---|:---:|---|
| 1 | `src/api/services.js` | **Cập nhật** | Thêm object `questionBankApi` đầy đủ các phương thức: `list`, `get`, `create`, `updateDraft`, `approve`, `reject`, `attachToSession`. |
| 2 | `src/app/routes/paths.js` | **Cập nhật** | Thêm route `questionBank: '/lecturer/question-bank'`. |
| 3 | `src/app/routes/router.jsx` | **Cập nhật** | Đăng ký route `/lecturer/question-bank` vào layout Moonlight của role `Lecturer`. |
| 4 | `src/components/TopBar.jsx` | **Cập nhật** | Bổ sung mục "Question bank" vào thanh điều hướng `LECTURER_NAV`. |
| 5 | `src/features/question-bank/QuestionBankPage.jsx` | **Tạo mới** | Giao diện quản lý ngân hàng câu hỏi của Giảng viên: chọn môn học, bảng danh sách câu hỏi, lọc Topic/Bloom/Status, tạo câu hỏi Draft, Duyệt, Loại, modal Chỉnh sửa (Revise). |
| 6 | `src/features/question-bank/QuestionBank.css` | **Tạo mới** | Toàn bộ scoped CSS cho ngân hàng câu hỏi (`.pg-questionbank`), tuân thủ chuẩn Moonlight & Đêm Trung thu. |
| 7 | `src/features/exam-config/SessionSetupPage.jsx` | **Cập nhật** | Bổ sung nút "Chọn từ Ngân hàng đề", modal duyệt câu hỏi Approved của môn học, gọi `attachToSession`, tự động cập nhật danh sách câu hỏi trong ca thi. |
| 8 | `src/features/exam-config/SessionSetup.css` | **Cập nhật** | Bổ sung style cho modal và danh sách câu hỏi chọn từ ngân hàng đề trong Session Setup. |
| 9 | `src/mocks/handlers.js` / mock data | **Cập nhật** | Bổ sung mock data và mock handlers cho `questionBankApi` để hỗ trợ chạy khi `VITE_USE_MOCKS=true`. |

---

## 7. Tiêu chuẩn UI/UX "Đêm Trung thu" & Scoped CSS

1. **Thanh điều hướng Giảng viên (StaffTopBar)**:
   - Bổ sung tab **Question bank** (`/lecturer/question-bank`), vị trí nằm giữa "Exam sessions" và "Results and review".
2. **Giao diện Màn hình Ngân hàng Câu hỏi (`.pg-questionbank`)**:
   - Header: Tiêu đề "Question Bank", font `Alegreya`, phụ đề "Quản lý và duyệt ngân hàng câu hỏi phỏng vấn theo môn học".
   - Bộ chọn môn học (Course Selector): Dropdown trang nhã hiển thị danh sách các môn học mà Giảng viên phụ trách (`examConfigApi.myCourses()`).
   - Thanh công cụ (Toolbar):
     - Ô tìm kiếm từ khóa trong nội dung câu hỏi.
     - Lọc Topic (chủ đề): Dropdown hoặc pill tags.
     - Lọc Bloom Level: All, Remember, Understand, Apply, Analyze.
     - Lọc Status: All, Draft, Approved, Rejected.
     - Nút "+ New Question": Nền xanh sẫm Indigo (`#0F1630`), chữ trắng Ivory, mở modal tạo câu hỏi mới.
   - Bảng danh sách câu hỏi:
     - Cột 1: Cấp độ Bloom (badge thanh nhã) & Chủ đề (Topic).
     - Cột 2: Nội dung câu hỏi (hỗ trợ preview 2 dòng, bấm xem thêm nếu dài).
     - Cột 3: Trạng thái (Draft/Approved/Rejected) & Số phiên bản (Revisions count).
     - Cột 4: Nguồn gốc (Manual, Import, AI).
     - Cột 5: Hành động (Approve, Reject, Revise/Edit).
3. **Modal Chọn câu hỏi vào Ca thi trong `SessionSetupPage` (`.ss-bank-modal`)**:
   - Tiêu đề modal: "Import from Question Bank - [Mã môn học]".
   - Chỉ hiển thị các câu hỏi đã có trạng thái `Approved`.
   - Có cột Checkbox bên trái để tích chọn nhiều câu.
   - Câu hỏi đã có trong ca thi hiện tại hiển thị mờ (disabled) kèm nhãn "Already in session".
   - Footer: Hiển thị tóm tắt `Đã chọn: N câu hỏi`, nút "Cancel" và nút hành động chính "Add to Exam Session" (Vàng rằm / Indigo).

---

## 8. Bộ Tiêu chí Chấp thuận Nghiệm thu (Acceptance Criteria - AC)

### AC-01: Tích hợp API Service `questionBankApi`
- **Given**: Module `src/api/services.js`.
- **When**: Gọi các phương thức của `questionBankApi`.
- **Then**:
  - Gửi đúng HTTP Method, Route path và Payload theo đặc tả mục 5.
  - Xử lý mượt mà cả 2 chế độ `VITE_USE_MOCKS=true` và `VITE_USE_MOCKS=false`.

### AC-02: Điều hướng & Chọn Môn học trong Ngân hàng Câu hỏi
- **Given**: Giảng viên đăng nhập vào hệ thống.
- **When**: Bấm vào tab "Question bank" trên TopBar hoặc truy cập `/lecturer/question-bank`.
- **Then**:
  - Hệ thống nạp danh sách môn học của Giảng viên. Môn đầu tiên được tự động chọn làm mặc định.
  - Khi Giảng viên chuyển sang môn học khác từ dropdown, bảng danh sách câu hỏi tự động làm mới và tải câu hỏi của môn học tương ứng.

### AC-03: Lọc & Tìm kiếm Câu hỏi Đa chiều
- **Given**: Môn học đã có danh sách câu hỏi trong ngân hàng.
- **When**: Giảng viên áp dụng các bộ lọc:
  - Chọn Bloom: `Understand` ➔ Chỉ các câu hỏi có mức Understand hiển thị.
  - Chọn Status: `Draft` ➔ Chỉ các câu hỏi Draft hiển thị.
  - Nhập từ khóa tìm kiếm trong ô search ➔ Lọc theo nội dung câu hỏi hoặc topic.
- **Then**: Danh sách cập nhật tức thời, chính xác; hiển thị số lượng kết quả tìm thấy.

### AC-04: Tạo Mới Câu hỏi Thủ công (Draft)
- **Given**: Giảng viên ở màn hình Question Bank của môn học.
- **When**: Bấm nút "+ New Question", điền Topic, chọn mức Bloom, nhập Content và bấm "Save as Draft".
- **Then**:
  - Frontend gọi `POST /api/courses/{courseId}/question-bank`.
  - Câu hỏi mới xuất hiện ngay đầu danh sách với badge `Draft` màu vàng rằm.
  - Hiển thị toast thông báo "Đã tạo câu hỏi nháp thành công".
  - Nếu trùng nội dung với câu đã có, hiển thị thông báo lỗi rõ ràng từ backend.

### AC-05: Chỉnh sửa Nội dung Câu hỏi Draft (Revise)
- **Given**: Câu hỏi ở trạng thái `Draft`.
- **When**: Giảng viên bấm nút "Revise" (hoặc "Edit"), chỉnh sửa Topic/Bloom/Content trong modal và bấm "Save Changes".
- **Then**:
  - Frontend gọi `PUT /api/courses/{courseId}/question-bank/{itemId}`.
  - Dữ liệu hiển thị được cập nhật, số lượng revision tăng lên (ví dụ: `Rev 2`).
  - Nút Revise chỉ khả dụng đối với câu hỏi ở trạng thái `Draft`.

### AC-06: Duyệt (Approve) và Loại bỏ (Reject) Câu hỏi
- **Given**: Câu hỏi ở trạng thái `Draft`.
- **When**:
  - Bấm nút **"Approve"**: Gọi `POST .../approve`, badge câu hỏi chuyển sang màu ngọc bích `Approved`. Nút Approve/Reject tự động ẩn đi.
  - Bấm nút **"Reject"**: Gọi `POST .../reject`, badge câu hỏi chuyển sang màu đỏ sơn mài `Rejected`. Nút Approve/Reject tự động ẩn đi.
- **Then**: Không cần tải lại toàn bộ trang; trạng thái câu hỏi được cập nhật mượt mà tại chỗ.

### AC-07: Chọn và Gán Câu hỏi Approved vào Ca thi trong Session Setup
- **Given**: Giảng viên đang ở màn hình Thiết lập ca thi (`/lecturer/sessions/{id}/setup`) của môn học đang có câu hỏi `Approved` trong ngân hàng.
- **When**: Giảng viên bấm nút "Add from Bank" (hoặc "Chọn từ Ngân hàng đề"):
  - Modal danh sách câu hỏi `Approved` của môn học mở ra.
  - Giảng viên tích chọn 2 câu hỏi chưa có trong ca thi và bấm "Add to Exam Session".
- **Then**:
  - Frontend gọi `POST /api/exam-sessions/{sessionId}/questions/from-bank` với body `{ itemIds: [...] }`.
  - Backend trả về 200 kèm danh sách ID câu hỏi đã gán.
  - Modal đóng lại; 2 câu hỏi mới xuất hiện ngay trong danh sách câu hỏi của ca thi với thứ tự tiếp nối (`Order 1, Order 2...`).
  - Thanh Publish checklist cập nhật điều kiện Questions (`hasQuestion: true`).

### AC-08: Zero Regression & Build 0 Error
- **Given**: Toàn bộ dự án sau khi hoàn tất tích hợp Giai đoạn 2.
- **When**: Chạy lệnh build `npm run build` và kiểm tra các tính năng đã làm ở Giai đoạn 1.
- **Then**:
  - `npm run build` thành công 100%, 0 error, 0 warning blocking.
  - Các màn hình `SessionSetupPage`, `ReviewAttemptPage`, `ClassStatsPage`, `StudentHomePage` tiếp tục hoạt động ổn định, không bị lỗi hồi quy (zero regression).

---

## 9. Checklist Chi tiết cho Agent 2 (Coder)

Agent 2 bắt buộc phải đối chiếu và hoàn thành 100% các hạng mục trước khi bàn giao:

- [ ] **1. API Services (`src/api/services.js`)**:
  - [ ] Khai báo object `questionBankApi`:
    ```javascript
    export const questionBankApi = {
      list: (courseId, status) => api.get(`/api/courses/${enc(courseId)}/question-bank${status ? `?status=${enc(status)}` : ''}`),
      get: (courseId, itemId) => api.get(`/api/courses/${enc(courseId)}/question-bank/${enc(itemId)}`),
      create: (courseId, { topic, bloom, content }) => api.post(`/api/courses/${enc(courseId)}/question-bank`, { topic, bloom, content }),
      updateDraft: (courseId, itemId, { topic, bloom, content }) => api.put(`/api/courses/${enc(courseId)}/question-bank/${enc(itemId)}`, { topic, bloom, content }),
      approve: (courseId, itemId) => api.post(`/api/courses/${enc(courseId)}/question-bank/${enc(itemId)}/approve`),
      reject: (courseId, itemId) => api.post(`/api/courses/${enc(courseId)}/question-bank/${enc(itemId)}/reject`),
      attachToSession: (sessionId, itemIds) => api.post(`/api/exam-sessions/${enc(sessionId)}/questions/from-bank`, { itemIds }),
    }
    ```
- [ ] **2. Navigation & Routing**:
  - [ ] Thêm path `questionBank: '/lecturer/question-bank'` trong `src/app/routes/paths.js`.
  - [ ] Thêm link "Question bank" trong `LECTURER_NAV` (`src/components/TopBar.jsx`).
  - [ ] Đăng ký Route trong `src/app/routes/router.jsx` dưới quyền `Lecturer`.
- [ ] **3. Feature Question Bank (`src/features/question-bank/`)**:
  - [ ] Xây dựng `QuestionBankPage.jsx` với selector môn học, filter bar (Topic, Bloom, Status, Search).
  - [ ] Bảng danh sách câu hỏi hỗ trợ hiển thị Badge Bloom, Topic, Revisions, Status.
  - [ ] Nút & Handler: Approve, Reject tại chỗ.
  - [ ] Modal tạo mới câu hỏi (+ New Question) hỗ trợ validate rỗng và hiển thị lỗi backend.
  - [ ] Modal chỉnh sửa (Revise) cho câu hỏi Draft.
  - [ ] Xây dựng file CSS scoped `.pg-questionbank` trong `QuestionBank.css` theo bảng màu Moonlight.
- [ ] **4. Tích hợp vào `SessionSetupPage.jsx`**:
  - [ ] Thêm nút hành động "Add from Bank" bên cạnh nút import file hiện tại.
  - [ ] Xây dựng Modal "Attach Questions from Bank" tải danh sách câu hỏi `Approved` của `d.courseId`.
  - [ ] Cho phép chọn checkbox, disable câu đã có trong `d.questions`.
  - [ ] Gọi `questionBankApi.attachToSession(sessionId, selectedIds)` và refresh lại dữ liệu ca thi.
  - [ ] Bổ sung styling scoped trong `SessionSetup.css`.
- [ ] **5. Mock Handlers & Mock Data (`src/mocks/`)**:
  - [ ] Bổ sung mock data câu hỏi ngân hàng mẫu cho các môn học.
  - [ ] Hỗ trợ mock endpoints cho `questionBankApi` để dev server chạy trơn tru cả khi offline.
- [ ] **6. Tuân thủ Quy tắc Dự án**:
  - [ ] Tuyệt đối **KHÔNG** sửa bất kỳ file nào trong repo Backend `ai-oral-exam-api`.
  - [ ] Tuyệt đối **KHÔNG** tự ý commit hay push Git.
  - [ ] Kiểm tra `npm run build` đạt kết quả xanh 100%.

---

## 10. Checklist Kiểm thử cho Agent 3 (Reviewer) & Test Specifications

Agent 3 chịu trách nhiệm review mã nguồn và thực thi kịch bản kiểm thử E2E tự động bằng Playwright trên môi trường thật (Docker DB + Keycloak + Backend API):

### 10.1 Checklist Rà soát Mã nguồn (Code Review)
- [ ] **Architecture Compliance**:
  - [ ] Các route API trong `questionBankApi` có đúng 100% với Backend Controllers không?
  - [ ] Không có file backend nào bị sửa (`git -C ../ai-oral-exam-api status` sạch 100%).
- [ ] **Karpathy & Impeccable Review**:
  - [ ] Mã nguồn ngắn gọn, trực diện, không sinh component/helper trùng lặp?
  - [ ] Giao diện đúng chuẩn Moonlight, font Alegreya + Lexend, không lọt CSS Tailwind?
  - [ ] CSS scoped chuẩn xác theo `.pg-questionbank` và `.pg-sessionsetup`?
  - [ ] Có đầy đủ Empty states và Loading states?

### 10.2 Kịch bản Kiểm thử E2E Playwright Bắt buộc (E2E Test Specifications)

Agent 3 viết và chạy file kịch bản `tests/e2e-phase2-qa.mjs` với 4 kịch bản bắt buộc sau:

#### Kịch bản 1: Giảng viên tạo câu hỏi Draft mới trong Ngân hàng
1. Giảng viên đăng nhập qua Keycloak (`an.nv@aives.edu.vn`).
2. Điều hướng tới `/lecturer/question-bank`.
3. Chọn môn học (ví dụ: `SWD392`).
4. Bấm nút "+ New Question", nhập:
   - Topic: `"Design Patterns"`
   - Bloom: `"Apply"`
   - Content: `"Trình bày cách triển khai Decorator Pattern trong Java/C# để mở rộng tính năng mà không sửa đổi lớp gốc?"`
5. Bấm "Save as Draft".
6. **Assertion**:
   - HTTP response trả về 201 Created.
   - UI hiển thị câu hỏi mới với badge `Draft` màu vàng rằm.
   - Query DB Postgres: Bảng `question_bank_items` có bản ghi mới với `status = 'Draft'`, `bloom = 'Apply'`, `topic = 'Design Patterns'`.

#### Kịch bản 2: Giảng viên Duyệt (Approve) câu hỏi Draft
1. Từ danh sách câu hỏi tại `/lecturer/question-bank`, tìm câu hỏi vừa tạo ở Kịch bản 1.
2. Bấm nút **"Approve"**.
3. **Assertion**:
   - HTTP response trả về 200 OK.
   - Badge của câu hỏi trên UI chuyển sang ngọc bích `Approved`.
   - Nút Approve/Reject biến mất khỏi hàng của câu hỏi đó.
   - Query DB Postgres: Bảng `question_bank_items` chuyển `status = 'Approved'`.

#### Kịch bản 3: Chọn và Gán câu hỏi Approved vào Ca thi trong Session Setup
1. Mở màn hình Thiết lập ca thi nháp của môn học: `/lecturer/sessions/{draftSessionId}/setup`.
2. Bấm nút "Add from Bank".
3. Modal chọn câu hỏi mở ra, tìm thấy câu hỏi `Approved` vừa duyệt ở Kịch bản 2.
4. Tích chọn checkbox của câu hỏi đó và bấm "Add to Exam Session".
5. **Assertion**:
   - HTTP response `POST /api/exam-sessions/{sessionId}/questions/from-bank` trả về 200 OK.
   - Modal tự động đóng.
   - Query DB Postgres: Bảng `questions` xuất hiện câu hỏi mới với `exam_session_id = {draftSessionId}` và `source_bank_revision_id` trỏ đúng vào revision của câu hỏi ngân hàng.

#### Kịch bản 4: Hiển thị và Xác nhận trên UI Session Setup
1. Quan sát danh sách câu hỏi trên trang Session Setup sau khi gán.
2. **Assertion**:
   - Câu hỏi vừa gán xuất hiện trong danh sách với số thứ tự kế tiếp, nội dung hiển thị chính xác.
   - Không xuất hiện nút hay form viết rubric lẻ (tuân thủ tiêu chuẩn Platform Rubric từ Giai đoạn 1).
   - Thanh Publish checklist ghi nhận điều kiện câu hỏi đạt chuẩn (`hasQuestion: true`).
   - Chụp ảnh màn hình lưu vào `tests/e2e-evidence-05-question-bank-list.png` và `tests/e2e-evidence-06-attach-to-session.png`.

---

## 11. Quy trình Nghiệm thu Cuối cùng (Sign-Off Workflow)

Sau khi Agent 2 hoàn tất lập trình và Agent 3 chạy test báo cáo kết quả:
1. **Agent 1** đối chiếu mã nguồn thực tế với 8 tiêu chí AC (AC-01 -> AC-08).
2. Kiểm tra log kiểm thử E2E và ảnh chụp bằng chứng nghiệm thu của Agent 3.
3. Chạy lệnh kiểm tra build: `npm run build` xác nhận không có lỗi phát sinh.
4. Lập Biên bản Nghiệm thu Chính thức Giai đoạn 2 vào cuối tài liệu này và báo cáo kết quả cho Hiệu (`AkioChan0308`) phê duyệt quyết định commit.
