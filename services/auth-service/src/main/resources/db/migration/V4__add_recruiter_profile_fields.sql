ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS recruiter_avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS recruiter_position VARCHAR(160),
    ADD COLUMN IF NOT EXISTS recruiter_bio VARCHAR(500);
