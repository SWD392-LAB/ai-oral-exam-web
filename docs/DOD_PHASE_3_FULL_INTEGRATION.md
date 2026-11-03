# Definition of Done (DoD) – Giai đoạn 3: Tích hợp Toàn diện Giáo trình, AI Sinh câu hỏi & Luồng thi Sinh viên (Full Integration: Course Materials, AI Question Generation & Student Viva Exam)

> **Tên tài liệu**: Definition of Done & Architecture Compliance Specification – Phase 3  
> **Dự án**: AIVES (AI-powered Viva Exam System) – SWD392  
> **Phiên bản**: 3.0 (Chốt ngày 03/11/2026)  
> **Chịu trách nhiệm biên soạn**: Agent 1 (DoD Lead & Architecture Compliance)  
> **Áp dụng cho**: Agent 2 (Coder) & Agent 3 (Reviewer)  
> **Căn cứ tài liệu**: Backend Controllers & Contracts (`CourseMaterialsController.cs`, `QuestionGenerationController.cs`, `QuestionBankController.cs`, `InterviewAttemptsController.cs`), Database Schemas (`08_course_materials.sql`, `07_question_bank.sql`, `01_schema.sql`), `Skill bat buoc Claude Code.md`, `AGENTS.md`, `GEMINI.md`.

---

## 1. Mục tiêu & Bối cảnh Giai đoạn 3

Giai đoạn 3 là bước đột phá hoàn thiện toàn diện hai tính năng lõi (Core Features) của nền tảng AIVES:
1. **Module 1 (Feature 1 Complete - Course Materials & AI Question Generation)**:
   - Tải lên tài liệu giáo trình môn học (PDF/DOCX) qua `POST /api/courses/{courseId}/materials` và Ingest (`POST .../materials/{materialId}/ingest`) để tách thành các đoạn nội dung (chunks).
   - Sử dụng AI sinh câu hỏi tự động (`POST /api/courses/{courseId}/question-bank/generations`) dựa trên bằng chứng tài liệu giáo trình và Platform Rubric đang hoạt động.
   - Các câu hỏi do AI tạo ra được tự động lưu vào Ngân hàng câu hỏi dưới dạng `origin = 'Ai'`, `status = 'Draft'`, cho phép Giảng viên kiểm tra nguồn trích dẫn (Citations), chỉnh sửa (Revise), Duyệt (Approve) hoặc Từ chối (Reject).
2. **Module 2 (Feature 3 Complete - Real Student Viva Exam Flow)**:
   - **Xóa bỏ hoàn toàn Mock trong luồng thi của Sinh viên!**
   - Nối trực tiếp toàn bộ luồng thi phỏng vấn với API backend và PostgreSQL thật:
     - `GET /api/interview/my-sessions`: Lấy danh sách ca thi của sinh viên từ database thật.
     - `POST /api/interview-attempts`: Bắt đầu lượt thi thật, nạp câu hỏi đầu tiên từ backend.
     - `GET /api/interview-attempts/{id}`: Nạp lại trạng thái lượt thi khi tải lại trang.
     - `POST /api/interview-attempts/{id}/responses`: Gửi câu trả lời (kèm `turnId` thật) và nhận phản hồi (Hỏi xoáy `FollowUp`, Chuyển câu `NextQuestion`, hoặc Hoàn thành `Completed`).
   - Lưu trữ toàn bộ câu trả lời, lượt đối thoại (`interview_turns`), và trạng thái hoàn thành (`PendingReview`) trực tiếp vào cơ sở dữ liệu PostgreSQL.

---

## 2. Quy tắc Bất di bất dịch (Ground Rules & Core Regulations)

1. **TUÂN THỦ AGENTS.MD & GEMINI.MD**:
   - **Ngôn ngữ**: 100% giao tiếp, comment mã nguồn và giải thích bằng **Tiếng Việt**.
   - **Chặn AI slop**: Tuyệt đối không viết code dài dòng hoa mỹ, không nịnh bợ, không sinh code thừa/dead code. Bám sát thực tế kiến trúc dự án.
   - **Bảo tồn Git**: **CHỈ commit khi Hiệu (`AkioChan0308`) yêu cầu rõ ràng trong tin nhắn hiện tại.** Tuyệt đối KHÔNG tự ý commit hay push Git. Tác giả commit bắt buộc là `AkioChan0308`, không thêm `Co-Authored-By` hay dấu hiệu AI.
   - **Bảo vệ mã nguồn Backend**: Tuyệt đối **KHÔNG** chỉnh sửa bất kỳ file mã nguồn C# nào trong repo Backend `ai-oral-exam-api` hay cấu hình Keycloak. Frontend chỉ tương tác qua HTTP API chuẩn.
2. **NGUYÊN TẮC CẤM GIỮ MOCK KHI ĐÃ CÓ API THẬT (Anti-Mock Rule)**:
   - Mọi API đã có trên Backend bắt buộc phải được nối vào hệ thống thật khi `VITE_USE_MOCKS=false`.
   - Mock trong `src/mocks/` chỉ phục vụ môi trường dev offline khi `VITE_USE_MOCKS=true`. Dữ liệu mock phải được cập nhật đồng bộ 100% về mặt cấu trúc với schema backend thật.
