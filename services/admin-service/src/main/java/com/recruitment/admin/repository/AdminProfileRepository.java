package com.recruitment.admin.repository;

import com.recruitment.admin.dto.profile.AdminProfileResponse;
import com.recruitment.admin.dto.profile.UpdateAdminProfileRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AdminProfileRepository {
  private final JdbcTemplate db;

  private static final RowMapper<AdminProfileResponse> PROFILE_ROW = (row, index) -> {
    Timestamp ts = row.getTimestamp("updated_at");
    Instant updatedAt = ts != null ? ts.toInstant() : null;
    return new AdminProfileResponse(
        row.getObject("admin_id", UUID.class),
        null, // Email resolved separately
        row.getString("full_name"),
        row.getString("phone"),
        row.getString("avatar_url"),
        row.getString("bio"),
        row.getString("department"),
        updatedAt
    );
  };

  public AdminProfileRepository(JdbcTemplate db) {
    this.db = db;
  }

  public AdminProfileResponse getProfile(UUID adminId) {
    try {
      return db.queryForObject(
          "SELECT admin_id, full_name, phone, avatar_url, bio, department, updated_at FROM admin.admin_profiles WHERE admin_id = ?",
          PROFILE_ROW, adminId);
    } catch (EmptyResultDataAccessException empty) {
      return new AdminProfileResponse(
          adminId,
          null,
          "Quản trị viên",
          "",
          "",
          "",
          "Ban Quản trị",
          Instant.now()
      );
    }
  }

  @Transactional
  public AdminProfileResponse updateProfile(UUID adminId, UpdateAdminProfileRequest request) {
    AdminProfileResponse current = getProfile(adminId);
    String fullName = request.fullName() != null ? request.fullName().trim() : current.fullName();
    String phone = request.phone() != null ? request.phone().trim() : current.phone();
    String avatarUrl = request.avatarUrl() != null ? request.avatarUrl().trim() : current.avatarUrl();
    String bio = request.bio() != null ? request.bio().trim() : current.bio();
    String department = request.department() != null ? request.department().trim() : current.department();

    db.update("""
        INSERT INTO admin.admin_profiles(admin_id, full_name, phone, avatar_url, bio, department, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, now())
        ON CONFLICT(admin_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          avatar_url = EXCLUDED.avatar_url,
          bio = EXCLUDED.bio,
          department = EXCLUDED.department,
          updated_at = now()
        """, adminId, fullName, phone, avatarUrl, bio, department);

    return getProfile(adminId);
  }
}
