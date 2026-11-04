# Giao diện quản trị CareerHub

Phạm vi: `/admin`, người dùng, công ty, tin tuyển dụng, báo cáo, nhật ký và khung thông báo quản trị. API, HttpOnly cookie và kiểm tra vai trò `ADMIN` được giữ nguyên.

## Hướng thiết kế

Tham khảo trực tiếp các nguồn chính thức ngày 04/11/2026:

- [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md): thiết kế theo công việc thực tế, phân cấp nội dung, dùng chuyển động có mục đích, kiểm tra bằng ảnh chụp.
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) và [Web Interface Guidelines](https://vercel.com/design/guidelines): ngữ nghĩa HTML, bàn phím, focus, trạng thái lỗi, biểu mẫu và bố cục thích ứng.

Không thêm thư viện giao diện, thư viện biểu đồ hoặc font tải từ dịch vụ ngoài.

Trang đăng nhập admin dùng cùng nền sáng, màu xanh chính, logo xanh và khối giới thiệu nền tối như thanh điều hướng quản trị. Biến thể màu chỉ áp dụng cho `data-auth-frame="admin"`, gồm nút đăng nhập, checkbox, liên kết, trạng thái hover/focus và lưu ý tài khoản.

Lựa chọn “Hôm nay” dùng GMT+7 từ 00:00 đến thời điểm làm mới, đọc sự kiện đã ghi nhận và có biểu đồ theo giờ. Phần so sánh dùng cùng thời điểm hôm qua. Nhãn “chưa chốt” phân biệt số trong ngày với các kỳ UTC đã hoàn tất; thời điểm cập nhật hiển thị rõ. CSV/XLSX hôm nay dùng API xuất riêng và ghi múi giờ cùng thời điểm quan sát, không gọi nhầm báo cáo ngày UTC.

| Thành phần | Quy ước |
| --- | --- |
| Điều hướng | Nền `#17273f`, mục chọn `#3158b5`, chỉ liên kết trong cổng admin |
| Nội dung | Nền `#f4f6fa`, bề mặt trắng, đường phân cách `#e1e7f0` |
| Chữ | Segoe UI/system font hỗ trợ tiếng Việt, tiêu đề 24–30px, số liệu dùng tabular numerals |
| Bảng | Cột trạng thái và thao tác cố định về ý nghĩa; cuộn ngang bên trong bảng trên mobile |
| Màu trạng thái | Chữ kèm màu; xanh cho đã xác minh/mở, vàng cho chờ xử lý, đỏ cho khóa/từ chối |
| Hộp thoại | Native dialog; Escape, giữ focus trong hộp, trả focus về nút mở, khóa đóng khi đang gửi |

Trang tổng quan chia thành ba phần: hiện trạng toàn hệ thống, hàng đợi cần xử lý và hoạt động tuyển dụng. Hiện trạng không đổi theo bộ lọc; hàng đợi dẫn trực tiếp đến màn hình xử lý. Hoạt động mặc định 30 ngày UTC đã hoàn tất, có 7 ngày, tháng này, tất cả dữ liệu ghi nhận và khoảng tùy chỉnh. Các kỳ hữu hạn được so với kỳ trước cùng số ngày; kỳ trước bằng 0 không tạo phần trăm vô hạn. Chỉ hiển thị dữ liệu từ API; nguồn lỗi hiện dấu “—”, danh sách tin chờ duyệt chạm giới hạn API hiện “50+”.

## Cấu trúc

- `frontend/app/admin/admin.css`: kiểu riêng cho admin; không thay token toàn cục của ứng viên/nhà tuyển dụng.
- `AdminWorkspace.tsx`: tải danh sách, bộ lọc, phân trang và điều phối thao tác kiểm duyệt.
- `components/admin/AdminDashboard.tsx`: tải riêng hiện trạng và hoạt động; bộ lọc thời gian trong URL và xuất báo cáo hữu hạn.
- `components/admin/AdminSnapshot.tsx`: số tổng hiện tại và các hàng đợi xử lý.
- `components/admin/AdminDataTable.tsx`: bảng và hồ sơ chi tiết cho từng loại dữ liệu.
- `components/admin/AdminOverview.tsx`: chỉ số, biểu đồ SVG, bảng dữ liệu hỗ trợ và phễu.
- `components/admin/AdminDialog.tsx`: hộp thoại có quản lý focus.
- `components/admin/useAdminFilters.ts`: đọc/ghi bộ lọc trong URL, khôi phục sau reload và Back/Forward.

Lý do xử lý được nhập trong hộp xác nhận gắn với một đối tượng. Không gửi PATCH trước khi xác nhận; lỗi API giữ nguyên lý do để thử lại. Báo cáo giữ `expectedVersion`; thao tác khóa qua báo cáo chỉ được bật với đối tượng `USER`. Không cho khóa đối tượng tài khoản có vai trò `ADMIN` từ màn hình người dùng.

Tin chờ duyệt được API trả về toàn bộ; frontend chia trang 20 tin. Các danh sách còn lại dùng phân trang của backend. Đổi trang/bộ lọc hủy request cũ; nếu trang cuối hết bản ghi thì quay về trang hợp lệ.

Thời gian nhật ký là GMT+7. Ngày thống kê vẫn dùng UTC theo hợp đồng hiện tại của backend và có chú thích rõ; không tự đổi ngày của dữ liệu tổng hợp sang ngày Việt Nam.

Tổng tài khoản bao gồm mọi vai trò và trạng thái. Tài khoản ứng viên/nhà tuyển dụng lấy theo vai trò trong Auth. Công ty đã xác minh lấy theo trạng thái VERIFIED. Tin đang hiển thị lấy tổng kết quả đáp ứng điều kiện của Job Search, khác số tin từng đăng trong lịch sử. Các mốc phỏng vấn/đề nghị/tuyển thành công là số hồ sơ đạt mốc, không phải số người duy nhất.

Hoạt động dùng dữ liệu sự kiện đã ghi nhận; không giả định lịch sử trước khi đồng bộ đã đầy đủ. “Tất cả” có biểu đồ theo tháng, không so với kỳ trước. Nếu còn ngày chờ tổng hợp, backend tính trực tiếp các lần xuất hiện đầu tiên từ sự kiện gốc cho cả tổng, biểu đồ và file xuất; giao diện ghi rõ nguồn này. Chỉ điền ngày không có hoạt động bằng 0 khi đã có nguồn dữ liệu đầy đủ cho kỳ. Khoảng tùy chỉnh vẫn giới hạn 366 ngày chênh lệch; báo cáo Tất cả xuất theo tháng và có giới hạn riêng để tránh quá tải.

## Báo cáo đầy đủ

Nút Excel/CSV gọi `/api/admin/stats/report`, truyền kỳ đang xem; không gọi nhầm API raw cũ. Khi xuất, backend lấy lại cả hoạt động và hiện trạng. Excel có 5 sheet Tổng quan, Hiện trạng, Phễu tuyển dụng, Chi tiết và Hướng dẫn. Bảng chi tiết đặt 5 chỉ số cạnh nhau, thêm các mốc 0 và dòng tổng công thức đã tính sẵn; tiêu đề có bộ lọc, cố định khi cuộn, định dạng số/ngày/phần trăm và thiết lập in.

CSV dùng UTF-8 BOM, nhãn tiếng Việt, bộ 10 cột thống nhất và nhóm số liệu để lọc. Gồm hiện trạng, hàng đợi, tổng hoạt động, phễu và chi tiết; ghi rõ múi giờ, thời điểm cập nhật, so sánh và tình trạng nguồn. Dấu “—” không phải 0, “50+” là số tối thiểu. Kỳ trước bằng 0 không tạo tỷ lệ vô hạn. File Hôm nay giữ GMT+7, dữ liệu tạm tính và kỳ so sánh cùng thời điểm hôm qua. Dữ liệu file có thể mới hơn trang đang mở.

Ngày 04/11/2026 đã xác nhận 43 kiểm thử đơn vị, 9 kiểm thử PostgreSQL và 6 lượt kiểm thử tải báo cáo desktop/mobile đạt. Đã tải 6 file Excel/CSV thật cho 30 ngày, Hôm nay và Tất cả; đối chiếu tổng sheet/công thức/CSV với API, kiểm tra UTF-8 và số cột nhất quán. Artifact mẫu ở `.cache/admin-report-20261104/`, trong đó `careerhub-30d.xlsx` và `careerhub-30d.csv` là báo cáo tải thật từ Docker local. API chặn người chưa đăng nhập. Không thay đổi dữ liệu nghiệp vụ hoặc tạo commit.

Nhật ký trên giao diện ẩn bản ghi `STARTED`, vẫn giữ các kết quả khác và không sửa/xóa lịch sử trong database. Số lượng hiển thị tính theo các dòng nhìn thấy. Phân trang vẫn dựa trên trang dữ liệu từ API để không mất khả năng xem các kết quả ở trang tiếp theo.

## Kiểm tra

```powershell
cd frontend
npm.cmd run typecheck
npx.cmd playwright test tests/e2e/admin-workspace.spec.ts tests/e2e/workspace-consistency.spec.ts tests/e2e/person1-flows.spec.ts --grep 'admin|ADMIN|statistics|moderation|details close|reports preserve'
```

Kiểm thử thao tác duyệt/khóa dùng API giả lập, chặn các endpoint chưa khai báo để không thay đổi database thật. Kiểm tra trình duyệt với backend Docker local chỉ đăng nhập, xem dữ liệu và đăng xuất.

Build cập nhật riêng frontend local:

```powershell
docker compose up -d --build --no-deps frontend
```

Kết quả ngày 04/11/2026: typecheck đạt; 24 kiểm thử trình duyệt desktop/mobile đạt; Docker production build đạt (First Load JS các trang quản lý: 121 kB). Đã cập nhật container frontend local và mở lại 7 trang quản trị bằng backend thật, không ghi nhận lỗi JavaScript/API hoặc tràn ngang toàn trang. Các thao tác thay đổi dữ liệu chỉ được kiểm thử qua API giả lập.

Lần chuẩn hóa tổng quan tiếp theo ngày 04/11/2026: 32 kiểm thử đơn vị và 8 kiểm thử PostgreSQL đạt; 22 kiểm thử giao diện admin đạt và 4 lượt kiểm tra tập trung vào số liệu tổng hợp trễ/CSV đạt. Đã build lại `admin-service` và `frontend`, đối chiếu số tài khoản với API thư mục Auth, kiểm tra các kỳ 7 ngày/30 ngày/tháng này/tất cả, đối chiếu tổng APPLIED giữa tổng quan/phễu/CSV, và xác nhận Candidate nhận 403 khi gọi API hiện trạng. Ảnh và kết quả API ở `.cache/admin-dashboard-20261104/`. Không thay đổi schema hay xóa dữ liệu, không tạo commit, không triển khai prod.

Bổ sung Hôm nay: 37 kiểm thử đơn vị, 9 kiểm thử PostgreSQL và 6 lượt kiểm thử giao diện desktop/mobile đạt. Đã xác minh API thật trả mốc 00:00 GMT+7, so sánh đúng khoảng giờ hôm qua, tổng theo giờ khớp chỉ số và phễu; CSV/XLSX xuất thành công. Hai container local healthy. Ảnh và kết quả ở `.cache/admin-today-20261104/`.

Nhật ký hoạt động: tên thao tác lấy từ `action`, lý do nằm ở dòng ghi chú riêng. Cột đối tượng ưu tiên email và vai trò tài khoản, tên công ty hoặc tiêu đề tin do API bổ sung; không hiển thị UUID trong bảng. Nếu chưa lấy được danh tính, giao diện báo rõ thay vì suy đoán. Hộp chi tiết ghi rõ tên/email là thông tin hiện tại; mã gốc nằm trong mục thu gọn “Thông tin đối soát”. Lịch sử và ID gốc được giữ nguyên.

Xác minh nhật ký ngày 04/11/2026: kiểm thử đơn vị Auth/Admin và PostgreSQL đạt; kiểm thử trình duyệt cho nhãn đối tượng, tên thao tác, thông tin đối soát và dữ liệu chưa tra cứu được đạt trên desktop/mobile. Đã build lại ba container Auth/Admin/frontend local và đọc lịch sử thật: bốn dòng khóa/mở khóa đều có email đối tượng và người thực hiện, tên tin/công ty hiển thị đúng, không có lỗi JavaScript hay tràn ngang toàn trang. Ảnh và kết quả ở `.cache/audit-identity-20261104/`; không thay đổi trạng thái tài khoản để thử, không sửa/xóa nhật ký.

Ảnh trước/sau và kết quả chạy local nằm trong thư mục bỏ qua Git `.cache/admin-ui-20261104/`, kết quả cuối ở `final-live-results.json`. Thay đổi này không triển khai lên prod và không tạo commit tự động.