3. **DESIGN SYSTEM "ĐÊM TRUNG THU" & SCOPED CSS**:
   - **Giao diện Giảng viên**: Bắt buộc dùng bảng màu **Moonlight** (`#F4F6FC`, `var(--bg-moonlight)`, `var(--night-indigo)`).
   - **Giao diện Sinh viên**: Bắt buộc dùng bảng màu **Night** (`#0F1630`, `var(--night)`, `var(--ivory)`).
   - **Typography**: Font đôi `Alegreya` (tiêu đề serif sang trọng) và `Lexend` (nội dung sans-serif hiện đại).
   - **Màu ngữ nghĩa**: Vàng rằm (`var(--lantern-gold)` - AI gợi ý / Đang xử lý / Draft), Ngọc bích (`var(--jade-ink)` - Đã duyệt / Thành công), Đỏ sơn mài (`var(--red-ink)` - Từ chối / Báo động / Nguy hiểm).
   - **Scoped CSS**: Mọi CSS cho tính năng mới phải scoped nghiêm ngặt theo selector gốc màn hình (`.pg-questionbank`, `.pg-studenthome`, `.pg-examlobby`, `.pg-interviewroom`, `.pg-attemptdone`). **Tuyệt đối KHÔNG dùng TailwindCSS**, không viết CSS toàn cục gây vỡ giao diện khác.

---

## 3. Bộ Nguyên tắc Andrej Karpathy (Karpathy Guidelines)

Áp dụng 4 tư duy cốt lõi của Andrej Karpathy trong toàn bộ mã nguồn Giai đoạn 3:

1. **Think Before Coding (Nghĩ kỹ trước khi viết code)**:
   - Nghiên cứu chính xác hợp đồng DTO thực tế của Backend:
     - `CourseMaterialDto`: `Id`, `CourseId`, `FileName`, `ContentType`, `SizeBytes`, `Sha256`, `Status`, `IngestError`, `CreatedAt`.
     - `QuestionGenerationRequest`: `Topic`, `Bloom`, `Count`, `SourceExcerpts`, `PlatformRubricVersionId`, `SourceMaterialIds`.
     - `AttemptStateDto`: `AttemptId`, `ExamSessionId`, `ExamTitle`, `Status`, `TimeLimitSeconds`, `MaxFollowUps`, `TotalQuestions`, `AnsweredQuestions`, `CurrentTurn`.
     - `CurrentTurnDto`: `QuestionResponseId`, `QuestionId`, `QuestionOrderNo`, `TurnNo`, `Type`, `QuestionText`, `AskedAt`, `DeadlineAt`, `TurnId`.
     - `SubmitAnswerRequest`: `AnswerText`, `TurnId`.
     - `SubmitAnswerResponse`: `Outcome`, `TimedOut`, `Evaluation`, `Attempt`, `Transcript`, `Duplicate`.
2. **Simplicity First (Tối giản trên hết)**:
   - Tối giản các thao tác upload và sinh câu hỏi: tích hợp tiện lợi ngay trong giao diện Question Bank của Giảng viên.
   - Tái sử dụng các UI primitives và helpers có sẵn trong `src/utils/` (`format.js`, `async.js`, `pending.js`) và các hooks `useLoad`, `useNow`, `useMicLevel`, `useSpeech`, `useTimeouts`.
   - Không cài thêm thư viện npm thừa thãi bên ngoài.
3. **Surgical Changes (Can thiệp chuẩn xác như phẫu thuật)**:
   - Giữ nguyên kiến trúc state machine mượt mà của `interviewMachine.js` và trải nghiệm nghe nhìn của `InterviewRoomPage.jsx`. Chỉ thay thế adapter gọi API giả lập bằng API backend thực tế.
   - Không làm ảnh hưởng tới các tính năng đã nghiệm thu ở Giai đoạn 1 và 2 (`SessionSetupPage`, `ReviewAttemptPage`, `ClassStatsPage`, `StudentReportPage`).
4. **Goal-Driven Execution (Thực thi theo mục tiêu kiểm chứng được)**:
   - Mọi tính năng phải có assertion thực tế trên DOM và truy vấn trực tiếp vào PostgreSQL để chứng minh luồng nghiệp vụ hoạt động thật 100%.

---

## 4. Bộ Nguyên tắc Impeccable (Impeccable Principles - Mode Operate & Focus)

1. **Module 1 (Giảng viên - Mode Operate)**:
   - **Khu vực Tài liệu Môn học (Course Materials Panel)**:
     - Hiển thị danh sách tài liệu giáo trình đã tải lên kèm badge trạng thái: `Ready` (Ngọc bích), `Pending` (Vàng rằm), `Failed` (Đỏ sơn mài).
     - Hỗ trợ nút upload file PDF/DOCX (giới hạn 25MB) với thanh trạng thái upload dịu mắt.
     - Nút "Ingest" cho phép xử lý tách chunk tài liệu nếu tài liệu đang ở trạng thái `Pending`.
   - **Modal Sinh Câu hỏi Bằng AI (AI Question Generation Modal)**:
     - Form trực quan: Chọn Chủ đề (Topic), Chọn cấp độ Bloom (`Remember`, `Understand`, `Apply`, `Analyze`), Chọn số lượng câu hỏi cần sinh (Count: 1–20), Chọn tài liệu nguồn từ danh sách tài liệu đã `Ready` (hoặc nhập trích đoạn nội dung).
     - Hệ thống tự động nạp `PlatformRubricVersionId` đang kích hoạt của hệ thống.
     - Trạng thái loading khi AI sinh câu hỏi: hiệu ứng đèn lồng xoay nhẹ nhàng, thông báo "AI đang trích xuất giáo trình và sinh câu hỏi...".
   - **Nhận diện & Duyệt Câu hỏi AI**:
     - Câu hỏi do AI sinh có badge nguồn gốc `AI` màu hổ phách (`#D97706`).
     - Hiển thị thông tin trích dẫn nguồn (Citations) và cấp độ Bloom.
     - Giảng viên có đầy đủ quyền hạn Duyệt (`Approve`), Từ chối (`Reject`) hoặc Sửa lại (`Revise`) trước khi gán vào ca thi.
