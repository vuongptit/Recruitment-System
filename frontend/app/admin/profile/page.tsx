"use client";

import Link from "next/link";
import { useEffect, useState, useRef, type FormEvent, type ChangeEvent } from "react";
import {
  User,
  Mail,
  Phone,
  Building,
  FileText,
  Lock,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  Camera,
  Trash2,
  KeyRound,
  ShieldCheck,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { requestApi } from "@/lib/apiClientCore";
import { useCurrentAccount } from "@/components/SessionGate";
import { PageHeader, LoadingState } from "@/components/ui";

interface AdminProfileData {
  adminId: string;
  email: string;
  fullName: string;
  phone: string;
  avatarUrl: string;
  bio: string;
  department: string;
  updatedAt?: string;
}

export default function AdminProfilePage() {
  const account = useCurrentAccount();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [profile, setProfile] = useState<AdminProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  // Form fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarInputUrl, setAvatarInputUrl] = useState("");

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    let active = true;
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await requestApi<AdminProfileData>("/api/admin/profile", {
          privateData: true,
        });
        if (!active) return;
        if (res.data) {
          setProfile(res.data);
          setFullName(res.data.fullName || "Quản trị viên");
          setPhone(res.data.phone || "");
          setDepartment(res.data.department || "Ban Quản trị");
          setBio(res.data.bio || "");
          setAvatarUrl(res.data.avatarUrl || "");
          setAvatarInputUrl(res.data.avatarUrl || "");
        }
      } catch (err: any) {
        if (!active) return;
        setProfileError(err?.message || "Không thể tải thông tin hồ sơ");
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchProfile();
    return () => {
      active = false;
    };
  }, []);

  const handleAvatarFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileError("Vui lòng chọn tệp hình ảnh (PNG, JPG, WEBP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Kích thước ảnh tối đa là 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatarUrl(result);
      setAvatarInputUrl("");
      setProfileError("");
    };
    reader.onerror = () => {
      setProfileError("Không thể đọc tệp hình ảnh");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess("");
    setProfileError("");

    if (!fullName.trim()) {
      setProfileError("Họ và tên không được để trống");
      setSavingProfile(false);
      return;
    }

    try {
      const finalAvatar = avatarUrl || avatarInputUrl;
      const res = await requestApi<AdminProfileData>("/api/admin/profile", {
        method: "PUT",
        privateData: true,
        body: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          department: department.trim(),
          bio: bio.trim(),
          avatarUrl: finalAvatar.trim(),
        },
      });

      if (res.data) {
        setProfile(res.data);
        setProfileSuccess("Cập nhật thông tin quản trị viên thành công!");
        // Dispatch custom event to notify AdminShell
        window.dispatchEvent(
          new CustomEvent("admin-profile-updated", {
            detail: {
              fullName: res.data.fullName,
              avatarUrl: res.data.avatarUrl,
            },
          })
        );
      }
    } catch (err: any) {
      setProfileError(err?.message || "Có lỗi xảy ra khi cập nhật thông tin");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordSuccess("");
    setPasswordError("");

    if (!currentPassword) {
      setPasswordError("Vui lòng nhập mật khẩu hiện tại");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Mật khẩu mới phải có ít nhất 8 ký tự");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError("Mật khẩu mới phải chứa ít nhất 1 chữ cái và 1 chữ số");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận không khớp với mật khẩu mới");
      return;
    }

    setChangingPassword(true);
    try {
      await requestApi<{ message: string }>("/api/auth/me/password", {
        method: "PUT",
        privateData: true,
        body: {
          currentPassword,
          newPassword,
        },
      });
      setPasswordSuccess("Đổi mật khẩu thành công! Hãy ghi nhớ mật khẩu mới của bạn.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err?.message || "Mật khẩu hiện tại không chính xác hoặc không hợp lệ");
    } finally {
      setChangingPassword(false);
    }
  };

  const initials = (fullName || account?.email || "AD")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  if (loading) {
    return <LoadingState label="Đang tải thông tin quản trị viên…" />;
  }

  return (
    <div className="admin-profile-container">
      {/* Breadcrumb */}
      <nav className="admin-breadcrumb" aria-label="Điều hướng liên kết">
        <Link href="/admin">Quản trị</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">Thông tin cá nhân</span>
      </nav>

      <PageHeader
        eyebrow="QUẢN TRỊ VIÊN · TÀI KHOẢN"
        title="Thông tin cá nhân & Bảo mật"
        description="Quản lý thông tin quản trị viên, ảnh đại diện, số điện thoại liên hệ và bảo mật mật khẩu hệ thống."
      />

      <div className="admin-profile-layout">
        {/* Profile Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Hồ sơ cá nhân</h2>
              <p className="admin-card-subtitle">
                Thông tin này dùng để hiển thị trên thanh điều hướng và nhật ký hoạt động quản trị.
              </p>
            </div>
            <span className="badge badge-primary">
              <ShieldCheck size={14} style={{ marginRight: 4, display: "inline" }} />
              Quản trị viên
            </span>
          </div>

          {profileSuccess && (
            <div className="notice notice-success" role="status">
              <CheckCircle2 size={18} />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div className="notice notice-danger" role="alert">
              <AlertCircle size={18} />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="admin-profile-form">
            {/* Avatar Section */}
            <div className="admin-avatar-picker-section">
              <div className="admin-avatar-display">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="admin-profile-avatar-img" />
                ) : (
                  <div className="admin-profile-avatar-initials">{initials}</div>
                )}
              </div>
              <div className="admin-avatar-controls">
                <div className="admin-avatar-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera size={16} />
                    Tải ảnh từ máy
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-danger"
                      onClick={() => {
                        setAvatarUrl("");
                        setAvatarInputUrl("");
                      }}
                    >
                      <Trash2 size={16} />
                      Xóa ảnh
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden-file-input"
                  style={{ display: "none" }}
                  onChange={handleAvatarFile}
                />
                <div className="admin-avatar-url-input">
                  <span className="text-muted text-xs">Hoặc dán URL ảnh đại diện:</span>
                  <input
                    type="url"
                    className="input input-sm"
                    placeholder="https://example.com/avatar.jpg"
                    value={avatarInputUrl}
                    onChange={(e) => {
                      setAvatarInputUrl(e.target.value);
                      if (e.target.value.trim()) {
                        setAvatarUrl(e.target.value.trim());
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="admin-form-grid">
              <div className="field">
                <label htmlFor="admin-full-name">
                  <User size={15} /> Họ và tên <span className="text-danger">*</span>
                </label>
                <input
                  id="admin-full-name"
                  type="text"
                  className="input"
                  required
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="admin-email">
                  <Mail size={15} /> Email tài khoản
                </label>
                <input
                  id="admin-email"
                  type="email"
                  className="input disabled-input"
                  readOnly
                  disabled
                  value={profile?.email || account?.email || "admin@gmail.com"}
                  title="Email đăng nhập cố định của tài khoản"
                />
                <span className="field-hint">Email đăng nhập duy nhất được gán quyền Quản trị viên.</span>
              </div>

              <div className="field">
                <label htmlFor="admin-phone">
                  <Phone size={15} /> Số điện thoại liên hệ
                </label>
                <input
                  id="admin-phone"
                  type="tel"
                  className="input"
                  placeholder="Ví dụ: 0912345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="admin-department">
                  <Building size={15} /> Phòng ban / Vai trò
                </label>
                <input
                  id="admin-department"
                  type="text"
                  className="input"
                  placeholder="Ví dụ: Ban Điều hành Hệ thống"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>

              <div className="field full-width">
                <label htmlFor="admin-bio">
                  <FileText size={15} /> Ghi chú / Giới thiệu
                </label>
                <textarea
                  id="admin-bio"
                  className="textarea"
                  rows={3}
                  placeholder="Mô tả ngắn về trách nhiệm hoặc ghi chú công việc..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    Đang lưu…
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Lưu thông tin cá nhân
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">Đổi mật khẩu</h2>
              <p className="admin-card-subtitle">
                Định kỳ thay đổi mật khẩu để tăng cường an ninh cho tài khoản quản trị viên.
              </p>
            </div>
            <KeyRound size={20} className="text-muted" />
          </div>

          {passwordSuccess && (
            <div className="notice notice-success" role="status">
              <CheckCircle2 size={18} />
              <span>{passwordSuccess}</span>
            </div>
          )}

          {passwordError && (
            <div className="notice notice-danger" role="alert">
              <AlertCircle size={18} />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="admin-password-form">
            <div className="field">
              <label htmlFor="current-password">
                <Lock size={15} /> Mật khẩu hiện tại <span className="text-danger">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  className="input"
                  required
                  placeholder="Nhập mật khẩu hiện tại"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label={showCurrentPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="new-password">
                <Lock size={15} /> Mật khẩu mới <span className="text-danger">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  className="input"
                  required
                  placeholder="Tối thiểu 8 ký tự (chữ & số)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="confirm-password">
                <Lock size={15} /> Xác nhận mật khẩu mới <span className="text-danger">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className="input"
                  required
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Checklist */}
            <div className="password-checklist">
              <span className="checklist-title">Yêu cầu bảo mật mật khẩu:</span>
              <ul>
                <li className={newPassword.length >= 8 ? "valid" : ""}>
                  Tối thiểu 8 ký tự
                </li>
                <li className={/[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword) ? "valid" : ""}>
                  Chứa cả chữ cái và chữ số
                </li>
                <li className={newPassword && newPassword === confirmPassword ? "valid" : ""}>
                  Mật khẩu mới và xác nhận trùng khớp
                </li>
              </ul>
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="btn btn-primary" disabled={changingPassword}>
                {changingPassword ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    Đang đổi mật khẩu…
                  </>
                ) : (
                  <>
                    <KeyRound size={16} />
                    Cập nhật mật khẩu
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
