# Quy ước ngôn ngữ giao diện CareerHub

Giao diện ứng viên, nhà tuyển dụng và quản trị viên dùng tiếng Việt. API, route, tên trường, mã trạng thái và metadata sự kiện giữ nguyên hợp đồng hiện hành.

## Thuật ngữ chung

| Thuật ngữ trong code | Hiển thị |
| --- | --- |
| Candidate | Ứng viên |
| Recruiter | Nhà tuyển dụng |
| Admin | Quản trị viên |
| Offer | Thư mời nhận việc |
| File | Tệp |
| Pipeline | Quy trình tuyển dụng |
| Online / Offline | Trực tuyến / Ngoại tuyến |
| PUBLISHED | Đang tuyển |
| REVIEWING | Đang xem xét |

`frontend/lib/recruitmentLabels.ts` là nơi dùng chung nhãn trạng thái tuyển dụng. Trạng thái mới chưa có nhãn phải hiển thị “Chưa rõ trạng thái”, không in nguyên mã nội bộ hoặc suy đoán là đã thành công. Các ô chi tiết quản trị dịch theo loại trường, không thay đổi tên, mô tả hoặc ghi chú người dùng.

Nhãn hình thức phỏng vấn lấy từ `interviewModeLabel` trong `interviewApi.ts`; tên thư viện kết nối không đưa vào nhãn người dùng. Kết luận phỏng vấn mới chưa có bản dịch hiển thị “Chưa có kết luận”. Các gợi ý tìm kiếm có thể dùng nhãn tiếng Việt riêng với từ khóa gửi đi, giữ nguyên ý nghĩa truy vấn đã có.

## Thông báo

- Notification Service tạo mẫu thông báo ứng tuyển, thư mời và lịch phỏng vấn bằng tiếng Việt ngay từ nguồn. Không đổi người nhận, loại sự kiện, metadata hoặc liên kết.
- `notificationPresentation.ts` hỗ trợ các mẫu tiếng Anh cũ đã lưu. Chỉ dịch những mẫu hệ thống đã biết; không viết lại database hoặc dịch tùy tiện tin nhắn, tên vị trí và nội dung do người dùng nhập.
- Chuỗi điều khiển cuộc gọi trong sự kiện giữ nguyên để client xử lý; khi xuất hiện ở hộp thư, chỉ hiển thị thông báo dễ hiểu.
- Chuỗi mới đã là tiếng Việt được giữ nguyên, tránh dịch lại hoặc mất nội dung.

## Thành phần và kiểm tra

- `FilePicker` cung cấp chữ “Chọn tệp / Chưa chọn tệp” và hỗ trợ bàn phím, tránh phụ thuộc chữ mặc định của trình duyệt. Tên tệp gốc vẫn hiển thị nguyên văn.
- Tên thương hiệu, email, CV, PDF, AI, tên công nghệ/kỹ năng và nội dung người dùng không cần đổi sang tiếng Việt.
- Kiểm tra nhãn giao diện không làm thay đổi payload gửi API. Kiểm tra thông báo cũ/mới, nút đánh dấu đã đọc và liên kết theo từng vai trò.
- Các kiểm thử Playwright dùng API giả lập cho thao tác ghi; không dùng thông báo thật hoặc thông tin đăng nhập thật để kiểm tra câu chữ.