2. **Module 2 (Sinh viên - Mode Focus & Đêm Trung thu)**:
   - **Trang chủ Sinh viên (`StudentHomePage`)**:
     - Hiển thị các ca thi được gán cho sinh viên từ `GET /api/interview/my-sessions`.
     - Phân loại rõ ràng: Ca thi đang mở (`Open now` kèm đồng hồ đếm ngược thời gian còn lại), Ca thi sắp tới (`Upcoming`), Ca thi đã thi (`Finished`).
     - Nút vào thi "Enter lobby" nổi bật với màu sắc Đêm Trung thu.
   - **Phòng chờ Thi (`ExamLobbyPage`)**:
     - Kiểm tra thiết bị microphone với thanh sóng âm trực quan (Voice meter).
     - Thử giọng đọc AI (TTS) với hiệu ứng karaoke từng chữ màu vàng rằm.
     - Nút "Start interview" chỉ kích hoạt khi đã kiểm tra mic thành công và ca thi đang mở. Khi bấm, gọi `POST /api/interview-attempts` và chuyển thẳng vào phòng thi.
   - **Phòng Thi Phỏng vấn (`InterviewRoomPage`)**:
     - Giữ nguyên không gian ánh sáng Đêm Trung thu huyền ảo (AI Light, Candle glow, Lantern flare).
     - Hiển thị tiến trình thi: Câu hỏi hiện tại (`Question X of Y`), các hạt trăng (`pips`) thể hiện số lần hỏi xoáy (Follow-up 1, Follow-up 2).
     - Đồng hồ đếm ngược thời gian trả lời (`timeLimitSeconds`). Khi hết giờ, tự động submit câu trả lời.
     - Hỗ trợ trả lời bằng giọng nói (STT) hoặc gõ chữ (Typed answer).
     - Khi sinh viên nộp bài: gửi `{ answerText, turnId }` lên backend.
     - Xử lý mượt mà chuyển cảnh theo phản hồi: Hỏi xoáy (`FollowUp`), Sang câu tiếp (`NextQuestion`), hoặc Hoàn tất (`Completed`).
   - **Trang Kết thúc Lượt thi (`AttemptDonePage`)**:
     - Thông báo đã nộp bài thành công, bài thi đã chuyển sang trạng thái `PendingReview` để chờ Giảng viên chấm điểm.

---

## 5. Đặc tả Hợp đồng API Chi tiết (API Contract Specification)

### 5.1 Module 1: Giáo trình & Sinh câu hỏi AI (Feature 1)

#### 1. Lấy danh sách tài liệu môn học
- **Endpoint**: `GET /api/courses/{courseId}/materials`
- **Role**: `Lecturer` hoặc `Administrator`
- **Response**: `200 OK` ➔ `IReadOnlyList<CourseMaterialDto>`
```typescript
interface CourseMaterialDto {
  id: string; // Guid
  courseId: string; // Guid
  fileName: string;
  contentType: string; // e.g. "application/pdf"
  sizeBytes: number;
  sha256: string;
  status: 'Pending' | 'Ready' | 'Failed' | 'Archived';
  ingestError: string | null;
  createdAt: string; // ISO DateTime
}
```

#### 2. Tải lên tài liệu giáo trình mới
- **Endpoint**: `POST /api/courses/{courseId}/materials`
- **Role**: `Lecturer` hoặc `Administrator`
- **Consumes**: `multipart/form-data`
- **Form Data**:
  - `file`: File nhị phân (PDF, DOCX, TXT; tối đa 25MB).
- **Response**: `201 Created` ➔ `CourseMaterialDto` (mặc định status: `'Pending'` hoặc tự động `'Ready'`).

#### 3. Ingest tài liệu (Tách chunk phục vụ trích xuất)
- **Endpoint**: `POST /api/courses/{courseId}/materials/{materialId}/ingest`
- **Role**: `Lecturer` hoặc `Administrator`
- **Response**: `200 OK` ➔ `CourseMaterialDto` (status chuyển thành `'Ready'`).

#### 4. AI Sinh câu hỏi tự động
- **Endpoint**: `POST /api/courses/{courseId}/question-bank/generations`
- **Role**: `Lecturer` hoặc `Administrator`
- **Payload**:
```json
{
  "topic": "Microservices Architecture",
  "bloom": "Understand",
  "count": 3,
  "sourceExcerpts": [
    "Tài liệu trích dẫn bổ sung nếu có..."
  ],
  "platformRubricVersionId": "44444444-0000-0000-0000-000000000001",
  "sourceMaterialIds": [
    "88888888-0000-0000-0000-000000000001"
  ]
}
```
- **Response**: `200 OK` ➔ `QuestionGenerationResult`
```typescript
interface QuestionCitation {
  sourceId: string;
  sourceIndex: number;
  quote: string;
}

interface GeneratedQuestionDraft {
  draftId: string; // Guid
  orderNo: number;
  content: string;
  bloom: 'Remember' | 'Understand' | 'Apply' | 'Analyze';
  status: 'Draft';
  platformRubricVersionId: string;
  citations: QuestionCitation[];
}

interface QuestionGenerationResult {
  courseId: string;
  provider: string;
  status: string;
  drafts: GeneratedQuestionDraft[];
}
```
- **Hành vi Backend**: Tự động lưu các drafts này vào bảng `question_bank_items` với `origin = 'Ai'`, `status = 'Draft'`, và lưu thông tin citations vào `question_bank_revisions.provenance_json`.
- **Lưu ý ngoại lệ**: Nếu không có bất kỳ excerpt hay sourceMaterialId nào có dữ liệu, backend trả về `409 Conflict` (`insufficient_source`).

