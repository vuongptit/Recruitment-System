DROP TRIGGER IF EXISTS interview_event_outbox_immutable_trigger ON interview_event_outbox;
DROP FUNCTION IF EXISTS enforce_interview_event_outbox_immutable();
DROP TABLE IF EXISTS interview_event_outbox CASCADE;

