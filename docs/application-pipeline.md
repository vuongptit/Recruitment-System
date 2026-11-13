# Quy trình ứng tuyển và tuyển dụng thống nhất

## Căn cứ và phạm vi

Tham khảo tài liệu chính thức TopCV ngày 13/11/2026:

- [Nguồn và các trạng thái hồ sơ](https://tuyendung.topcv.vn/help/dinh-nghia/nguon-va-cac-trang-thai-ho-so/): tiếp nhận, phù hợp, hẹn phỏng vấn, đề nghị, nhận việc; chưa phù hợp là nhánh kết thúc.
- [Quy trình ứng tuyển](https://faq.topcv.vn/faqs/find-job-and-apply/quy-trinh-ung-tuyen-tren-topcv.html): CV đã gửi không thu hồi. Người dùng đã chọn áp dụng quy tắc này cho CareerHub.

CareerHub sử dụng trạng thái hiện có, không sao chép các giới hạn số lần ứng tuyển/gửi lại của TopCV. Giữ quy tắc chống trùng và cooldown sau từ chối đang có của Application Service. Không thêm giao dịch sửa hoặc thay CV đã nộp trong thay đổi này.

## Nguồn dữ liệu và quyền chuyển bước

Hai portal đọc cùng Application Service. Thanh tiến trình biểu diễn giai đoạn xét tuyển; lịch sử hiển thị các sự kiện backend đã lưu, mới nhất trước, theo GMT+7. Mở CV/chi tiết không tự chuyển sang “đã xem” hoặc xem xét; AI không tự duyệt hồ sơ.

| Trạng thái | Ý nghĩa chung | Nhà tuyển dụng | Ứng viên |
| --- | --- | --- | --- |
| APPLIED | Hồ sơ đã gửi | Xem CV; bắt đầu xem xét; từ chối có lý do | Theo dõi hồ sơ |
| REVIEWING | Đang xem xét | Đánh giá; chuyển vòng phỏng vấn; từ chối | Theo dõi cập nhật |
| INTERVIEW | Đã vào vòng phỏng vấn | Đặt/quản lý lịch; đánh giá; gửi thư mời; từ chối | Kiểm tra/phản hồi lịch hẹn |
| OFFER | Đã gửi thư mời | Xem thư mời và phản hồi; thu hồi bằng thao tác từ chối hồ sơ | Chấp nhận/từ chối thư mời còn hiệu lực |
| HIRED | Đã chấp nhận thư mời (“Đã nhận việc” trong pipeline) | Xem lại kết quả và liên hệ | Xem lại kết quả và liên hệ |
| REJECTED | Kết thúc không tuyển | Xem lịch sử | Xem lịch sử |
| WITHDRAWN | Đã rút theo quy trình cũ | Chỉ xem lịch sử | Chỉ xem lịch sử |

Không cho kéo thả hoặc nhảy thẳng đến kết quả tuyển dụng. Chấp nhận thư mời là nguồn duy nhất chuyển `OFFER → HIRED`. Ứng viên từ chối thư mời tạo `DECLINED` và `REJECTED` trong cùng giao dịch. Nhãn nhận việc không xác nhận ứng viên đã đi làm ngày đầu; ngày bắt đầu là thông tin riêng trong thư mời.

## Phỏng vấn và thư mời là các đối tượng riêng

`INTERVIEW` không đồng nghĩa đã có lịch hẹn. Chuyển vào vòng trước, sau đó tạo lịch; trạng thái lịch hẹn/phòng họp và đánh giá vẫn do Interview Service quản lý. Application Service, Interview Service và frontend cùng yêu cầu `INTERVIEW` khi đặt lịch hoặc xem khung giờ trống. Lịch cũ và lịch sử vẫn đọc được theo quyền hiện hành.

`OFFER` không đồng nghĩa thư mời còn chờ phản hồi. SENT/ACCEPTED/DECLINED/EXPIRED/CANCELLED và hạn phản hồi thuộc Offer. Khi thư mời hết hạn, ứng viên không thể phản hồi; Application vẫn ở OFFER theo cơ chế hiện có, nhà tuyển dụng quyết định kết thúc hồ sơ. Không tự báo bị từ chối hoặc đã nhận việc từ ngày hết hạn. Màn chi tiết và trang thư mời nhà tuyển dụng đọc trạng thái Offer thật.

## Không rút sau khi gửi

Giao diện chỉ đưa các hồ sơ WITHDRAWN trước đây vào bộ lọc “Lịch sử cũ” riêng; nhãn là “Đã rút trước đây”. Đây không phải một bước hoặc một thao tác của pipeline đang dùng.

Frontend thông báo quy tắc trước khi gửi và không cung cấp lệnh rút. `PATCH /applications/{id}/withdraw` được giữ cho client cũ: kiểm tra quyền sở hữu và version, sau đó trả HTTP 409 `APPLICATION_NOT_WITHDRAWABLE`. Không sửa Application, Offer, history, outbox. Không xóa hoặc đổi trạng thái dữ liệu WITHDRAWN cũ; không cần migration.

## Giao diện và đồng bộ

- `/candidate/applications`: lọc theo bước, đếm từ toàn bộ danh sách cá nhân được API trả về, tìm theo công việc/công ty và mở lịch sử.
- `/recruiter/applications` và pipeline trong chi tiết tin: chọn bước gọi bộ lọc backend, giữ phân trang và chống lệch trang. Tổng số là tổng backend theo bộ lọc, không lấy số card trên một trang làm số lượng cả công ty.
- Hai trang `/candidate/applications/:id` và `/recruiter/applications/:id`: thanh tiến trình, hướng dẫn theo vai trò, lịch sử cùng nguồn; thiếu lịch sử không tự dựng thời điểm hay vòng đã đi qua.
- `/recruiter/applications/:id/offer`: soạn khi INTERVIEW; có offerId thì xem thư mời đã gửi, không mở lại form gửi trùng.
- Nút làm mới lấy lại dữ liệu; mở chi tiết đọc trạng thái hiện hành. Đây không phải cập nhật realtime qua socket. Không suy đoán trạng thái mới khi API lỗi.

Mọi mutation giữ expectedVersion/expectedApplicationVersion/expectedOfferVersion và phân quyền backend. Xung đột yêu cầu đối soát, giữ lý do đã nhập và không tự gửi lại. Lý do từ chối nằm trong lịch sử hai phía, vì vậy form nói rõ trước khi lưu. Các ghi chú đánh giá nội bộ vẫn thuộc giao diện nhà tuyển dụng.

## Kiểm chứng

- TypeScript, API/helper tests, build frontend.
- Unit test quy tắc không rút cho toàn bộ enum; quyền sở hữu, version và quyền đặt lịch.
- PostgreSQL Testcontainers: không rút không ghi dữ liệu; giữ kiểm thử rollback, từ chối/thu hồi và race với phản hồi offer. Database kiểm thử độc lập với local/prod.
- Playwright desktop/mobile: hai phiên riêng cùng nguồn fixture, xem xét → phỏng vấn → gửi thư mời → chấp nhận; lọc theo backend; giữ lý do khi conflict; không tràn ngang.
- Fixture trình duyệt không thay thế bằng chứng tích hợp dịch vụ thật. Không sửa dữ liệu tuyển dụng đang dùng chỉ để lấy ảnh.

### Kết quả ngày 13/11/2026

- TypeScript và production build frontend: đạt; 170 kiểm thử helper/API đạt.
- Unit test Application Service liên quan pipeline, quyền đặt lịch, controller và offer: đạt.
- 41 kiểm thử PostgreSQL thuộc ApplicationPipelinePostgresIT (17), ApplicationOfferPostgresIT (15), ApplicationOfferExpiryPostgresIT (9): đạt, dùng Testcontainers riêng.
- Go: hai package internal/client và internal/service đạt.
- Playwright: luồng hai phiên, lọc/xung đột và các ca hồi quy liên quan đạt trên desktop/mobile (18 ca tổng cộng qua các lượt chạy theo phạm vi).
- Đã xem ảnh desktop/mobile; kiểm tra không tràn ngang. Không khẳng định đã chứng nhận toàn bộ WCAG.
- Đã build và cập nhật Docker local cho frontend, application-service, interview-service; cả ba healthy.
- Đăng nhập qua cookie HttpOnly, đọc API thật và mở danh sách/chi tiết trên localhost đạt cho hai vai trò. Tài khoản ứng viên kiểm tra hiện chưa có đơn; tài khoản tuyển dụng kiểm tra có một đơn lịch sử đã rút. Không biến dữ liệu này thành một luồng tuyển dụng mới để kiểm thử.
- Toàn bộ chuyển bước trên trình duyệt sử dụng fixture; giao dịch thực được kiểm tra riêng trên PostgreSQL Testcontainers. Chưa thực hiện giao dịch tuyển dụng mới với tài khoản người dùng, chưa deploy prod và không tạo commit.
