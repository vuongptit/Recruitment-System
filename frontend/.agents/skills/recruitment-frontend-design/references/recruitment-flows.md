# Quy tắc giao diện theo nghiệp vụ tuyển dụng

Đọc mục liên quan đến nhiệm vụ. Đây là quy ước trình bày và đường dẫn tới code quyết định nghiệp vụ; khi hợp đồng thay đổi, đối chiếu adapter/backend hiện tại thay vì tự thêm trạng thái hoặc hành động.

Các đường dẫn code tính từ `frontend/`.

## Vai trò và điều hướng

| Vai trò | Trang giới thiệu / đăng nhập | Tổng quan sau đăng nhập | Nội dung chính |
| --- | --- | --- | --- |
| Ứng viên | `/`, `/login`, `/register` | `/candidate/dashboard` | Tìm việc, công ty, CV/hồ sơ, việc đã lưu, đơn ứng tuyển, lịch phỏng vấn |
| Nhà tuyển dụng | `/recruiter`, `/recruiter/login`, `/recruiter/register` | `/recruiter/dashboard` | Công ty, tin tuyển dụng, hồ sơ ứng tuyển, phỏng vấn và offer |
| Quản trị viên | `/admin/login` | `/admin` | Hiện trạng, hàng chờ, kiểm duyệt, tài khoản, báo cáo vi phạm và nhật ký |

- Header ứng viên có ba tab như trang chủ: “Trang chủ” → `/`, “Tìm việc làm” → `/candidate/jobs`, “Công ty” → `/candidate/companies` khi đã đăng nhập ứng viên, `/companies` cho khách. Sidebar ứng viên dùng “Tổng quan” → `/candidate/dashboard`.
- Nhà tuyển dụng và Admin ở trong portal tương ứng; không gắn “Trang chủ” của hai vai trò này sang `/` chỉ vì dùng chung logo/header. Dùng `AccountNavigation` và các hàm `portalEntry`, `portalHome`, `portalSection`.
- Công ty công khai ở `/companies/:companyId`; trong workspace ứng viên ở `/candidate/companies/:companyId`. Đọc layout hiện tại để giữ shell phù hợp, tránh lồng header.
- Tin nhắn và thông báo ở route theo vai trò. Route cũ dùng chung có thể là alias; giữ khả năng chuyển về portal đúng qua `scopedDestination`, không tạo workspace dùng lẫn vai trò.

## Đăng nhập và tài khoản

- Password và Google đều phải kết thúc ở đúng portal. Vai trò Google lấy từ trang bắt đầu ứng viên/nhà tuyển dụng; không thêm màn chọn vai trò ở callback. Tài khoản đã tồn tại không được tự đổi role để khớp nút vừa bấm; xử lý mismatch theo API. Admin không có đăng ký công khai.
- Dùng cơ chế cookie và session hiện tại. Sau callback, chờ kiểm tra được danh tính cookie trước khi mở dữ liệu riêng tư; reload phải giữ phiên. Giữ xử lý `returnTo` an toàn theo helper hiện có, không chấp nhận URL ngoài tùy ý.
- OTP/reset dùng thời hạn và phản hồi API, không đưa mã/token vào thông báo, log hoặc test snapshot. Trang quên mật khẩu giữ phản hồi không tiết lộ email đã tồn tại. Không tự gửi email hoặc tạo tài khoản thật để thử nếu chưa có yêu cầu/ủy quyền phù hợp.
- Điểm đọc: `components/SessionGate.tsx`, `components/ApiSessionBoundary.tsx`, `lib/authSession.ts`, `lib/authCookieProxy.ts`, `lib/person1Api.ts`, `app/auth/callback/`, `app/api/auth-cookie/`.

## Ứng viên: tìm việc, công ty và hồ sơ

