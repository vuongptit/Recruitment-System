CREATE TABLE IF NOT EXISTS interview_event_outbox (
    event_id UUID PRIMARY KEY,
    stream_position BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    interview_id UUID NOT NULL
        REFERENCES interviews(id) ON DELETE RESTRICT,
    aggregate_version BIGINT NOT NULL,
    action VARCHAR(30) NOT NULL,
    topic VARCHAR(100) NOT NULL,
    event_key UUID NOT NULL,
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ(3) NOT NULL,
    lease_owner VARCHAR(64),
    lease_fence BIGINT NOT NULL DEFAULT 0,
    lease_expires_at TIMESTAMPTZ(3),
    published_at TIMESTAMPTZ(3),
    last_error_code VARCHAR(96),
    created_at TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT interview_event_outbox_interview_version_unique
        UNIQUE (interview_id, aggregate_version),
    CONSTRAINT interview_event_outbox_aggregate_version_check CHECK (
        aggregate_version BETWEEN 0 AND 9007199254740991
    ),
    CONSTRAINT interview_event_outbox_action_check CHECK (
        action = 'SCHEDULED'
    ),
    CONSTRAINT interview_event_outbox_topic_check CHECK (
        topic ~ '^[a-z0-9._-]{1,100}$'
        AND topic NOT IN ('.', '..')
    ),
    CONSTRAINT interview_event_outbox_key_check CHECK (
        event_key = interview_id
    ),
    CONSTRAINT interview_event_outbox_attempts_check CHECK (
        attempts >= 0 AND lease_fence >= 0
    ),
    CONSTRAINT interview_event_outbox_lease_check CHECK (
        (lease_owner IS NULL) = (lease_expires_at IS NULL)
    ),
    CONSTRAINT interview_event_outbox_published_lease_check CHECK (
        published_at IS NULL
        OR (lease_owner IS NULL AND lease_expires_at IS NULL)
    ),
    CONSTRAINT interview_event_outbox_error_code_check CHECK (
        last_error_code IS NULL
        OR last_error_code ~ '^[A-Za-z][A-Za-z0-9_.-]{0,95}$'
    ),
    CONSTRAINT interview_event_outbox_payload_check CHECK (
        jsonb_typeof(payload) = 'object'
        AND payload ?& ARRAY[
            'schema_version',
            'event_id',
            'action',
            'interview_id',
            'application_id',
            'candidate_id',
            'interviewer_id',
            'actor_id',
            'round_number',
            'schedule_revision',
            'scheduled_start_at',
            'scheduled_end_at',
            'status',
            'aggregate_version',
            'occurred_at'
        ]
        AND (
            payload - ARRAY[
                'schema_version',
                'event_id',
                'action',
                'interview_id',
                'application_id',
                'candidate_id',
                'interviewer_id',
                'actor_id',
                'round_number',
                'schedule_revision',
                'scheduled_start_at',
                'scheduled_end_at',
                'status',
                'aggregate_version',
                'occurred_at'
            ]
        ) = '{}'::jsonb
        AND payload->'schema_version' = '1'::jsonb
        AND jsonb_typeof(payload->'event_id') = 'string'
        AND payload->>'event_id'
            ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND payload->>'event_id' = event_id::text
        AND jsonb_typeof(payload->'action') = 'string'
        AND payload->>'action' = action
        AND jsonb_typeof(payload->'interview_id') = 'string'
        AND payload->>'interview_id' = interview_id::text
    )
);

CREATE INDEX IF NOT EXISTS interview_event_outbox_unpublished_idx
    ON interview_event_outbox(next_attempt_at, stream_position)
    WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS interview_event_outbox_interview_pending_idx
    ON interview_event_outbox(interview_id, aggregate_version)
    WHERE published_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_interview_event_outbox_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'interview_event_outbox_immutable',
            MESSAGE = 'Interview event outbox rows cannot be deleted';
    END IF;
    IF ROW(
        NEW.event_id,
        NEW.stream_position,
        NEW.interview_id,
        NEW.aggregate_version,
        NEW.action,
        NEW.topic,
        NEW.event_key,
        NEW.payload,
        NEW.created_at
    ) IS DISTINCT FROM ROW(
        OLD.event_id,
        OLD.stream_position,
        OLD.interview_id,
        OLD.aggregate_version,
        OLD.action,
        OLD.topic,
        OLD.event_key,
        OLD.payload,
        OLD.created_at
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'interview_event_outbox_immutable',
            MESSAGE = 'Interview event outbox identity and payload are immutable';
    END IF;
    IF OLD.published_at IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'interview_event_outbox_immutable',
            MESSAGE = 'Published interview event outbox rows are immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interview_event_outbox_immutable_trigger ON interview_event_outbox;
CREATE TRIGGER interview_event_outbox_immutable_trigger
BEFORE UPDATE OR DELETE ON interview_event_outbox
FOR EACH ROW
EXECUTE FUNCTION enforce_interview_event_outbox_immutable();

