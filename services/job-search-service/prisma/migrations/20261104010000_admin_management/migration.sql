ALTER TABLE jobs ADD COLUMN is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN suspension_reason varchar(1000);
CREATE INDEX jobs_suspended_idx ON jobs (is_suspended, id);
CREATE TABLE job_moderation_operations (
  operation_id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_id uuid NOT NULL, suspended boolean NOT NULL, reason varchar(1000) NOT NULL,
  resulting_version integer NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX job_moderation_operations_target_idx ON job_moderation_operations(job_id, created_at);
