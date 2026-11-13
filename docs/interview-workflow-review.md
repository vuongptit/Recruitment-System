# Quy trình phỏng vấn một vòng — 13/11/2026

## Quy trình hiện hành

Theo yêu cầu mới, việc đặt lịch chỉ gồm hai thao tác:

1. Nhà tuyển dụng chọn **một ngày giờ**, thời lượng, hình thức trực tuyến/trực tiếp và địa điểm nếu trực tiếp; bấm **Gửi lịch phỏng vấn**.
2. Ứng viên xem thông tin và bấm **Xác nhận tham gia**. Việc đặt lịch hoàn tất; nhà tuyển dụng thấy **Đã xác nhận** khi làm mới.

Mỗi hồ sơ chỉ có một vòng phỏng vấn. Xác nhận lịch không tự chuyển đơn sang đã tuyển, không tạo offer và không giả định buổi phỏng vấn đã diễn ra.

## Giao diện

- Bỏ chọn số vòng, tạo vòng tiếp, kiểm tra/gợi ý nhiều khung giờ, xin dời lịch và hủy lịch phía ứng viên.
- Bỏ form chấm điểm khỏi trang đặt lịch. Đánh giá hồ sơ và quyết định tuyển dụng tiếp tục ở màn hình hồ sơ hiện có.
- Nhà tuyển dụng: một form gọn; sau khi gửi chỉ còn thẻ lịch và trạng thái phản hồi. Có thể sửa lịch hẹn nếu nhập nhầm; sử dụng cùng form, không tạo vòng mới.
- Ứng viên: một thẻ lịch hiện tại cho mỗi hồ sơ và một nút xác nhận. Phỏng vấn trực tuyến vẫn có nút vào phòng đúng cửa sổ thời gian, sau khi đã xác nhận.
- Thời gian hiển thị GMT+7; có pending, lỗi giữ nguyên input, nút làm mới, phân trang và giao diện desktop/mobile.
- Lịch cũ và các vòng đã tồn tại không bị xóa hoặc đổi số vòng. Bản hiện tại được chọn theo lịch chưa hủy và thời điểm tạo; nhà tuyển dụng mở mục lịch sử để xem các bản cũ.

## Backend

- Tạo lịch chấp nhận roundNumber=1; bỏ trống/0 mặc định 1. Các giá trị khác bị từ chối.
- Transaction khóa theo applicationId bằng PostgreSQL advisory lock, kiểm tra requestId rồi kiểm tra lịch đã có: hai người tạo đồng thời không tạo thành hai lịch/vòng.
- Lịch COMPLETED hoặc NO_SHOW vẫn chiếm vòng duy nhất, không thể tạo vòng hai bằng requestId khác. Nếu tất cả lịch cũ đã CANCELLED thì có thể gửi lại một lịch vòng 1.
- API ứng viên đề xuất nhiều giờ trả 409 INTERVIEW_RESCHEDULE_DISABLED. Các bản RESCHEDULE_REQUESTED cũ giữ nguyên; tuyển dụng có thể sửa một thời gian mới để ứng viên xác nhận.
- Sửa lịch dùng API recruiter hiện có: thay bản cũ bằng revision mới trong transaction, lịch mới SCHEDULED và không kế thừa confirmedAt. Retry cùng nội dung/requestId trả cùng bản.
- Xác nhận vẫn kiểm tra đúng ứng viên, thời gian, trạng thái lịch và Application đang INTERVIEW. Các kiểm tra quyền và chống trùng giờ được giữ.
- API feedback tương thích dữ liệu cũ, nhận PASS/FAIL; không tạo mới NEXT_ROUND. Không cần feedback để hoàn tất đặt lịch.
- Không đổi schema, chạy migration dữ liệu, xóa lịch hoặc gửi email thử trong database người dùng.

## Kiểm chứng

- Type-check và 180 kiểm thử helper/API frontend đạt.
- 20 ca Playwright desktop/mobile đạt, gồm hai phiên recruiter/candidate tạo, xác nhận, sửa thời gian và xác nhận lại; input/khóa gửi, retry cùng requestId và không tràn ngang.
- Unit test Go đạt. Kiểm thử HTTP + PostgreSQL riêng đạt: một vòng, candidate không đề xuất nhiều giờ, xác nhận đúng chủ sở hữu, sửa lịch cần xác nhận lại, hai recruiter tạo đồng thời chỉ nhận một lịch, hoàn tất không mở thêm vòng.
- Các thao tác ghi thử dùng fixture/DB riêng; không tạo lịch giả hoặc gửi thư ra ngoài cho tài khoản người dùng.
- Đã build và cập nhật Docker local cho Frontend/Interview Service; cả hai healthy. Smoke tài khoản thử của hai vai trò: đăng nhập 200 với cookie HttpOnly, API lịch 200, trang ứng viên và danh sách hồ sơ tuyển dụng tải được. Hai tài khoản thử hiện không có lịch; luồng ghi được kiểm chứng trên PostgreSQL riêng và trình duyệt dùng fixture như trên.

## Giới hạn

- Đây là xác nhận lịch, không phải tự động đánh giá hoặc kết thúc tuyển dụng. Tham dự và kết quả tuyển dụng là bước riêng.
- Danh sách có phân trang: trang ứng viên thể hiện lịch hiện tại trong dữ liệu đã tải. Có nút tải thêm; không trình bày số tải về như tổng toàn hệ thống.
- Thay đổi trạng thái phía bên kia hiển thị sau khi làm mới; không có polling tự động trong trang đặt lịch.
- Availability cá nhân Google/Outlook chưa được đồng bộ. Quyền Application/Interview vẫn qua hai dịch vụ riêng, không phải distributed transaction.
