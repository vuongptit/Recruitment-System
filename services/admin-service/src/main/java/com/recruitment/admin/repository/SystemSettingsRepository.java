package com.recruitment.admin.repository;

import com.recruitment.admin.dto.settings.PublicSettingsResponse;
import com.recruitment.admin.dto.settings.SystemSettingsResponse;
import com.recruitment.admin.dto.settings.UpdateSystemSettingsRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class SystemSettingsRepository {
  private final JdbcTemplate db;

  private static final RowMapper<SystemSettingsResponse> SETTINGS_ROW = (row, index) -> {
    Timestamp ts = row.getTimestamp("updated_at");
    Instant updatedAt = ts != null ? ts.toInstant() : null;
    return new SystemSettingsResponse(
        row.getString("site_name"),
        row.getString("site_slogan"),
        row.getString("site_logo"),
        row.getString("site_favicon"),
        row.getString("contact_email"),
        row.getString("contact_phone"),
        row.getString("footer_text"),
        row.getBoolean("allow_user_registration"),
        row.getBoolean("maintenance_mode"),
        updatedAt,
        row.getObject("updated_by", UUID.class)
    );
  };

  public SystemSettingsRepository(JdbcTemplate db) {
    this.db = db;
  }

  public SystemSettingsResponse getSettings() {
    try {
      return db.queryForObject(
          "SELECT site_name, site_slogan, site_logo, site_favicon, contact_email, contact_phone, footer_text, allow_user_registration, maintenance_mode, updated_at, updated_by FROM admin.system_settings WHERE id = 'default'",
          SETTINGS_ROW);
    } catch (EmptyResultDataAccessException empty) {
      return new SystemSettingsResponse(
          "CareerHub",
          "Nền tảng tuyển dụng thông minh",
          "",
          "",
          "admin@gmail.com",
          "",
          "Cùng bạn tiến xa hơn mỗi ngày.",
          true,
          false,
          Instant.now(),
          null);
    }
  }

  public PublicSettingsResponse getPublicSettings() {
    SystemSettingsResponse full = getSettings();
    return new PublicSettingsResponse(
        full.siteName(),
        full.siteSlogan(),
        full.siteLogo(),
        full.siteFavicon(),
        full.contactEmail(),
        full.contactPhone(),
        full.footerText()
    );
  }

  @Transactional
  public SystemSettingsResponse updateSettings(UpdateSystemSettingsRequest request, UUID actor) {
    SystemSettingsResponse current = getSettings();
    String siteName = request.siteName() != null ? request.siteName().trim() : current.siteName();
    String siteSlogan = request.siteSlogan() != null ? request.siteSlogan().trim() : current.siteSlogan();
    String siteLogo = request.siteLogo() != null ? request.siteLogo().trim() : current.siteLogo();
    String siteFavicon = request.siteFavicon() != null ? request.siteFavicon().trim() : current.siteFavicon();
    String contactEmail = request.contactEmail() != null ? request.contactEmail().trim() : current.contactEmail();
    String contactPhone = request.contactPhone() != null ? request.contactPhone().trim() : current.contactPhone();
    String footerText = request.footerText() != null ? request.footerText().trim() : current.footerText();
    boolean allowReg = request.allowUserRegistration() != null ? request.allowUserRegistration() : current.allowUserRegistration();
    boolean maintMode = request.maintenanceMode() != null ? request.maintenanceMode() : current.maintenanceMode();

    db.update("""
        INSERT INTO admin.system_settings(id, site_name, site_slogan, site_logo, site_favicon, contact_email, contact_phone, footer_text, allow_user_registration, maintenance_mode, updated_at, updated_by)
        VALUES('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), ?)
        ON CONFLICT(id) DO UPDATE SET
          site_name = EXCLUDED.site_name,
          site_slogan = EXCLUDED.site_slogan,
          site_logo = EXCLUDED.site_logo,
          site_favicon = EXCLUDED.site_favicon,
          contact_email = EXCLUDED.contact_email,
          contact_phone = EXCLUDED.contact_phone,
          footer_text = EXCLUDED.footer_text,
          allow_user_registration = EXCLUDED.allow_user_registration,
          maintenance_mode = EXCLUDED.maintenance_mode,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
        """, siteName, siteSlogan, siteLogo, siteFavicon, contactEmail, contactPhone, footerText, allowReg, maintMode, actor);

    return getSettings();
  }
}
