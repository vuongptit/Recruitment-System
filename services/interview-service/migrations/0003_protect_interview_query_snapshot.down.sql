DROP TRIGGER IF EXISTS interviews_snapshot_immutable_trigger ON interviews;
DROP FUNCTION IF EXISTS enforce_interview_snapshot_immutable();
DROP INDEX IF EXISTS interviews_company_job_calendar_v3_idx;