---

### 5.2 Module 2: Luồng thi Phỏng vấn Sinh viên (Feature 3)

#### 1. Lấy danh sách ca thi của sinh viên
- **Endpoint**: `GET /api/interview/my-sessions`
- **Role**: `Student`
- **Response**: `200 OK` ➔ `IReadOnlyList<MySessionDto>`
```typescript
interface MySessionDto {
  examSessionId: string; // Guid
  courseCode: string; // Mã môn học, e.g. "SWD392"
  title: string; // Tên ca thi
  startTime: string; // ISO DateTime
  endTime: string; // ISO DateTime
  sessionStatus: 'Published' | 'Closed';
  isOpenNow: boolean; // True nếu thời gian hiện tại nằm trong [startTime, endTime]
  questionCount: number; // Tổng số câu hỏi trong ca thi
  timeLimitPerAnswerSeconds: number; // Giới hạn giây cho mỗi câu trả lời
  participantStatus: 'Registered' | 'InProgress' | 'Completed';
  latestAttemptId: string | null;
  latestAttemptStatus: 'InProgress' | 'PendingReview' | 'Finalized' | 'Interrupted' | null;
}
```

#### 2. Khởi tạo / Nạp lượt thi của sinh viên
- **Endpoint**: `POST /api/interview-attempts`
- **Role**: `Student`
- **Payload**:
```json
{
  "examSessionId": "33333333-0000-0000-0000-000000000001"
}
```
- **Response**: 
  - `201 Created` (nếu tạo mới lượt thi) hoặc `200 OK` (nếu lượt thi đang `InProgress` đã tồn tại) ➔ `AttemptStateDto`
- **Lưu ý ngoại lệ**:
  - `403 Forbidden`: Sinh viên không có tên trong danh sách thí sinh của ca thi (`not_on_participant_list`).
  - `409 Conflict`: Ca thi chưa mở hoặc đã kết thúc (`exam_session_not_open`), hoặc sinh viên đã dùng hết lượt thi (`attempt_already_taken`).

```typescript
interface CurrentTurnDto {
  questionResponseId: string; // Guid
  questionId: string; // Guid
  questionOrderNo: number; // e.g. 1
  turnNo: number; // e.g. 1
  type: 'Main' | 'FollowUp';
  questionText: string; // Nội dung câu hỏi
  askedAt: string; // ISO DateTime
  deadlineAt: string; // ISO DateTime
  turnId: string; // Guid nhận diện duy nhất lượt trả lời hiện tại
}

interface AttemptStateDto {
  attemptId: string; // Guid
  examSessionId: string; // Guid
  examTitle: string;
  status: 'InProgress' | 'PendingReview' | 'Finalized' | 'Interrupted';
  timeLimitSeconds: number;
  maxFollowUps: number;
  totalQuestions: number;
  answeredQuestions: number;
  startedAt: string;
  completedAt: string | null;
  currentTurn: CurrentTurnDto | null;
  stateVersion: number;
}
```

#### 3. Lấy trạng thái lượt thi hiện tại (khi reload trang)
- **Endpoint**: `GET /api/interview-attempts/{id}`
- **Role**: `Student`
- **Response**: `200 OK` ➔ `AttemptStateDto`

#### 4. Gửi câu trả lời cho lượt hiện tại
- **Endpoint**: `POST /api/interview-attempts/{id}/responses`
- **Role**: `Student`
- **Payload**:
```json
{
  "answerText": "Nội dung câu trả lời của thí sinh...",
  "turnId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
}
```
- **Response**: `200 OK` ➔ `SubmitAnswerResponse`
```typescript
interface SubmitAnswerResponse {
  outcome: 'FollowUp' | 'NextQuestion' | 'Completed';
  timedOut: boolean;
  evaluation: any | null; // Null đối với sinh viên khi điểm AI chưa công bố
  attempt: AttemptStateDto; // Trạng thái lượt thi sau khi cập nhật (có currentTurn tiếp theo nếu chưa xong)
  transcript: string | null;
  duplicate: boolean;
}
```

---

## 6. Danh sách File Cần Thay đổi / Bổ sung

