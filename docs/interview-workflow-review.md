# Rà soát lịch phỏng vấn và xác nhận — 13/11/2026

## Căn cứ và định hướng

Đối chiếu [Scheduling overview của Greenhouse](https://support.greenhouse.io/hc/en-us/articles/36307427046555-Scheduling-overview) và [Reschedule or cancel an interview](https://support.greenhouse.io/hc/en-us/articles/200241969-Reschedule-or-cancel-an-interview): lịch được tạo theo giai đoạn tuyển dụng, cần thông tin tham dự rõ ràng, cập nhật lịch phải đi kèm xác nhận mới cho ứng viên. Không coi một sản phẩm ATS là tiêu chuẩn bắt buộc cho mọi doanh nghiệp.

CareerHub giữ quy trình hiện có, phân biệt **đơn ứng tuyển**, **lời mời/lịch hẹn**, **ghi nhận tham dự** và **đánh giá**. Không tự quyết định tuyển/từ chối khi tạo lịch hoặc lưu phiếu đánh giá.

## Các vấn đề đã sửa

| Vấn đề trước rà soát | Xử lý |
| --- | --- |
| API cho xác nhận lịch đang xin dời; UI không cho | Chỉ SCHEDULED được xác nhận. CONFIRMED gửi lại là idempotent; RESCHEDULE_REQUESTED phải được xử lý bằng lịch mới |
| Nhà tuyển dụng vào phòng trước làm lịch IN_PROGRESS | Chỉ ứng viên vào phòng mới ghi nhận bắt đầu/tham dự; phòng chuẩn bị của nhà tuyển dụng không thay thế xác nhận |
| OFFLINE bị đánh vắng mặt do không vào video | Worker chỉ đánh dấu ONLINE quá cửa sổ tham gia; không suy luận tham dự trực tiếp từ video |
| NO_SHOW sớm hơn cửa sổ vào phòng cho phép | Chỉ xử lý sau scheduledEnd + 60 phút; nhãn UI “Chưa ghi nhận tham gia” |
| Đánh giá được lưu trước buổi hẹn | API chặn trước scheduledStart và khi đang xin đổi lịch; UI ẩn hành động chưa hợp lệ |
| Giờ đề xuất là chuỗi tùy ý, có thể trùng hoặc đã qua | API và UI kiểm tra 2–3 thời điểm ISO-8601 khác nhau, ở tương lai |
| Đổi lịch có thể tạo requestId mới sau lỗi mạng | Giữ requestId theo nội dung; backend trả cùng revision cho retry tương ứng và từ chối payload khác |
| Lịch cũ vẫn có thể dùng khi đơn ra khỏi vòng phỏng vấn | Xác nhận, xin dời, vào phòng kiểm tra lại quyền qua API tracking Application bằng JWT của người tham gia. Đổi lịch phía tuyển dụng kiểm tra lại scheduling context hiện hành |
| Hủy lịch bằng window.prompt; nhiều form dàn trải | Hộp thoại native có lý do, focus/Escape, khóa khi gửi. Workspace tuyển dụng chia danh sách lịch và vùng xử lý; chỉ mở một form chính |
| Chờ tải tuần tự tất cả phiếu đánh giá trước khi hiện trang | Chỉ lấy phiếu đánh giá cũ khi mở xem/sửa; lỗi tải giữ nguyên form và không tạo dữ liệu giả |
| Khung giờ gợi ý cũ xuất hiện khi đổi ngày/thời lượng | Xóa kết quả cũ và bỏ qua phản hồi lỗi thời theo sequence |

## Quy tắc hai phía

| Bước | Nhà tuyển dụng | Ứng viên | Kết quả |
| --- | --- | --- | --- |
| Tạo lời mời | Application phải ở INTERVIEW; chọn vòng, giờ, thời lượng, hình thức, địa điểm nếu trực tiếp | Chờ lời mời | SCHEDULED — Chờ ứng viên xác nhận |
| Chốt lịch | Theo dõi phản hồi | Xác nhận trước giờ bắt đầu | CONFIRMED và confirmedAt |
| Đề nghị đổi | Xem lý do và các khung giờ; có thể chọn giờ khác | Đề xuất 2–3 giờ tương lai, kèm lý do | RESCHEDULE_REQUESTED; chưa phải lịch mới |
| Gửi lịch mới | Tạo revision mới; hủy revision cũ trong cùng transaction | Cần xác nhận lại | Lịch mới SCHEDULED, không kế thừa confirmedAt |
| Xử lý yêu cầu đổi còn tồn đọng | Nếu yêu cầu được gửi trước giờ cũ, có thể xử lý sau giờ cũ với giờ mới ở tương lai | Theo dõi phản hồi | Không mắc kẹt chỉ vì nhà tuyển dụng phản hồi muộn |
| Hủy | Hủy trước giờ hẹn ít nhất 2 giờ và có lý do | Cùng quy tắc | CANCELLED; không rút hoặc kết thúc Application |
| Phòng trực tuyến | Chuẩn bị trong cửa sổ tham gia | Vào trong cửa sổ; nếu chưa xác nhận, nút nói rõ “Xác nhận và vào phòng” | Cửa sổ start−15 phút đến end+60 phút; candidate join ghi nhận tham dự |
| Phỏng vấn trực tiếp | Xác minh tham dự bằng quy trình thực tế và lưu đánh giá sau giờ bắt đầu | Đến đúng địa điểm/giờ | Không tự suy luận vắng mặt từ thiếu dấu vết video |
| Đánh giá | Chấm đủ tiêu chí, nhận xét, chọn kết luận | Chỉ theo dõi trạng thái, không đọc phiếu nội bộ | COMPLETED; gợi ý PASS/FAIL/NEXT_ROUND không tự đổi Application |

## Giao diện

- Ứng viên: thẻ lịch có ngày/giờ, GMT+7, địa điểm/hình thức, lời nhắn, trạng thái và bước tiếp theo; lọc Tất cả/Cần xác nhận/Sắp diễn ra/Lịch sử. Bộ lọc nói rõ chỉ áp dụng trên số lịch đã tải, hỗ trợ tải thêm.
- Nhà tuyển dụng: danh sách các vòng/revision ở trái, vùng tạo/đổi lịch/đánh giá ở phải; trên mobile chuyển một cột. Thêm lý do đổi lịch, mô tả lịch mới cần xác nhận lại, tải thêm lịch cũ và nút làm mới.
- Dùng cùng InterviewSummary, interviewWorkflow và token giao diện hiện có; không thêm UI dependency. Nút không phù hợp được ẩn/khóa, nhưng backend luôn kiểm tra lại.
- Modal dùng dialog native để giữ focus và hỗ trợ Escape; dữ liệu nhập giữ khi API lỗi; không retry mutation mù. Thời điểm khả dụng của các hành động được cập nhật trên UI mỗi 30 giây; không đồng nghĩa polling API.

## Kiểm chứng và giới hạn

- TypeScript và 179 kiểm thử helper/API frontend đạt; các package unit test Go đạt.
- Kiểm thử HTTP + PostgreSQL trên container database riêng: gửi/xác nhận/đề nghị đổi/tạo revision mới; quyền sở hữu; không kế thừa xác nhận; retry; recruiter preparation; candidate attendance; offline không tự NO_SHOW; thời gian ân hạn; chặn feedback quá sớm.
- Playwright: 20 ca của bộ interview-flows trên desktop/mobile đạt; có luồng hai phiên cùng nguồn fixture từ tạo lịch tới xác nhận lại revision mới. Đã xem ảnh thực tế và kiểm tra tràn ngang.
- Build Docker Frontend và Interview Service thành công; hai container đã cập nhật và healthy trên localhost. Smoke bằng tài khoản thử ứng viên/tuyển dụng: đăng nhập 200, cookie HttpOnly, API lịch 200 và màn hình tương ứng tải được. Hai tài khoản này hiện không có lịch; thao tác ghi hai phía được kiểm chứng bằng fixture và PostgreSQL riêng như trên.
- Các thao tác ghi thử dùng fixture/DB riêng. Không tạo lịch giả cho tài khoản người dùng và không gửi email ra ngoài để chụp màn hình.
- Quy tắc tự hủy trước 2 giờ là chính sách hiện có của CareerHub, không phải chuẩn chung cho mọi ATS. Trường hợp sát giờ cần liên hệ trực tiếp; chưa có cấu hình chính sách theo công ty.
- Availability chỉ biết lịch CareerHub; chưa đồng bộ Google/Outlook, chưa có self-scheduling qua lịch cá nhân. Không trình bày khung giờ trống như cam kết ứng viên không có việc riêng.
- Application và Interview là hai dịch vụ: kiểm tra trạng thái hiện hành giúp từ chối thao tác trên lịch không còn hợp lệ, nhưng không phải distributed transaction. Chưa có cơ chế tự đồng loạt CANCELLED mọi lịch khi Application kết thúc; dữ liệu lịch vẫn giữ để đối chiếu.
- Phiếu đánh giá hiện dùng cơ chế cập nhật bản hiện hành, chưa có lịch sử phiên bản nhận xét. Không khẳng định đã chứng nhận WCAG toàn hệ thống; đã dùng labels, focus native, keyboard/Escape và responsive cho các màn thay đổi.
