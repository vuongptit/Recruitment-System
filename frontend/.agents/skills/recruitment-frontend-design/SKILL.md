---
name: recruitment-frontend-design
description: Thiết kế, triển khai và review frontend CareerHub trong repo Recruitment System, gồm giao diện ứng viên, nhà tuyển dụng và quản trị viên. Dùng khi sửa trang, layout, điều hướng, form, trải nghiệm tương tác, tích hợp API hoặc hiệu năng frontend; bám Figma và hợp đồng nghiệp vụ tuyển dụng hiện có.
---

# CareerHub frontend design

Tạo giao diện tuyển dụng rõ ràng, đáng tin cậy và nhanh: ứng viên tìm cơ hội và quản lý hồ sơ; nhà tuyển dụng quản lý công ty và tuyển người; quản trị viên vận hành hệ thống. Chất lượng nằm ở nội dung, phân cấp và thao tác chính xác, không ở trang trí.

Các đường dẫn code bên dưới tính từ `frontend/`; liên kết tài liệu tính từ file skill này. Chỉ đọc phần liên quan nhiệm vụ.

## Bắt đầu từ repo và yêu cầu

1. Xác định vai trò, trang bắt đầu, việc người dùng cần hoàn thành và trạng thái dữ liệu ảnh hưởng đến thao tác. Đọc page/layout, shell, adapter và helper nghiệp vụ đang dùng.
2. Khi đổi luồng hoặc hiển thị dữ liệu, đọc [quy tắc nghiệp vụ](references/recruitment-flows.md) ở mục tương ứng. Khi sửa API/đăng nhập, đọc [quy ước route](../../../../docs/frontend-routing.md). Khi sửa Admin, tham khảo [giao diện Admin](../../../../docs/admin-ui.md).
3. Nếu có frame Figma/prototype được người dùng chỉ định, dùng nó làm chuẩn bố cục, khoảng cách, màu, nội dung và trạng thái. Assets import nằm ở `public/figma/`. Chỉ khẳng định đã đối chiếu phiên bản mới khi thực sự truy cập được; nếu thiếu quyền thì nêu giới hạn và tiếp tục phần có đủ căn cứ. Không coi ảnh import cũ là bằng chứng thiết kế mới nhất.
4. Với sửa nhỏ, giữ phong cách hiện tại. Với trang mới hoặc thiết kế lại, chốt ngắn gọn bố cục, token tái sử dụng, CTA chính và các trạng thái trước khi viết code; không biến bước này thành yêu cầu xác nhận thường lệ.

## Kiến trúc để tái sử dụng

- Stack hiện tại: Next.js 14 App Router, React 18, TypeScript strict, CSS/CSS Modules, `lucide-react` và các primitive Radix đã có trong `package.json`. Dùng khả năng đang cài; không giả định có Tailwind hoặc thêm bộ UI khác chỉ để làm một trang.
- Routes/layout ở `app/`; component ở `components/`; API adapter, type và helper nghiệp vụ ở `lib/`. Ưu tiên Server Component cho nội dung tĩnh; chỉ đặt `"use client"` ở ranh giới cần state, event hoặc browser API. Không chuyển cả layout sang client chỉ vì một widget.
- Tái sử dụng `PublicShell`, `CandidateWorkspace`, `RecruiterShell`, `AdminShell`, `WorkspaceShell`, `AccountNavigation`, `AuthFrame` và primitive trong `components/ui.tsx`. Không tạo header/sidebar thứ hai khi shell cha đã cung cấp.
- Dùng `lib/portalRoutes.ts` cho điều hướng theo vai trò. Phân biệt trang giới thiệu (`portalEntry`) với trang tổng quan sau đăng nhập (`portalHome`); không thay thế hai khái niệm cho nhau.
- Dùng adapter hiện hành (`person1Api`, `person2Api`, `chatApi`, `interviewApi`, v.v.) và `requestApi`/`API_PATHS`; giữ một nơi định nghĩa type, trạng thái và quy tắc chuyển bước. Backend vẫn phải kiểm tra quyền; ẩn nút không thay thế phân quyền.

## Nhận diện CareerHub

`app/layout.tsx` nạp `globals.css` rồi `portal.css`; token sau có thể ghi đè token trước. Kiểm tra CSS thực tế và phạm vi selector trước khi đổi màu.