| STT | Đường dẫn file | Hành động | Vai trò & Nội dung thay đổi |
|---|---|:---:|---|
| 1 | `src/api/services.js` | **Cập nhật** | • Thêm `courseMaterialsApi`: `list`, `upload`, `ingest`.<br>• Thêm `questionGenerationApi`: `generate`.<br>• Sửa `interviewApi`: `mySessions` gọi đúng `GET /api/interview/my-sessions`, `submit` gửi đúng `{ answerText, turnId }` và chuẩn hóa `res.attempt`. |
| 2 | `src/features/question-bank/QuestionBankPage.jsx` | **Cập nhật** | • Thêm tab/section quản lý "Tài liệu môn học (Course Materials)" kèm upload PDF/DOCX & Ingest.<br>• Thêm modal "AI Question Generation" nạp Platform Rubric và danh sách tài liệu.<br>• Bổ sung lọc theo Nguồn gốc (Origin: `All` \| `Manual` \| `Ai`).<br>• Hiển thị badge `AI` và cho phép Duyệt/Loại/Sửa câu hỏi AI sinh. |
| 3 | `src/features/question-bank/QuestionBank.css` | **Cập nhật** | Thêm scoped CSS cho panel Course Materials, form upload tài liệu và modal AI Question Generation theo theme Moonlight. |
| 4 | `src/features/interview/StudentHomePage.jsx` | **Cập nhật** | Nối trực tiếp `interviewApi.mySessions()`, ánh xạ các trường `isOpenNow`, `courseCode`, `title`, `timeLimitPerAnswerSeconds`, `participantStatus`, loại bỏ mock. |
| 5 | `src/features/interview/ExamLobbyPage.jsx` | **Cập nhật** | Kết nối trực tiếp dữ liệu ca thi và nút "Start interview" gọi `interviewApi.start(sessionId)` tạo lượt thi thật. |
| 6 | `src/features/interview/InterviewRoomPage.jsx` | **Cập nhật** | • Nối `AttemptStateDto` thật (`currentTurn.questionText`, `currentTurn.turnId`, `currentTurn.type`).<br>• Khi submit gửi `turnId` thật.<br>• Xử lý chuyển đổi `outcome` (`FollowUp`, `NextQuestion`, `Completed`) và cập nhật `attempt.currentTurn`. |
| 7 | `src/features/interview/interviewMachine.js` | **Cập nhật** | Tinh chỉnh reducer tương thích với `AttemptStateDto` backend (bảo tồn `currentTurn`, hỗ trợ đếm số câu và lượt hỏi xoáy chính xác). |
| 8 | `src/features/interview/AttemptDonePage.jsx` | **Cập nhật** | Hiển thị thông báo hoàn thành bài thi thật, trạng thái chờ Giảng viên chấm điểm (`PendingReview`). |
| 9 | `src/mocks/server.js` & `src/mocks/db.js` | **Cập nhật** | Cập nhật mock handlers và mock data cho `courseMaterials`, `questionGeneration`, và chuẩn hóa mock của `interview-attempts` để hỗ trợ chạy khi `VITE_USE_MOCKS=true`. |

---

## 7. Tiêu chuẩn UI/UX "Đêm Trung thu" & Scoped CSS

1. **Giao diện Giảng viên (Moonlight Theme - `.pg-questionbank`)**:
   - Tab "Materials" nằm cạnh danh sách câu hỏi trong Question Bank.
   - Bảng tài liệu giáo trình: Cột Tên file, Kích thước (MB/KB), Ngày tải, Trạng thái Ingest (Badge ngọc bích `Ready` hoặc hổ phách `Pending`), Hành động (nút "Ingest" nếu cần).
   - Nút "Generate with AI" (nền Vàng rằm hổ phách `var(--lantern-gold)`, icon AI tia sáng) đặt cạnh nút "+ New Question".
   - Modal AI Generator có giao diện trang nhã Moonlight, hỗ trợ chọn tài liệu nguồn đa chọn (checkbox) và thanh trượt hoặc ô nhập số lượng câu hỏi sinh.
2. **Giao diện Sinh viên (Night Theme - `.pg-studenthome`, `.pg-examlobby`, `.pg-interviewroom`)**:
   - Tông màu nền xanh đêm sâu `#0F1630` kết hợp viền ánh trăng `rgba(246,241,231,0.08)`.
   - Giữ nguyên hiệu ứng chuyển động đèn lồng (Lantern turn), vầng sáng AI ấm áp, karaoke highlight từng từ khi AI đọc câu hỏi.
   - Đồng hồ đếm ngược có hiệu ứng nhấp nháy đỏ sơn mài khi còn dưới 10 giây.
   - Nút submit "Finish answer" hoặc tự động nộp khi hết giờ.

---

## 8. Bộ Tiêu chí Chấp thuận Nghiệm thu (Acceptance Criteria - AC)

### AC-01: Upload & Ingest Tài liệu Môn học (Course Materials)
- **Given**: Giảng viên phụ trách môn học đang ở trang Question Bank (`/lecturer/question-bank`).
- **When**: Giảng viên chọn tab/khu vực "Materials", chọn file tài liệu (`.pdf` hoặc `.docx`) và bấm "Upload Material".
- **Then**:
  - Gửi `POST /api/courses/{courseId}/materials` dạng `multipart/form-data`.
  - Backend trả về `201 Created` và file xuất hiện trong danh sách tài liệu.
  - Khi bấm nút "Ingest" (hoặc nếu tự động), gửi `POST .../materials/{materialId}/ingest`, trạng thái chuyển sang `Ready`.
  - Database Postgres bảng `course_materials` có bản ghi tương ứng với `status = 'Ready'`.

### AC-02: AI Sinh Câu hỏi Tự động (Question Generation)
- **Given**: Môn học đã có tài liệu giáo trình ở trạng thái `Ready` và Platform Rubric đang hoạt động.
- **When**: Giảng viên bấm nút "Generate with AI", nhập Topic `"Microservices"`, chọn Bloom `"Understand"`, chọn số lượng `3`, tích chọn tài liệu giáo trình đã tải và bấm "Generate Questions".
- **Then**:
  - Frontend gọi `POST /api/courses/{courseId}/question-bank/generations` với payload đầy đủ gồm `topic`, `bloom`, `count`, `platformRubricVersionId`, `sourceMaterialIds`.
  - Backend sinh ra các câu hỏi và lưu vào `question_bank_items` với `origin = 'Ai'`, `status = 'Draft'`.
  - Modal đóng lại, danh sách câu hỏi tự động làm mới và hiển thị các câu hỏi mới sinh với badge `AI` màu hổ phách và badge `Draft` màu vàng rằm.

