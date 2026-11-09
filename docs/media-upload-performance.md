# Tối ưu tải và cập nhật tệp

Áp dụng cho avatar, CV PDF/CV trực tuyến và phương tiện công ty đang được kết nối trong frontend. Không thay đổi API contract hoặc giới hạn của Media Service; PDF và MP4 giữ nguyên byte nguồn.

## Ảnh trước khi tải lên

`frontend/lib/avatarImage.ts` xử lý trên trình duyệt, giữ tỷ lệ và nền trong suốt. Ảnh nhỏ phù hợp được giữ nguyên; ảnh cần tối ưu được mã hóa WebP. Tên tệp sau xử lý được gửi khi xin chữ ký để khớp chính xác định dạng backend yêu cầu.

| Mục đích | Cạnh dài tối đa ban đầu | Dung lượng mục tiêu | Giới hạn Media giữ nguyên |
| --- | ---: | ---: | ---: |
| Avatar | 768 px | 128 KiB | 2 MiB |
| Logo công ty | 768 px | 192 KiB | 2 MiB |
| Ảnh công ty | 1920 px | 512 KiB | 5 MiB |

Ảnh nguồn tối đa 20 MiB và 25 triệu điểm ảnh. Nếu chưa đạt dung lượng mục tiêu, trình duyệt thử thêm hai kích thước nhỏ hơn. Mục tiêu dung lượng không phải cam kết cho mọi ảnh; kết quả cuối phải đạt giới hạn Media. Nếu WebP không được hỗ trợ, dùng định dạng encoder thực sự trả về và tên tệp tương ứng. Tệp gốc trên máy không bị sửa.

## Tránh làm lại công việc đã thành công

- Tải phương tiện công ty chỉ cần bấm **Tải lên và lưu**. Các bước tối ưu → ký → gửi → xác nhận → gắn hồ sơ chạy lần lượt; chỉ báo thành công sau bước cuối.
- Avatar/CV/phương tiện công ty giữ checkpoint trong bộ nhớ trang. Lỗi xác nhận không gửi lại tệp đã nhận được phản hồi upload thành công; lỗi lưu không xác nhận hoặc upload lại khi đã có kết quả tương ứng.
- Checkpoint không lưu vào localStorage/sessionStorage. Chọn tệp khác hoặc rời trang kết thúc phiên xử lý hiện tại. Không tự lặp thao tác ghi khi kết quả chưa xác định.
- CV Builder tái sử dụng PDF khi nội dung/mẫu không đổi giữa xem trước, tải xuống và lưu. Đổi tên khi thử lưu lại không tạo PDF hoặc upload lại. Nội dung/mẫu đổi sẽ tạo bản PDF mới.
- Tiến trình hiển thị bước đang chạy, không giả lập phần trăm byte truyền. Upload ngoài có timeout riêng, giữ credentials=omit và redirect=error.

## Xác nhận Cloudinary

Media đọc metadata canonical và quét sibling assets trên cả image/video/raw song song. Tất cả kiểm tra vẫn phải đạt; giữ nguyên ownership, format, kích thước, context, private delivery, version/fencing và cleanup.

Đối với RAW, chỉ lấy tối đa 8 KiB để kiểm tra magic bytes và hủy phần body còn lại, kể cả khi nhà cung cấp bỏ qua Range.

## Kiểm chứng local ngày 09/11/2026

- TypeScript và 160 kiểm tra API frontend đạt.
- 27 unit test Media đạt trong container Node 24 không có mạng, gồm chạy kiểm tra song song và hủy body tài liệu còn dư.
- 16 kiểm tra trình duyệt desktop/mobile đạt: avatar, CV, CV Builder, logo nền trong suốt, video giữ nguyên byte, thử lại sau lỗi xác nhận/lưu và chỉnh sửa công ty. Các thao tác ghi dùng API/provider giả lập.
- Ảnh PNG người dùng cung cấp: 6.061.736 byte nguồn → 17.852 byte WebP, 576×768; bản xử lý PNG trước đó là 1.192.811 byte. Kiểm tra này không ghi vào tài khoản thật.
- Đo đọc Cloudinary thật trên asset có sẵn: xác nhận metadata/siblings từ 1.361 ms trước tối ưu xuống 874 ms sau tối ưu trong hai lần đo tương ứng. Đây là số đo tham khảo, phụ thuộc mạng và phản hồi Cloudinary, không phải cam kết SLA hoặc thời gian toàn bộ upload.

Video lớn vẫn phụ thuộc băng thông upload; không nén video hoặc sửa nội dung tài liệu trên trình duyệt. Các vị trí chưa tích hợp upload thật như Offer attachment không được mở thêm chức năng trong thay đổi này.