| Phạm vi | Nguồn hiện tại | Hướng thiết kế |
| --- | --- | --- |
| Công khai, ứng viên, nhà tuyển dụng | `app/portal.css` | Xanh `--primary: #087f46`, nền `#f5f7f6`, mặt trắng, chữ `#1d3028`, đường viền nhẹ `#e2e9e5` |
| Quản trị | `app/admin/admin.css`, scope `[data-portal="admin"]` | Xanh lam `#3158b5`, sidebar `#17273f`, nền `#f4f6fa`, chữ `#202c40` |
| Đăng nhập/đăng ký | `components/AuthFrame.module.css` | Theo portal; đăng nhập Admin đồng bộ màu với trang quản trị |

- Dùng CSS variable hiện có, thêm token trong phạm vi portal/component nếu cần. Không ghi đè toàn cục để sửa riêng một trang. Các màu trên mô tả hiện trạng, không ngăn yêu cầu đổi thiết kế có chủ đích.
- Dùng font `--font-sans` đang có, hỗ trợ tiếng Việt đầy đủ; không tải web font ngoài chỉ để tạo khác biệt. Tăng phân cấp bằng cỡ chữ, độ đậm, khoảng cách; ưu tiên cỡ chữ dễ đọc cho bảng và chú thích.
- Trang tìm việc ưu tiên ô tìm kiếm, bộ lọc và tin phù hợp; trang công ty ưu tiên nhận diện, thông tin xác minh và tin đang tuyển; workspace ưu tiên công việc tiếp theo; Admin ưu tiên số liệu, hàng chờ và đối soát. Không ép mọi trang vào một hero hoặc lưới card giống nhau.
- Tiết chế gradient, shadow, animation, nhãn chữ hoa, icon và chữ trang trí. Bản Figma được chỉ định có các chi tiết này thì bám đúng mục đích của thiết kế. Dùng logo CareerHub và hệ icon hiện có, không thay bằng emoji hoặc tự tạo logo mới.
- Motion chủ yếu phản hồi thao tác mở, đóng, lưu, chọn; tôn trọng `prefers-reduced-motion`. Không thêm animation liên tục hoặc tải thư viện animation cho hiệu ứng đơn giản.

## API, phiên và dữ liệu

- Link/router dùng route giao diện; request dữ liệu first-party dùng `/api/...` trên cùng origin, kể cả SSR. Không hardcode `localhost`, domain prod hoặc port service vào component, không tạo `/api/api`.
- Giữ ngoại lệ OAuth canonical trong `next.config.mjs` và tài liệu route: URL bắt đầu Google, callback và exchange có cookie binder theo path. Không tự thêm `/api` vào chúng. URL upload/download ký sẵn từ dịch vụ ngoài cũng không phải route giao diện hay API first-party.
- Tái sử dụng `ApiSessionBoundary`, `authSession`, `useCurrentAccount` và `SessionGate`. Phân biệt `undefined` (đang xác định), `null` (chưa đăng nhập), account hợp lệ. Tránh chớp menu sai vai trò, tải dữ liệu riêng tư trước khi xác định phiên hoặc điều hướng sớm gây mất phiên.
- Access/refresh token thuộc cơ chế cookie HttpOnly và proxy hiện có. Không chuyển token sang localStorage, sessionStorage, URL hoặc props render ra HTML; không tạo cơ chế login/refresh song song.
- Thực thi thay đổi dữ liệu theo response backend: khóa nút khi pending, tránh gửi trùng, giữ input khi lỗi; optimistic update chỉ khi có rollback rõ ràng. Với version conflict, theo helper hiện có và yêu cầu tải bản mới; không âm thầm ghi đè hoặc tự retry thao tác có tác dụng phụ.
- Không đổi lỗi thành số 0, danh sách rỗng hoặc toast thành công. Phân biệt loading, empty, error, forbidden, unavailable và success. Dữ liệu demo chỉ dùng khi chế độ demo được chọn rõ ràng hoặc trong fixture kiểm thử; không fallback demo khi API thật lỗi.
- Hiển thị tên/email/logo theo dữ liệu được phép đọc. ID dùng để đối soát, không làm nhãn chính khi có danh tính. Nội dung từ công ty/ứng viên phải render an toàn; không dùng `dangerouslySetInnerHTML` với dữ liệu chưa được xử lý an toàn.

## Tương tác và nội dung