### AC-03: Giảng viên Duyệt & Sửa Câu hỏi do AI Sinh
- **Given**: Câu hỏi do AI sinh đang ở trạng thái `Draft` trong Ngân hàng đề.
- **When**: Giảng viên kiểm tra nội dung và bấm nút **"Approve"** (hoặc mở modal **"Revise"** để sửa rồi bấm Approve).
- **Then**:
  - Frontend gọi `POST /api/courses/{courseId}/question-bank/{itemId}/approve`.
  - Badge câu hỏi chuyển sang màu xanh ngọc bích `Approved`.
  - Câu hỏi này trở thành câu hỏi hợp lệ để Giảng viên có thể chọn gán vào bất kỳ Ca thi nháp nào trong `SessionSetupPage`.

### AC-04: Lấy Danh sách Ca thi Sinh viên từ API Thật
- **Given**: Sinh viên đăng nhập vào hệ thống qua Keycloak OIDC.
- **When**: Truy cập trang chủ Sinh viên (`/student`).
- **Then**:
  - Frontend gọi `GET /api/interview/my-sessions`.
  - Hiển thị chính xác các ca thi mà sinh viên đã được ghi danh trong bảng `participants`.
  - Ca thi có thời gian hiện tại nằm trong khoảng bắt đầu - kết thúc hiển thị nhãn `Open now` kèm đồng hồ đếm ngược chính xác.

### AC-05: Khởi tạo Lượt thi Thật (Start Attempt)
- **Given**: Sinh viên ở trang Lobby của ca thi đang mở (`/student/sessions/{id}/lobby`).
- **When**: Sinh viên kiểm tra microphone thành công và bấm nút **"Start interview"**.
- **Then**:
  - Frontend gọi `POST /api/interview-attempts` với body `{ examSessionId }`.
  - Backend tạo bản ghi trong bảng `interview_attempts` với `status = 'InProgress'`.
  - Frontend điều hướng tới `/student/attempts/{attemptId}` và hiển thị câu hỏi đầu tiên từ `currentTurn.questionText`.

### AC-06: Vòng lặp Hỏi – Trả lời – Hỏi xoáy (Viva Turn Loop)
- **Given**: Sinh viên đang trong phòng thi phỏng vấn (`/student/attempts/{attemptId}`).
- **When**: 
  - Hệ thống đọc xong câu hỏi, đồng hồ đếm ngược bắt đầu chạy.
  - Sinh viên nhập câu trả lời và bấm "Finish answer" (hoặc khi đồng hồ đếm ngược hết giờ tự động nộp).
- **Then**:
  - Frontend gửi `POST /api/interview-attempts/{id}/responses` kèm body `{ answerText, turnId: currentTurn.turnId }`.
  - Backend ghi nhận câu trả lời vào bảng `interview_turns`.
  - Nếu backend trả về `outcome: "FollowUp"`: UI chuyển cảnh đèn lồng, hiển thị câu hỏi phụ mới từ `attempt.currentTurn`.
  - Nếu backend trả về `outcome: "NextQuestion"`: UI chuyển sang câu hỏi chính tiếp theo.

### AC-07: Hoàn tất Lượt thi & Lưu Trạng thái PendingReview
- **Given**: Sinh viên trả lời câu hỏi cuối cùng của ca thi.
- **When**: Nộp câu trả lời cuối cùng.
- **Then**:
  - Backend trả về `outcome: "Completed"` và cập nhật trạng thái lượt thi thành `PendingReview`.
  - Frontend điều hướng sinh viên sang trang `/student/attempts/{attemptId}/done`.
  - Database Postgres xác nhận: `interview_attempts.status = 'PendingReview'`, toàn bộ các câu trả lời nằm đầy đủ trong `interview_turns`.
  - Giảng viên mở trang `/lecturer/attempts/{attemptId}/review` có thể nhìn thấy toàn bộ bài làm để chấm điểm.

### AC-08: Zero Mock & Tương thích 100% Môi trường Thật
- **Given**: Môi trường chạy chuẩn với `VITE_USE_MOCKS=false`.
- **When**: Thực thi toàn bộ quy trình từ Giảng viên tải giáo trình, sinh câu hỏi AI, gán vào ca thi, cho đến Sinh viên đăng nhập Keycloak và thi phỏng vấn.
- **Then**:
  - 100% dữ liệu được đọc và ghi vào PostgreSQL thật và xác thực qua Keycloak OIDC thật.
  - Không có bất kỳ request nào bị rơi vào mock rỗng hay lỗi 404/403.

### AC-09: Zero Regression & Build 0 Error
- **Given**: Toàn bộ dự án sau khi hoàn tất tích hợp Giai đoạn 3.
- **When**: Chạy lệnh build kiểm tra `npm run build`.
- **Then**:
  - `npm run build` kết thúc thành công với mã thoát 0 (0 error, 0 blocking warning).
  - Không làm gãy bất kỳ tính năng nào đã hoàn thiện ở Giai đoạn 1 và 2.

---

## 9. Checklist Chi tiết cho Agent 2 (Coder)

Agent 2 phải đối chiếu và hoàn thành 100% các đầu việc sau:

