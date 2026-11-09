# Giao diện khám phá việc làm và doanh nghiệp

## Định hướng và nguồn đối chiếu

Lần thay đổi này thiết kế lại bốn màn hình: tìm việc, danh sách công ty, hồ sơ công ty và chi tiết việc làm. Tham khảo trực tiếp cách TopCV tổ chức [tìm kiếm và bộ lọc](https://www.topcv.vn/tim-viec-lam-moi-nhat), [danh sách công ty](https://www.topcv.vn/cong-ty) và [hồ sơ doanh nghiệp](https://www.topcv.vn/cong-ty/cong-ty-tnhh-thuong-mai-laria-sieu-thi-farmers-market/26294.html). CareerHub tiếp tục dùng nhận diện, component và dữ liệu của hệ thống; không lấy nội dung doanh nghiệp hoặc tài sản thương hiệu TopCV.

## Bố cục và tương tác

- Các route `/candidate/jobs/**` và `/candidate/companies/**` dùng `WorkspaceShell` với `variant="discovery"`. Header vẫn có ba tab của ứng viên; menu công việc cá nhân mở từ nút menu ở cả desktop và mobile. Các trang hồ sơ, CV, ứng tuyển và dashboard giữ bố cục workspace.
- Tìm việc theo hai bước: ban đầu chỉ nhập từ khóa và chọn địa điểm hai cấp tỉnh/thành → xã/phường. Sau khi gửi tìm kiếm cơ bản mới có nút mở bộ lọc nâng cao, đóng mặc định trên mọi kích thước. Bộ lọc đã áp dụng hiển thị thành nhãn có thể bỏ riêng từng mục. Khi áp dụng, focus được chuyển về danh sách để tránh nằm trong panel vừa bị ẩn. Chi tiết danh mục và cách lọc địa chỉ: [location-search.md](location-search.md).
- Thẻ việc làm: nhận diện công ty, vị trí, mức lương, địa điểm, hình thức, kinh nghiệm, kỹ năng và hạn nộp. Nút ứng tuyển dẫn tới khu vực gửi CV trong chi tiết tin thay vì trang lịch sử đơn.
- Danh sách công ty: khu vực tìm kiếm riêng và các thẻ có logo, xác minh, lĩnh vực, quy mô, địa chỉ. Logo lỗi có fallback chữ; không tạo ảnh doanh nghiệp giả.
- Hồ sơ công ty: ảnh bìa từ media công khai nếu có, phần nhận diện và điều hướng nội dung; cột chính có giới thiệu, việc đang tuyển và thư viện; cột phụ có thông tin doanh nghiệp, website, địa chỉ và báo cáo.
- Chi tiết việc làm: tiêu đề và ba thông tin quan trọng ở đầu, CTA ứng tuyển/lưu việc, phần mô tả và form ứng tuyển ở cột chính; công ty và thông tin chung ở cột phụ. Mobile có CTA ứng tuyển cố định và không che nội dung cuối trang.

## Tổ chức code

- `frontend/components/discovery/Discovery.module.css`: style có phạm vi cho các trang khám phá; loại bỏ các selector cũ tương ứng trong CSS toàn cục.
- `frontend/components/discovery/CompanyMark.tsx`: logo, fallback và kích thước nhận diện.
- `frontend/components/discovery/JobResultCard.tsx`: thẻ việc làm dùng chung giữa kết quả tìm kiếm và hồ sơ công ty.
- `frontend/lib/jobPresentation.ts`: định dạng lương, kinh nghiệm và ngày hạn nộp từ dữ liệu hiện có.

Hợp đồng API, cookie HttpOnly, phân quyền, trạng thái tuyển dụng, quy tắc gửi CV và nguồn ứng tuyển không thay đổi. Trang chi tiết việc làm đọc thêm hồ sơ công ty công khai để có logo và thông tin; khi phần thông tin phụ không tải được, nội dung công việc vẫn dùng dữ liệu tin tuyển dụng hiện có.

## Kiểm chứng

- TypeScript: `npm.cmd run typecheck` đạt.
- Production build: `npm.cmd run build` đạt.
- Playwright: tổng cộng 30 ca liên quan đạt trên Chrome desktop 1440×960 và mobile 390×844. Gồm 24 ca với server phát triển và 6 ca bổ sung trên bản build production. Bao gồm danh sách/hồ sơ công ty, rỗng/lỗi/tải lại, công ty không công khai, khách và sai vai trò, lọc/tìm kiếm/xóa nhãn lọc, gửi CV đúng nguồn một lần, điều hướng riêng ba portal, đường đi từ trang chủ, hiển thị tiền tệ và hợp đồng tìm kiếm/gợi ý.
- Đã đọc ảnh chụp bốn màn hình ở desktop và mobile, kiểm tra tràn ngang bằng trình duyệt.
- Dùng API giả lập trong E2E; kết quả này không xác nhận trạng thái các dịch vụ thật hoặc giao diện trên prod.
- Bộ ảnh cục bộ: `frontend/.cache/ui-review/index.html` (không đưa vào Git).

Không tạo commit hoặc triển khai prod trong lần thay đổi này.
