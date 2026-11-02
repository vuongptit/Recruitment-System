-- One-off: move chat / notification / video tables out of `public` into their
-- own service schemas. Data, indexes, constraints, FKs and owned sequences move
-- with ALTER TABLE ... SET SCHEMA. The golang-migrate tracking tables move too,
-- so the services see "no change" and will not re-run migrations.
--
-- uuid_generate_v4() defaults (uuid-ossp extension living in public) are
-- replaced with the built-in gen_random_uuid() so nothing depends on public.
--
-- Safe to re-run: IF EXISTS skips tables already moved. Runs in one transaction;
-- if a same-named table already exists in the target schema the whole script
-- rolls back without touching data. Stop the 3 services before running.

BEGIN;

CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS video;

ALTER TABLE IF EXISTS public.chat_schema_migrations          SET SCHEMA chat;
ALTER TABLE IF EXISTS public.conversations                   SET SCHEMA chat;
ALTER TABLE IF EXISTS public.conversation_members            SET SCHEMA chat;
ALTER TABLE IF EXISTS public.messages                        SET SCHEMA chat;

ALTER TABLE IF EXISTS public.notification_schema_migrations  SET SCHEMA notification;
ALTER TABLE IF EXISTS public.notifications                   SET SCHEMA notification;
ALTER TABLE IF EXISTS public.push_tokens                     SET SCHEMA notification;
ALTER TABLE IF EXISTS public.processed_events                SET SCHEMA notification;
ALTER TABLE IF EXISTS public.poison_events                   SET SCHEMA notification;
ALTER TABLE IF EXISTS public.notification_logs               SET SCHEMA notification;
ALTER TABLE IF EXISTS public.notification_settings           SET SCHEMA notification;

ALTER TABLE IF EXISTS public.video_schema_migrations         SET SCHEMA video;
ALTER TABLE IF EXISTS public.video_calls                     SET SCHEMA video;
ALTER TABLE IF EXISTS public.video_call_participants         SET SCHEMA video;

-- Drop the dependency on public.uuid_generate_v4().
ALTER TABLE IF EXISTS chat.conversations              ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE IF EXISTS chat.messages                   ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE IF EXISTS notification.notifications      ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE IF EXISTS notification.notification_logs  ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE IF EXISTS video.video_calls               ALTER COLUMN id SET DEFAULT gen_random_uuid();

COMMIT;

-- Verification
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','chat','notification','video')
ORDER BY 1, 2;