- [ ] **1. Nâng cấp API Services (`src/api/services.js`)**:
  - [ ] Khai báo `courseMaterialsApi`:
    ```javascript
    export const courseMaterialsApi = {
      list: (courseId) => api.get(`/api/courses/${enc(courseId)}/materials`),
      upload: (courseId, formData) => api.postFormData(`/api/courses/${enc(courseId)}/materials`, formData),
      ingest: (courseId, materialId) => api.post(`/api/courses/${enc(courseId)}/materials/${enc(materialId)}/ingest`),
    }
    ```
  - [ ] Khai báo `questionGenerationApi`:
    ```javascript
    export const questionGenerationApi = {
      generate: (courseId, payload) => api.post(`/api/courses/${enc(courseId)}/question-bank/generations`, payload),
    }
    ```
  - [ ] Chuẩn hóa `interviewApi`:
    ```javascript
    export const interviewApi = {
      mySessions: () => api.get('/api/interview/my-sessions'),
      mySession: async (id) => {
        const list = await api.get('/api/interview/my-sessions')
        return (list || []).find((s) => s.examSessionId === id || s.id === id) || null
      },
      start: (examSessionId) => api.post('/api/interview-attempts', { examSessionId }),
      get: (attemptId) => api.get(`/api/interview-attempts/${enc(attemptId)}`),
      submit: async (attemptId, answerText, turnId) => {
        return api.post(`/api/interview-attempts/${enc(attemptId)}/responses`, { answerText, turnId })
      },
    }
    ```
- [ ] **2. Tích hợp Module 1 vào Question Bank (`src/features/question-bank/`)**:
  - [ ] Bổ sung tab/khu vực "Tài liệu môn học" (Course Materials): nạp danh sách từ `courseMaterialsApi.list(selectedCourseId)`, hiển thị tên file, dung lượng, trạng thái Ingest.
  - [ ] Thêm nút/form Upload tài liệu (hỗ trợ chọn file PDF/DOCX, gửi qua `courseMaterialsApi.upload`), nút Ingest tài liệu.
  - [ ] Xây dựng Modal "Generate with AI" (nút trên Toolbar):
    - Cho phép chọn Topic, Bloom (`Remember`, `Understand`, `Apply`, `Analyze`), Count (mặc định 3).
    - Lấy active rubric version từ `rubricApi.getPlatformRubric()` để điền `platformRubricVersionId`.
    - Chọn các tài liệu nguồn đã `Ready` từ danh sách materials.
    - Gọi `questionGenerationApi.generate`, hiển thị trạng thái sinh câu hỏi, thêm các câu hỏi tạo được vào danh sách.
  - [ ] Bổ sung bộ lọc Origin: `All` | `Manual` | `Ai`.
  - [ ] Hiển thị badge nguồn gốc `AI` màu hổ phách (`#D97706`) cho câu hỏi sinh từ AI.
  - [ ] Tích hợp CSS scoped cho các thành phần mới trong `QuestionBank.css`.
- [ ] **3. Cập nhật Luồng thi Sinh viên (`src/features/interview/`)**:
  - [ ] **`StudentHomePage.jsx`**:
    - Sử dụng `interviewApi.mySessions()`.
    - Cập nhật logic lọc theo DTO mới:
      - `open`: ca thi có `isOpenNow === true` và `participantStatus !== 'Completed'`.
      - `upcoming`: ca thi có `sessionStatus === 'Published'` và chưa tới giờ mở.
      - `finished`: ca thi có `participantStatus === 'Completed'` hoặc `sessionStatus === 'Closed'`.
    - Hiển thị đúng `courseCode`, `title`, số lượng câu hỏi `questionCount`.
  - [ ] **`ExamLobbyPage.jsx`**:
    - Nối nút Start với `interviewApi.start(sessionId)`.
    - Sau khi gọi thành công, chuyển hướng tới `/student/attempts/${res.attemptId}`.
  - [ ] **`InterviewRoomPage.jsx` & `interviewMachine.js`**:
    - Xử lý nạp `AttemptStateDto`: lấy câu hỏi từ `attempt.currentTurn.questionText`, `turnId` từ `attempt.currentTurn.turnId`, loại câu hỏi từ `attempt.currentTurn.type`.
    - Khi bấm Submit: gọi `interviewApi.submit(attemptId, text, currentTurn.turnId)`.
    - Nhận `res = { outcome, attempt }`:
      - Dispatch action `OUTCOME` với `outcome: res.outcome` và `attempt: res.attempt`.
      - Khi `outcome === 'Completed'`: điều hướng tới `/student/attempts/${attemptId}/done`.
      - Khi `outcome === 'FollowUp'` hoặc `'NextQuestion'`: chuyển sang lượt mới với câu hỏi từ `res.attempt.currentTurn`.
- [ ] **4. Mock Handlers (`src/mocks/server.js`)**:
  - [ ] Cập nhật route mock `/api/courses/:courseId/materials` (GET, POST) và `/api/courses/:courseId/materials/:materialId/ingest`.
  - [ ] Cập nhật route mock `/api/courses/:courseId/question-bank/generations`.
  - [ ] Cập nhật route mock `/api/interview/my-sessions` và chuẩn hóa format của `/api/interview-attempts/:id/responses` trả về `{ outcome, attempt }` khớp backend DTO.
- [ ] **5. Tuân thủ Nguyên tắc Chung**:
  - [ ] Tuyệt đối **KHÔNG** sửa bất kỳ file nào trong repo Backend `ai-oral-exam-api`.
  - [ ] Tuyệt đối **KHÔNG** tự ý commit hay push Git.
  - [ ] Kiểm tra `npm run build` đạt kết quả xanh 100%.

---

## 10. Checklist Kiểm thử cho Agent 3 (Reviewer) & Test Specifications

Agent 3 chịu trách nhiệm review mã nguồn và thực thi kịch bản kiểm thử E2E tự động bằng Playwright trên môi trường thật (Docker DB + Keycloak + Backend API):

