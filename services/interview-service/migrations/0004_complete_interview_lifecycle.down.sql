DROP TABLE IF EXISTS interview_feedbacks CASCADE;
ALTER TABLE interviews
    DROP COLUMN IF EXISTS room_url,
    DROP COLUMN IF EXISTS reschedule_reason,
    DROP COLUMN IF EXISTS reschedule_preferred_slots,
    DROP COLUMN IF EXISTS reminder_sent_at;

