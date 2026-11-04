ALTER TYPE "CompanyAuditAction" ADD VALUE 'SUSPENDED';
ALTER TYPE "CompanyAuditAction" ADD VALUE 'RESTORED';
ALTER TABLE companies ADD COLUMN is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN suspension_reason varchar(1000);
CREATE INDEX companies_suspended_idx ON companies (is_suspended, id);
CREATE TABLE company_moderation_operations (
  operation_id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_id uuid NOT NULL, suspended boolean NOT NULL, reason varchar(1000) NOT NULL,
  resulting_version integer NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX company_moderation_operations_target_idx ON company_moderation_operations(company_id, created_at);