### 10.1 Checklist Rà soát Mã nguồn (Code Review)
- [ ] Các endpoint trong `src/api/services.js` khớp 100% với Backend Controllers thật.
- [ ] Đã loại bỏ hoàn toàn mock trong luồng sinh viên khi chạy ở chế độ thực tế (`VITE_USE_MOCKS=false`).
- [ ] Không có file backend nào bị sửa (`git -C ../ai-oral-exam-api status` sạch 100%).
- [ ] Thiết kế đúng bảng màu Đêm Trung thu (Moonlight cho Giảng viên, Night cho Sinh viên), font Alegreya + Lexend, không lọt Tailwind CSS.
- [ ] Toàn bộ CSS mới đều scoped theo prefix màn hình (`.pg-questionbank`, `.pg-studenthome`, `.pg-interviewroom`).

### 10.2 Kịch bản Kiểm thử E2E Playwright Bắt buộc (`tests/e2e-phase3-qa.mjs`)

Agent 3 phải viết và chạy kiểm thử tự động với 4 kịch bản E2E kết hợp kiểm tra Database PostgreSQL:

#### Kịch bản 1: Giảng viên Upload & Ingest Tài liệu Giáo trình Môn học
1. Giảng viên đăng nhập qua Keycloak (`an.nv@aives.edu.vn`).
2. Mở Question Bank môn SWD392: `/lecturer/question-bank`.
3. Mở tab Tài liệu, upload một file giáo trình mẫu (`sample-syllabus.txt` hoặc `.pdf`).
4. Bấm "Ingest" tài liệu.
5. **Assertion**:
   - HTTP response trả về 200 OK.
   - Trạng thái tài liệu trên UI hiển thị badge xanh `Ready`.
   - Query DB Postgres: `SELECT status FROM course_materials WHERE course_id = '22222222-0000-0000-0000-000000000001' ORDER BY created_at DESC LIMIT 1;` trả về `'Ready'`.

#### Kịch bản 2: AI Sinh Câu hỏi Tự động & Giảng viên Duyệt (Approve)
1. Giảng viên bấm nút "Generate with AI" trên thanh công cụ Question Bank.
2. Nhập Topic `"Domain Driven Design"`, chọn Bloom `"Understand"`, chọn số lượng `2`, tích chọn tài liệu giáo trình vừa Ingest ở Kịch bản 1.
3. Bấm "Generate Questions".
4. **Assertion**:
   - HTTP response `POST /api/courses/{courseId}/question-bank/generations` trả về 200 OK.
   - Các câu hỏi mới hiển thị trên danh sách với badge `AI` và badge `Draft`.
   - Giảng viên bấm "Approve" câu hỏi đầu tiên. Badge chuyển sang `Approved`.
   - Query DB Postgres: Bảng `question_bank_items` có bản ghi mới với `origin = 'Ai'`, `status = 'Approved'`, `topic = 'Domain Driven Design'`.

#### Kịch bản 3: Sinh viên Khởi tạo Ca thi Phỏng vấn Thật
1. Sinh viên (`chau.lm@aives.edu.vn`) đăng nhập qua Keycloak.
2. Mở trang chủ `/student`: kiểm tra ca thi đang mở xuất hiện từ API thật `GET /api/interview/my-sessions`.
3. Bấm vào Lobby ca thi: `/student/sessions/{sessionId}/lobby`.
4. Bấm nút "Start interview".
5. **Assertion**:
   - HTTP response `POST /api/interview-attempts` trả về 201 hoặc 200 OK.
   - UI điều hướng tới `/student/attempts/{attemptId}`.
   - Màn hình thi hiển thị câu hỏi đầu tiên lấy từ backend (`currentTurn.questionText`).
   - Query DB Postgres: Bảng `interview_attempts` có bản ghi mới với `student_id = {chauUserId}`, `status = 'InProgress'`.

#### Kịch bản 4: Sinh viên Trả lời Câu hỏi & Hoàn thành Bài thi
1. Tại màn hình thi `/student/attempts/{attemptId}`, sinh viên nhập nội dung trả lời câu hỏi và bấm "Finish answer".
2. **Assertion**:
   - HTTP response `POST /api/interview-attempts/{id}/responses` gửi đúng `turnId` và trả về 200 OK.
   - UI hiển thị phản hồi (Hỏi xoáy tiếp hoặc chuyển câu tiếp theo).
   - Tiếp tục trả lời cho đến khi hoàn tất ca thi, UI tự động điều hướng sang trang `/student/attempts/{attemptId}/done`.
   - Query DB Postgres:
     - Bảng `interview_turns` có ít nhất 1 bản ghi câu trả lời của sinh viên.
     - Bảng `interview_attempts` cập nhật `status = 'PendingReview'`.
   - Chụp ảnh màn hình lưu bằng chứng vào `tests/e2e-phase3-evidence-01-materials.png`, `tests/e2e-phase3-evidence-02-ai-generated.png`, `tests/e2e-phase3-evidence-03-student-exam.png`, `tests/e2e-phase3-evidence-04-exam-done.png`.

---

## 11. Quy trình Nghiệm thu Cuối cùng (Sign-Off Workflow)

Sau khi Agent 2 hoàn tất lập trình và Agent 3 chạy test báo cáo kết quả:
1. **Agent 1** đối chiếu mã nguồn thực tế với 9 tiêu chí AC (AC-01 -> AC-09).
2. Kiểm tra log kiểm thử E2E và ảnh chụp bằng chứng nghiệm thu của Agent 3.
3. Chạy lệnh kiểm tra build: `npm run build` xác nhận không có lỗi phát sinh.
4. Lập Biên bản Nghiệm thu Chính thức Giai đoạn 3 vào cuối tài liệu này và báo cáo kết quả cho Hiệu (`AkioChan0308`) phê duyệt quyết định commit.
