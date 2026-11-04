# Frontend CareerHub

Áp dụng cho toàn bộ thư mục `frontend/`.

Trước khi tạo, sửa hoặc review giao diện, điều hướng, form, tương tác hay tích hợp API phía frontend, đọc và áp dụng skill [recruitment-frontend-design](.agents/skills/recruitment-frontend-design/SKILL.md). Đọc thêm tài liệu nghiệp vụ mà skill chỉ dẫn khi thay đổi luồng tương ứng.

- Đọc component, layout và API adapter hiện hành trước khi sửa. Giữ riêng luồng ứng viên, nhà tuyển dụng, quản trị viên; dùng shell, route helper và session hiện có.
- Yêu cầu hiện tại của người dùng và thiết kế được chỉ định quyết định phạm vi. Skill không cho phép tự mở rộng sang backend, đổi cấu hình, deploy hoặc thao tác dữ liệu thật.
- Không tự tạo commit. Không đưa thông tin đăng nhập, token hoặc nội dung `.env` vào code, tài liệu hay ảnh minh họa.
- Đây là repo đang hoạt động: giữ các thay đổi chưa commit khác, chỉ kiểm tra phần liên quan. Thay đổi riêng tài liệu/skill không cần build lại ứng dụng hoặc Docker.

Các lệnh từ `frontend/` (Windows dùng `npm.cmd`/`npx.cmd` nếu PowerShell chặn script):

```powershell
npm.cmd run typecheck
npm.cmd run test:api
npx.cmd playwright test tests/e2e/<file-lien-quan>.spec.ts
npm.cmd run build
```

Chọn kiểm tra theo thay đổi; xem mục kiểm chứng trong skill. Không coi kiểm thử dùng API giả lập là bằng chứng dịch vụ thật đã chạy.
