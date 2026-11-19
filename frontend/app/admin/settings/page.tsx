"use client";

import Link from "next/link";
import { useEffect, useState, useRef, type FormEvent, type ChangeEvent } from "react";
import {
  Globe,
  Image as ImageIcon,
  Mail,
  Phone,
  FileText,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Upload,
  Trash2,
  Sliders,
  Sparkles,
  ChevronRight,
  Loader2,
  Eye,
  Check,
} from "lucide-react";
import { requestApi } from "@/lib/apiClientCore";
import { useSiteSettings, DEFAULT_SITE_SETTINGS, type SystemSettings } from "@/components/SiteSettingsContext";
import { Logo } from "@/components/Logo";
import { PageHeader, LoadingState } from "@/components/ui";

export default function AdminSettingsPage() {
  const { updateLocalSettings } = useSiteSettings();
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const faviconFileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Form State
  const [siteName, setSiteName] = useState(DEFAULT_SITE_SETTINGS.siteName);
  const [siteSlogan, setSiteSlogan] = useState(DEFAULT_SITE_SETTINGS.siteSlogan);
  const [siteLogo, setSiteLogo] = useState(DEFAULT_SITE_SETTINGS.siteLogo);
  const [logoInputUrl, setLogoInputUrl] = useState("");
  const [siteFavicon, setSiteFavicon] = useState(DEFAULT_SITE_SETTINGS.siteFavicon);
  const [faviconInputUrl, setFaviconInputUrl] = useState("");
  const [contactEmail, setContactEmail] = useState(DEFAULT_SITE_SETTINGS.contactEmail);
  const [contactPhone, setContactPhone] = useState(DEFAULT_SITE_SETTINGS.contactPhone);
  const [footerText, setFooterText] = useState(DEFAULT_SITE_SETTINGS.footerText);
  const [allowUserRegistration, setAllowUserRegistration] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await requestApi<SystemSettings>("/api/admin/settings", {
          privateData: true,
        });
        if (!active) return;
        if (res.data) {
          setSiteName(res.data.siteName || DEFAULT_SITE_SETTINGS.siteName);
          setSiteSlogan(res.data.siteSlogan || DEFAULT_SITE_SETTINGS.siteSlogan);
          setSiteLogo(res.data.siteLogo || "");
          setLogoInputUrl(res.data.siteLogo || "");
          setSiteFavicon(res.data.siteFavicon || "");
          setFaviconInputUrl(res.data.siteFavicon || "");
          setContactEmail(res.data.contactEmail || DEFAULT_SITE_SETTINGS.contactEmail);
          setContactPhone(res.data.contactPhone || "");
          setFooterText(res.data.footerText || DEFAULT_SITE_SETTINGS.footerText);
          setAllowUserRegistration(res.data.allowUserRegistration ?? true);
          setMaintenanceMode(res.data.maintenanceMode ?? false);
        }
      } catch (err: any) {
        if (!active) return;
        setErrorMessage(err?.message || "Không thể tải cấu hình hệ thống");
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchSettings();
    return () => {
      active = false;
    };
  }, []);

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Vui lòng chọn tệp hình ảnh (PNG, JPG, SVG, WEBP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("Kích thước tệp logo tối đa là 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setSiteLogo(result);
      setLogoInputUrl("");
      setErrorMessage("");
    };
    reader.readAsDataURL(file);
  };

  const handleFaviconUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.name.endsWith(".ico")) {
      setErrorMessage("Vui lòng chọn tệp icon hợp lệ (.ico, .png, .svg)");
      return;
    }
    if (file.size > 512 * 1024) {
      setErrorMessage("Kích thước tệp favicon tối đa là 512KB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setSiteFavicon(result);
      setFaviconInputUrl("");
      setErrorMessage("");
    };
    reader.readAsDataURL(file);
  };

  const handleResetToDefault = () => {
    if (window.confirm("Bạn có chắc chắn muốn đặt lại tất cả cấu hình về giá trị mặc định của CareerHub?")) {
      setSiteName(DEFAULT_SITE_SETTINGS.siteName);
      setSiteSlogan(DEFAULT_SITE_SETTINGS.siteSlogan);
      setSiteLogo(DEFAULT_SITE_SETTINGS.siteLogo);
      setLogoInputUrl("");
      setSiteFavicon(DEFAULT_SITE_SETTINGS.siteFavicon);
      setFaviconInputUrl("");
      setContactEmail(DEFAULT_SITE_SETTINGS.contactEmail);
      setContactPhone(DEFAULT_SITE_SETTINGS.contactPhone);
      setFooterText(DEFAULT_SITE_SETTINGS.footerText);
      setAllowUserRegistration(true);
      setMaintenanceMode(false);
      setSuccessMessage("Đã khôi phục các giá trị mặc định. Bấm 'Lưu cấu hình hệ thống' để áp dụng.");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage("");
    setErrorMessage("");

    if (!siteName.trim()) {
      setErrorMessage("Tên trang web không được để trống");
      setSaving(false);
      return;
    }

    const finalLogo = siteLogo || logoInputUrl;
    const finalFavicon = siteFavicon || faviconInputUrl;

    const payload = {
      siteName: siteName.trim(),
      siteSlogan: siteSlogan.trim(),
      siteLogo: finalLogo.trim(),
      siteFavicon: finalFavicon.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      footerText: footerText.trim(),
      allowUserRegistration,
      maintenanceMode,
    };

    try {
      const res = await requestApi<SystemSettings>("/api/admin/settings", {
        method: "PUT",
        privateData: true,
        body: payload,
      });

      if (res.data) {
        updateLocalSettings(res.data);
        setSuccessMessage("Lưu cấu hình hệ thống thành công! Toàn bộ giao diện đã được cập nhật.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Có lỗi xảy ra khi lưu cấu hình hệ thống");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Đang tải cấu hình hệ thống…" />;
  }

  return (
    <div className="admin-settings-container">
      {/* Breadcrumb */}
      <nav className="admin-breadcrumb" aria-label="Điều hướng liên kết">
        <Link href="/admin">Quản trị</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">Cấu hình hệ thống</span>
      </nav>

      <PageHeader
        eyebrow="HỆ THỐNG · THƯƠNG HIỆU & VẬN HÀNH"
        title="Cấu hình hệ thống & Thương hiệu"
        description="Tùy biến tên nền tảng (đổi tên CareerHub thành tên khác), logo trang web, biểu tượng favicon, thông tin liên hệ và các thông số vận hành."
      />

      {/* Live Preview Panel */}
      <div className="admin-preview-card card">
        <div className="admin-preview-header">
          <div className="admin-preview-title">
            <Sparkles size={18} className="text-primary" />
            <strong>Xem trước nhận diện thương hiệu trực tiếp (Live Preview)</strong>
          </div>
          <span className="badge badge-info">Hiển thị tức thì</span>
        </div>
        <p className="admin-preview-desc">
          Bản xem trước trực tiếp khi người dùng truy cập vào trang web với tên và logo hiện tại:
        </p>

        <div className="admin-preview-frame">
          <div className="admin-preview-topbar">
            <div className="admin-preview-brand">
              <Logo size={36} src={siteLogo || logoInputUrl || null} />
              <div className="admin-preview-brand-text">
                <span className="admin-preview-name">{siteName || "CareerHub"}</span>
                <span className="admin-preview-slogan">{siteSlogan || "Nền tảng tuyển dụng thông minh"}</span>
              </div>
            </div>
            <div className="admin-preview-menu">
              <span>Tìm việc làm</span>
              <span>Công ty</span>
              <span className="preview-btn-mock">Đăng tuyển</span>
            </div>
          </div>
          <div className="admin-preview-footer">
            <span>{siteName || "CareerHub"} · {footerText || "Cùng bạn tiến xa hơn mỗi ngày."}</span>
            <span>Hotline: {contactPhone || "Chưa thiết lập"} · Email: {contactEmail || "admin@gmail.com"}</span>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="notice notice-success" role="status">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="notice notice-danger" role="alert">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="admin-settings-form">
        {/* Section 1: Branding */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">
                <Globe size={18} style={{ marginRight: 6, display: "inline" }} />
                Nhận diện & Thương hiệu Website
              </h2>
              <p className="admin-card-subtitle">
                Thay đổi tên website, khẩu hiệu và logo đại diện xuất hiện trên toàn bộ hệ thống.
              </p>
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="field">
              <label htmlFor="settings-site-name">
                Tên trang web / Nền tảng <span className="text-danger">*</span>
              </label>
              <input
                id="settings-site-name"
                type="text"
                className="input"
                required
                maxLength={100}
                placeholder="Ví dụ: CareerHub, MyJob, VietNam Works..."
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
              />
              <span className="field-hint">
                Tên này thay thế cho chữ &quot;CareerHub&quot; trên Header, Chân trang, Tab trình duyệt và Email thông báo.
              </span>
            </div>

            <div className="field">
              <label htmlFor="settings-site-slogan">
                Khẩu hiệu / Slogan phụ
              </label>
              <input
                id="settings-site-slogan"
                type="text"
                className="input"
                maxLength={255}
                placeholder="Ví dụ: Nền tảng tuyển dụng thông minh"
                value={siteSlogan}
                onChange={(e) => setSiteSlogan(e.target.value)}
              />
              <span className="field-hint">Khẩu hiệu phụ hiển thị dưới tên trang web hoặc trên banner giới thiệu.</span>
            </div>

            {/* Logo field */}
            <div className="field full-width">
              <label>Logo trang web</label>
              <div className="admin-logo-upload-box">
                <div className="admin-logo-preview-thumb">
                  {siteLogo || logoInputUrl ? (
                    <img
                      src={siteLogo || logoInputUrl}
                      alt="Logo preview"
                      className="admin-uploaded-logo"
                    />
                  ) : (
                    <div className="admin-default-logo-badge">
                      <Logo size={42} />
                      <span>Logo mặc định</span>
                    </div>
                  )}
                </div>

                <div className="admin-logo-inputs">
                  <div className="admin-logo-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => logoFileInputRef.current?.click()}
                    >
                      <Upload size={15} /> Tải ảnh logo từ máy
                    </button>
                    {(siteLogo || logoInputUrl) && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-danger"
                        onClick={() => {
                          setSiteLogo("");
                          setLogoInputUrl("");
                        }}
                      >
                        <Trash2 size={15} /> Xóa logo (Dùng mặc định)
                      </button>
                    )}
                  </div>
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    style={{ display: "none" }}
                    onChange={handleLogoUpload}
                  />
                  <div className="admin-logo-url-field">
                    <span className="text-muted text-xs">Hoặc dán URL logo trực tiếp:</span>
                    <input
                      type="url"
                      className="input input-sm"
                      placeholder="https://example.com/logo.png"
                      value={logoInputUrl}
                      onChange={(e) => {
                        setLogoInputUrl(e.target.value);
                        if (e.target.value.trim()) {
                          setSiteLogo(e.target.value.trim());
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Favicon field */}
            <div className="field full-width">
              <label>Biểu tượng Favicon (Hiển thị trên tab trình duyệt)</label>
              <div className="admin-logo-upload-box">
                <div className="admin-favicon-preview-thumb">
                  {siteFavicon || faviconInputUrl ? (
                    <img
                      src={siteFavicon || faviconInputUrl}
                      alt="Favicon preview"
                      className="admin-uploaded-favicon"
                    />
                  ) : (
                    <div className="admin-default-favicon-badge">
                      <Logo size={24} />
                    </div>
                  )}
                </div>

                <div className="admin-logo-inputs">
                  <div className="admin-logo-buttons">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => faviconFileInputRef.current?.click()}
                    >
                      <Upload size={15} /> Tải favicon (.ico, .png, .svg)
                    </button>
                    {(siteFavicon || faviconInputUrl) && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-danger"
                        onClick={() => {
                          setSiteFavicon("");
                          setFaviconInputUrl("");
                        }}
                      >
                        <Trash2 size={15} /> Xóa favicon
                      </button>
                    )}
                  </div>
                  <input
                    ref={faviconFileInputRef}
                    type="file"
                    accept="image/x-icon,image/png,image/svg+xml"
                    style={{ display: "none" }}
                    onChange={handleFaviconUpload}
                  />
                  <div className="admin-logo-url-field">
                    <span className="text-muted text-xs">Hoặc dán URL favicon:</span>
                    <input
                      type="url"
                      className="input input-sm"
                      placeholder="https://example.com/favicon.ico"
                      value={faviconInputUrl}
                      onChange={(e) => {
                        setFaviconInputUrl(e.target.value);
                        if (e.target.value.trim()) {
                          setSiteFavicon(e.target.value.trim());
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Contact & Footer */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">
                <Mail size={18} style={{ marginRight: 6, display: "inline" }} />
                Thông tin liên hệ & Chân trang
              </h2>
              <p className="admin-card-subtitle">
                Cung cấp các kênh liên hệ hỗ trợ người dùng và thông điệp chân trang.
              </p>
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="field">
              <label htmlFor="settings-contact-email">
                <Mail size={15} /> Email hỗ trợ hệ thống
              </label>
              <input
                id="settings-contact-email"
                type="email"
                className="input"
                placeholder="contact@careerhub.vn"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="settings-contact-phone">
                <Phone size={15} /> Hotline / Số điện thoại hỗ trợ
              </label>
              <input
                id="settings-contact-phone"
                type="tel"
                className="input"
                placeholder="1900 6868 hoặc 0901234567"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>

            <div className="field full-width">
              <label htmlFor="settings-footer-text">
                <FileText size={15} /> Thông điệp chân trang (Footer Text)
              </label>
              <input
                id="settings-footer-text"
                type="text"
                className="input"
                placeholder="Cùng bạn tiến xa hơn mỗi ngày."
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Operational */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">
                <Sliders size={18} style={{ marginRight: 6, display: "inline" }} />
                Cài đặt vận hành hệ thống
              </h2>
              <p className="admin-card-subtitle">
                Kiểm soát quyền truy cập và các trạng thái hoạt động của nền tảng.
              </p>
            </div>
          </div>

          <div className="admin-toggles-list">
            <label className="admin-toggle-item">
              <div className="admin-toggle-text">
                <strong>Cho phép đăng ký người dùng mới</strong>
                <p>Mở cổng cho phép ứng viên và nhà tuyển dụng tự do đăng ký tài khoản mới.</p>
              </div>
              <input
                type="checkbox"
                className="toggle-checkbox"
                checked={allowUserRegistration}
                onChange={(e) => setAllowUserRegistration(e.target.checked)}
              />
            </label>

            <label className="admin-toggle-item">
              <div className="admin-toggle-text">
                <strong>Chế độ bảo trì hệ thống</strong>
                <p>Tạm khóa các tính năng công khai để nâng cấp hoặc bảo trì kỹ thuật.</p>
              </div>
              <input
                type="checkbox"
                className="toggle-checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
              />
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="admin-form-actions admin-settings-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={16} className="spinner" />
                Đang lưu cấu hình…
              </>
            ) : (
              <>
                <Save size={16} />
                Lưu cấu hình hệ thống
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={saving}
            onClick={handleResetToDefault}
          >
            <RotateCcw size={16} />
            Khôi phục mặc định
          </button>
        </div>
      </form>
    </div>
  );
}
