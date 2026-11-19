CREATE TABLE IF NOT EXISTS admin.system_settings (
  id VARCHAR(50) PRIMARY KEY,
  site_name VARCHAR(100) NOT NULL DEFAULT 'CareerHub',
  site_slogan VARCHAR(255) DEFAULT 'Nền tảng tuyển dụng thông minh',
  site_logo TEXT,
  site_favicon TEXT,
  contact_email VARCHAR(255) DEFAULT 'admin@gmail.com',
  contact_phone VARCHAR(50) DEFAULT '',
  footer_text VARCHAR(255) DEFAULT 'Cùng bạn tiến xa hơn mỗi ngày.',
  allow_user_registration BOOLEAN NOT NULL DEFAULT TRUE,
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID
);

INSERT INTO admin.system_settings (id, site_name, site_slogan, site_logo, site_favicon, contact_email, contact_phone, footer_text)
VALUES ('default', 'CareerHub', 'Nền tảng tuyển dụng thông minh', '', '', 'admin@gmail.com', '', 'Cùng bạn tiến xa hơn mỗi ngày.')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin.admin_profiles (
  admin_id UUID PRIMARY KEY,
  full_name VARCHAR(150),
  phone VARCHAR(50),
  avatar_url TEXT,
  bio VARCHAR(500),
  department VARCHAR(100) DEFAULT 'Ban Quản trị',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