- Danh sách tin: tiêu đề, công ty/logo, địa điểm, mức lương hoặc thỏa thuận, hình thức làm việc và hạn tuyển nếu được API cung cấp. Không suy đoán mức lương, số tin, nhãn xác minh hoặc độ phù hợp AI.
- Tìm kiếm/bộ lọc dùng helper hiện tại, có loading, bỏ lọc và trạng thái không tìm thấy. Không trình bày lỗi search service như “Không có việc làm”.
- Danh bạ công ty công khai lấy những công ty được API xác nhận đã xác minh. Chi tiết có tên/logo, giới thiệu, quy mô, địa chỉ, website và tin của đúng công ty. Chỉ gắn huy hiệu “Đã xác minh” theo trạng thái thật; không lấy toàn bộ tin rồi gắn tên công ty đang xem.
- Hồ sơ và CV tách biệt nhưng có đường dẫn qua lại rõ ràng. Thông tin chưa có là “Chưa cập nhật”, không tự điền kinh nghiệm/chứng chỉ để tăng phần trăm hoàn thiện.
- CV PDF hiện có giới hạn 5 MiB và tối đa 5 CV hoạt động; đọc validator/API khi sửa, tránh tạo bản giới hạn thứ hai khác backend. Luồng upload dùng ký → upload Cloudinary → confirm → lưu tham chiếu theo adapter hiện có. Chỉ báo lưu thành công khi bước cuối thành công; xử lý lỗi theo bước, không biến file đã upload nhưng chưa lưu thành một CV hoàn chỉnh.
- CV, tài liệu xác minh và tài liệu offer dùng quyền truy cập/URL ký sẵn do backend cấp; không biến tài liệu riêng tư thành public URL hoặc lưu URL tạm hết hạn làm tham chiếu lâu dài.
- Điểm đọc: `lib/publicJobSearch.ts`, `lib/companyPublicSearch.ts`, `lib/companyPublicProfile.ts`, `lib/person1Api.ts`, `lib/companyMediaUpload.ts`; các trang `app/candidate/profile/`, `app/candidate/companies/`, `app/companies/`.

## Nhà tuyển dụng: công ty và tin tuyển dụng

- Phân biệt “Hồ sơ nhà tuyển dụng” với “Hồ sơ công ty”; quyền thành viên công ty quyết định dữ liệu và hành động. Không cho UI tự lấy một companyId bất kỳ để thao tác.
- Xác minh công ty có trạng thái và lý do từ chối; dùng `companyVerificationView`, `requiresCompanyReverification` và helper quyền hiện hành. Hiển thị đúng khả năng gửi lại và trường thay đổi cần xác minh lại; không giả định cập nhật hồ sơ đồng nghĩa đã được duyệt.
- Tin nháp có thể gửi duyệt; tin đã xuất bản có thể đóng theo `recruiterJobActions`. `PENDING_APPROVAL` không phải `PUBLISHED`. Tin bị từ chối hiện có thể quay về `DRAFT` kèm lý do: dùng `isRejectedRecruiterJob`, không phát minh trạng thái `REJECTED` cho job.
- Giữ lý do từ chối khi sửa theo góp ý. Chỉ hiện nút sửa/đóng/gửi duyệt theo state và quyền backend; phản hồi 403/409 cần có hướng khắc phục, không giả thành công.
- Điểm đọc: `lib/companyMembership.ts`, `lib/companyVerification.ts`, `lib/recruiterJobAccess.ts`, `lib/jobLifecycle.ts`, `lib/jobForm.ts`, `lib/person2Api.ts`.

## Đơn ứng tuyển, phỏng vấn và offer

- Dùng `applicationStateMachine` và helper chuyên biệt cho hành động của từng vai trò. Không tạo mảng trạng thái riêng trong component hoặc cho nhảy thẳng từ bất kỳ bước nào sang `HIRED`.
- Pipeline thống nhất: `APPLIED → REVIEWING → INTERVIEW → OFFER → HIRED`; `REJECTED` là nhánh kết thúc, `WITHDRAWN` chỉ để đọc dữ liệu lịch sử. Dùng `ApplicationProgress`, `ApplicationNextStep`, `ApplicationTimeline`, `ApplicationStageFilter`; xem [quy trình chi tiết](../../../../../docs/application-pipeline.md).
- Hồ sơ đã gửi không được rút ở bất kỳ bước nào. API cũ trả `APPLICATION_NOT_WITHDRAWABLE`; không tạo lại nút rút hoặc dùng rút thay cho từ chối thư mời. Đặt lịch chỉ sau khi chuyển hồ sơ sang `INTERVIEW`.
- Phân biệt hồ sơ đã gửi, đang xem xét, phỏng vấn, offer, đã tuyển, bị từ chối, đã rút. API là nguồn xác nhận trạng thái và version, không phải màu badge hoặc vị trí cột.
- Khi ứng tuyển, kiểm tra CV có thể dùng, thông tin tin tuyển dụng và phản hồi trùng/cooldown theo helper hiện có. Giữ điều hướng về đúng tin sau đăng nhập.
- Thao tác từ chối, gửi offer, phản hồi offer có điều kiện riêng và có thể cần lý do/confirmation. Lưu input khi lỗi, làm rõ kết quả chưa xác định, không retry mù khi có nguy cơ gửi trùng. `WITHDRAWN` chỉ nằm trong “Lịch sử cũ”, nhãn “Đã rút trước đây”; không trình bày như một bước của pipeline hiện hành.
- Phỏng vấn hiển thị timezone, phương thức và thông tin tham gia thật từ API. Không tự dựng phòng video hoặc cho nút tham gia hoạt động khi chưa có room/call được cấp quyền.
- Dùng `interviewWorkflow`/`InterviewSummary` cho điều kiện thao tác và thông tin lịch hai phía. `SCHEDULED` là chờ ứng viên xác nhận; lịch đổi cần xác nhận lại. Không suy luận tham dự từ việc nhà tuyển dụng mở phòng và không tự đánh vắng mặt lịch trực tiếp. Xem [quy trình lịch phỏng vấn](../../../../../docs/interview-workflow-review.md).
- Quy trình đặt lịch hiện tại chỉ có **một vòng**: nhà tuyển dụng chọn một ngày giờ và gửi, ứng viên xác nhận là hoàn tất đặt lịch. Không thêm chọn vòng, nhiều khung giờ đề xuất hay chấm điểm vào form đặt lịch. Khi sửa ngày giờ thì vẫn là buổi hẹn đó, cần xác nhận mới; lịch cũ chỉ xem trong lịch sử, không xóa dữ liệu cũ.
- Điểm đọc: `lib/applicationStateMachine.ts`, `lib/applicationVersioning.ts`, `lib/applicationCooldown.ts`, `lib/recruiterCvAccess.ts`, `lib/offerResponseRecovery.ts`, `lib/interviewApi.ts`.