- Giao diện tiếng Việt, sentence case, thuật ngữ nhất quán: “Ứng viên”, “Nhà tuyển dụng”, “Công ty”, “Tin tuyển dụng”, “Đơn ứng tuyển”, “Quản trị viên”. CTA nói đúng kết quả: “Lưu hồ sơ”, “Gửi duyệt”, “Ứng tuyển”, “Khóa tài khoản”. Không biến “Gửi duyệt” thành “Đăng tin thành công” trước khi được duyệt.
- Mỗi vùng có hành động chính rõ ràng; hành động nguy hiểm khác biệt và xác nhận khi cần, kèm lý do nếu API yêu cầu. Thông báo lỗi chỉ dẫn bước tiếp theo nhưng không tiết lộ dữ liệu riêng tư hoặc thông tin hạ tầng không cần thiết.
- Form có label thật, required/optional rõ ràng, lỗi gắn bằng `aria-describedby`, giữ giá trị và focus hợp lý. Không dùng placeholder thay label hoặc chỉ đổi màu để báo lỗi.
- Modal/menu dùng primitive sẵn có hoặc hành vi hiện tại: focus ban đầu, giới hạn focus khi mở, Escape đóng khi phù hợp, trả focus về nút mở, khóa scroll và cleanup khi unmount. Nút chỉ có icon cần accessible name; link dùng để điều hướng, button dùng cho thao tác.
- Bảng có header và phân trang; bộ lọc có trạng thái đang áp dụng và cách xóa. Giữ filter/search/page khi mở chi tiết rồi quay lại. Trên điện thoại dùng card hoặc cuộn ngang trong vùng bảng có chỉ dẫn, không làm cả trang tràn ngang.
- Dùng `Intl` với `vi-VN` cho số và thời gian. Thời gian người dùng thường theo GMT+7 (`Asia/Ho_Chi_Minh`), nhưng biểu đồ/báo cáo phải dùng timezone và ranh giới kỳ API trả về; không tự diễn giải một ngày UTC thành ngày GMT+7.

## Hiệu năng có căn cứ

- Tách widget nặng như trình tạo PDF/CV, video hoặc biểu đồ khỏi bundle khởi đầu khi có ích; lazy-load phần ngoài luồng chính. Không thêm dependency lớn thay cho helper nhỏ đang có.
- Tránh fetch trùng giữa shell/page, effect loop, polling rộng hoặc listener/socket không cleanup. Hủy request cũ hoặc bỏ response lỗi thời khi đổi bộ lọc/tìm kiếm. Cache dữ liệu công khai chỉ khi có chính sách làm mới rõ ràng; không cache chéo người dùng dữ liệu phiên/riêng tư.
- Ảnh/logo có kích thước hoặc aspect ratio cố định, fallback khi lỗi và lazy-load ngoài vùng đầu trang. Không lazy-load hình ảnh chủ đạo chỉ vì áp dụng một quy tắc chung.
- Đo bằng production build, request thực tế và thao tác trước/sau khi cần tối ưu. Không blanket `memo`, `useMemo`, prefetch hoặc tắt kiểm tra TypeScript để che vấn đề. Tôn trọng lựa chọn prefetch hiện hành trên menu dài nếu chưa có bằng chứng cần đổi.

## Kiểm chứng theo phạm vi

- Với code TypeScript/component: chạy `npm.cmd run typecheck`; với API/session/helper nghiệp vụ: thêm `npm.cmd run test:api` và kiểm tra có ý nghĩa cho hành vi thay đổi. Không viết test chỉ kiểm tra câu chữ của tài liệu này.
- Với route, form hoặc tương tác: chạy Playwright spec liên quan trong `tests/e2e/`. Ví dụ: `portal-navigation`, `workspace-consistency`, `auth-cookie-proxy`, `candidate-companies`, `chat-identities`, `admin-workspace`. Chọn đúng tên file đang tồn tại; dùng `--grep` khi cần thu hẹp.
- Với thay đổi bố cục, xem ảnh hoặc mở trang ở desktop và mobile; kiểm tra menu, focus, lỗi, empty state và tràn ngang. Với shared shell/CSS, kiểm tra cả ba portal để phát hiện giao diện chồng chéo. API giả lập dùng cho thao tác thay đổi dữ liệu; không khóa tài khoản hoặc gửi email thật chỉ để lấy ảnh.
- Build khi thay đổi ảnh hưởng runtime, import/dependency hoặc cần bàn giao bản chạy. Không rebuild Docker cho việc chỉ sửa skill/tài liệu. Việc restart/deploy hoặc kiểm thử dịch vụ ngoài phải nằm trong phạm vi người dùng yêu cầu.
- Bàn giao ngắn gọn: thay đổi, lý do, phần đã kiểm tra, giới hạn còn lại. Không gọi kiểm thử fixture là kiểm thử dịch vụ thật, không tự commit hoặc triển khai prod.
