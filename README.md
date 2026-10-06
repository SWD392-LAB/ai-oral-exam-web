# ai-oral-exam-web

Frontend của **AIVES – AI-powered Viva Exam System** (SWD392). Một web app React cho cả 3 vai trò: **Student**, **Lecturer**, **Administrator**, dùng chung phần đăng nhập, đăng ký và cài đặt tài khoản.

- **Stack:** React + Vite (responsive, dùng được trên tablet)
- **Giao tiếp BE:** REST cho request thường; **WebSocket** cho buổi thi (server tự đẩy câu hỏi tiếp theo / câu hỏi xoáy)
- **Micro:** trình duyệt chỉ cho dùng micro trên **HTTPS** (hoặc `localhost`), nên mọi môi trường deploy đều phải có HTTPS

Repo backend: `ai-oral-exam-api`. Tài liệu thiết kế: repo `docs`.

> Repo đang ở bước khung thư mục, chưa scaffold. Các thư mục còn trống có `.gitkeep`; xoá file này khi thư mục đã có code.

---

## 1. Cài đặt cần có

| Công cụ | Phiên bản | Kiểm tra |
|---|---|---|
| Node.js | 20 LTS trở lên | `node --version` |
| Backend `ai-oral-exam-api` | chạy ở `http://localhost:5080` | mở http://localhost:5080/health |

## 2. Chạy

```bash
npm install
npm run dev        # http://localhost:5173
```

Tạo file `.env.local` (không commit):

```
VITE_API_BASE_URL=http://localhost:5080
```

BE đã mở CORS cho `http://localhost:5173` và `http://localhost:3000`. Chạy port khác thì phải thêm vào `Cors:AllowedOrigins` bên API.

**Tài khoản test:** xem bảng "Dữ liệu mẫu" trong README của `ai-oral-exam-api` (mật khẩu chung `Password@123`). Demo luồng thi dùng `han.hg@aives.edu.vn`.

## 3. Cấu trúc project

```
ai-oral-exam-web/
├── public/
└── src/
    ├── app/
    │   ├── layouts/        # layout chung + layout từng portal (FE-PLAT-01)
    │   └── routes/         # router, chặn route theo role (FE-PLAT-03)
    ├── api/                # HTTP client dùng chung, xử lý lỗi thống nhất (FE-PLAT-02); WebSocket client
    ├── components/         # UI dùng chung
    ├── hooks/
    ├── utils/
    ├── mocks/              # dữ liệu mock khi API chưa có
    ├── assets/
    ├── styles/
    └── features/
        ├── auth/           # F7 – đăng nhập, đăng ký, Google SSO, quên / đặt mật khẩu
        ├── account/        # F7 – Account Settings
        ├── interview/      # F3 – trang thi, state machine giao diện, timer (FE-INT-*)
        ├── score-review/   # F3 – giảng viên xem transcript, chốt điểm
        ├── reporting/      # F6 – báo cáo sinh viên, thống kê lớp, xuất bảng điểm (FE-PLAT-04)
        ├── exam-config/    # F7 – phiên thi, câu hỏi, rubric, danh sách sinh viên, publish
        └── admin/          # F7 – tài khoản, course, cấu hình STT/TTS/LLM, audit log
```

Code của một tính năng nằm trong `features/<tên>/`. Chỉ đưa lên `components/`, `hooks/`, `utils/` khi có từ 2 feature trở lên dùng chung.

## 4. Quy ước

**Gọi tên đúng như use case / ERD / class diagram (FOUNDATION-01):**

- *Exam Session* (phiên thi do giảng viên tạo) ≠ *Interview Attempt* (lượt thi của một sinh viên)
- *câu hỏi chính* ≠ *câu hỏi xoáy* (follow-up)
- *phân tích câu trả lời* ≠ *chấm điểm*

**Xử lý lỗi:** mọi lỗi từ API có cùng format

```json
{ "code": "exam_session_not_open", "message": "Phiên thi chưa được mở.", "traceId": "...", "details": null }
```

Rẽ nhánh theo `code`, hiện `message` cho người dùng.

**Trạng thái lượt thi:** `InProgress → PendingReview → Finalized`. Mỗi lần nộp câu trả lời, API trả `outcome`: `FollowUp` | `NextQuestion` | `Completed`.

**Timer:** đếm theo giây cho **từng lần trả lời** (kể cả câu hỏi xoáy). Hết giờ thì tự nộp, sang lần trả lời mới thì đếm lại.

**Điểm:** AI chỉ *gợi ý* điểm. Sinh viên chỉ xem được báo cáo khi giảng viên đã chốt điểm; trước đó hiện "đang chờ duyệt".

## 5. Lộ trình (theo tracker)

- **M1:** đăng nhập → trang thi → tạo lượt thi → nhận câu hỏi → timer → gõ câu trả lời → hiện điểm mock
- **M2:** micro, ghi âm, phát câu hỏi bằng TTS, WebSocket
- **M3:** báo cáo sinh viên, giảng viên duyệt và chốt điểm, thống kê lớp, xuất bảng điểm
- **M4:** đăng ký, Google SSO, đặt / đặt lại mật khẩu, cài đặt tài khoản, cấu hình phiên thi, màn hình admin
