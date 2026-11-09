# Tìm việc theo địa điểm và tìm kiếm hai bước

## Giao diện

1. Trang chủ và đầu trang tìm việc chỉ có một ô nhập từ khóa, bộ chọn địa điểm và nút tìm kiếm.
2. Bộ chọn địa điểm có hai cột: tỉnh/thành phố → xã/phường/đặc khu trực thuộc. Có tìm kiếm không dấu, chọn toàn quốc, chọn tất cả xã/phường và bỏ chọn. Đổi tỉnh xóa xã/phường cũ; Escape đóng mà không áp dụng bản nháp.
3. Sau khi gửi tìm kiếm cơ bản mới hiện nút **Bộ lọc nâng cao**, đóng mặc định trên cả desktop và mobile. Các tùy chọn hình thức làm việc, lương, kỹ năng, kinh nghiệm, sắp xếp và cách hiển thị ở bên trong.
4. Khi sửa từ khóa/địa điểm, phần nâng cao đóng; cần gửi tìm kiếm cơ bản mới trước khi mở lại. Một tìm kiếm cơ bản mới xóa các điều kiện nâng cao cũ.
5. Tìm từ trang chủ chuyển cả từ khóa và địa điểm sang `/candidate/jobs`; `search=1` thể hiện đã gửi bước cơ bản kể cả khi tìm toàn quốc không có từ khóa.

## Danh mục địa điểm

- Nguồn: [VietnamProvinces / Province Open API v2](https://provinces.open-api.vn/api/v2/redoc), danh mục hai cấp sau sáp nhập tháng 7/2025.
- Snapshot hiện có: 34 tỉnh/thành, 3.321 xã/phường/đặc khu. Nguồn và thời điểm tải ở `frontend/lib/locations/source.json`.
- Chỉ danh sách tỉnh được đưa vào bundle. Danh sách xã/phường ở `frontend/public/data/vietnam-wards/{provinceCode}.json`, tải khi mở tỉnh tương ứng; có hủy request cũ, cache trong bộ nhớ, trạng thái lỗi và thử lại.
- Trình duyệt đọc file tĩnh cùng ứng dụng, không phụ thuộc API ngoài lúc sử dụng.
- Cập nhật từ thư mục `frontend/`: `node scripts/sync-vietnam-locations.mjs`. Script kiểm tra cấu trúc, mã trùng và quan hệ tỉnh trước khi ghi dữ liệu.

## Hợp đồng tìm kiếm hiện có

Backend vẫn nhận `location` là chuỗi, không phải mã hành chính:

- Toàn quốc: bỏ trường `location`.
- Tỉnh/thành: tên ngắn, ví dụ `Hà Nội`.
- Xã/phường: địa chỉ ghép, ví dụ `Phường Ba Đình, Hà Nội`.

Job Search hiện dùng `match_phrase` trên Elasticsearch và `contains` không phân biệt hoa/thường ở PostgreSQL. Vì vậy lọc xã/phường cần tin đã cập nhật chuỗi địa chỉ tương ứng; tin chỉ ghi tỉnh/thành sẽ xuất hiện khi tìm cả tỉnh, không được tự gán vào một xã/phường. Lần thay đổi này không chuyển đổi địa chỉ cũ hoặc suy đoán vị trí của tin.

## Kiểm tra

- TypeScript và 160 kiểm tra helper/API đạt.
- 10 ca E2E desktop/mobile đạt: thứ tự hai bước, chọn tỉnh/xã, đổi tỉnh, retry danh mục lỗi, Escape/focus, bộ lọc nâng cao, dữ liệu từ trang chủ và điều hướng tìm kiếm.
- Ảnh và kiểm tra trên container local được lưu trong `frontend/.cache/ui-review/`.
- Đã build và khởi động lại riêng container `frontend`; container healthy ở `http://localhost:3000`. Kiểm tra trình duyệt với backend local thật trên desktop/mobile cho kết quả tìm Hà Nội HTTP 200, 14 tin tại thời điểm kiểm tra; các danh sách xã/phường được phục vụ từ container mới.