## Hội thoại và thông báo

- Phía ứng viên nhận diện hội thoại bằng tên công ty và logo; phía nhà tuyển dụng bằng tên ứng viên và avatar. Dùng `conversationIdentity` cùng dữ liệu counterpart được backend cấp quyền; không suy luận từ userId hoặc tin nhắn để lộ danh tính.
- Thiếu thông tin thì dùng fallback trung thực và avatar initials, không lặp tên chung “Nhà tuyển dụng”/“Ứng viên” cho mọi hội thoại khi đã có tên thật. Không tạo tên giả để che API thiếu dữ liệu.
- Giữ phân biệt unread, đang gửi, gửi lỗi, đã gửi; tránh thêm trùng tin khi nhận lại qua socket. Reconnect và cleanup theo client hiện hành, không mở socket mới theo mỗi lần render.
- Thông báo dẫn tới trang theo vai trò và đối tượng thực; cập nhật đã đọc theo API, xử lý link cũ/đối tượng mất quyền. Không route Admin sang workspace ứng viên.
- Điểm đọc: `lib/chatIdentity.ts`, `lib/chatApi.ts`, `lib/notificationState.ts`, `components/NotificationProvider.tsx`.

## Quản trị và thống kê

- Thiết kế Admin dùng bảng dễ quét, bộ lọc rõ ràng, chi tiết để đối soát và hành động thận trọng. Màu xanh lam và sidebar tối áp dụng cả đăng nhập Admin; không làm đổi màu hai portal còn lại.
- Dashboard phân biệt hiện trạng toàn hệ thống, hàng chờ cần xử lý và hoạt động trong kỳ. Filter thời gian chỉ áp dụng phần hoạt động, không làm số tài khoản toàn hệ thống bị hiểu là tài khoản mới trong kỳ.
- “Hôm nay” là ngày đang chạy GMT+7, so sánh cùng khoảng giờ hôm qua; các kỳ ngày hoàn tất dùng mốc API trả về (hiện có UTC). Hiển thị timezone, thời điểm cập nhật và kỳ so sánh; không tự cộng hai múi giờ khác nhau.
- Chỉ số thiếu nguồn là không khả dụng, không phải 0. Số bị giới hạn có thể là `50+`; “Tất cả” là toàn bộ lịch sử ghi nhận được, không hứa dữ liệu trước khi hệ thống thu thập.
- CSV/Excel và chart phải theo cùng period/filter và ý nghĩa số liệu. Dùng endpoint xuất báo cáo hiện hành, không tự thu gom một trang bảng để gọi là báo cáo toàn hệ thống. Giữ trạng thái đang xuất và lỗi tải file; không đưa token vào link download.
- Nhật ký: tên thao tác từ `action`; `reason` nằm ở ghi chú. `target_label`/`target_role` và `admin_label` là danh tính hiện tại; thiếu thì báo rõ. ID gốc trong “Thông tin đối soát”, không làm tiêu đề chính. Giao diện ẩn dòng `STARTED` theo quy ước hiện tại; không xóa hoặc thay đổi lịch sử backend, không suy đoán dòng thành công từ dòng bắt đầu.
- Khóa/mở khóa, kiểm duyệt và xử lý vi phạm chỉ báo thành công khi backend xác nhận. Trạng thái `UNKNOWN`/`PROCESSING` cần đối soát, không đổi nhãn thành thành công để làm giao diện gọn hơn.
- Điểm đọc: `components/admin/`, `components/AdminWorkspace.tsx`, `lib/adminDashboard.ts`, [tài liệu Admin](../../../../../docs/admin-ui.md), `services/admin-service/README.md` ở thư mục gốc repo.
