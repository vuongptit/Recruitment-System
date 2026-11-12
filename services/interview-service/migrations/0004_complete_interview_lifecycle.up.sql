ALTER TABLE interviews
    ADD COLUMN IF NOT EXISTS room_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS reschedule_reason VARCHAR(500),
    ADD COLUMN IF NOT EXISTS reschedule_preferred_slots JSONB,
    ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ(3);

CREATE TABLE IF NOT EXISTS interview_feedbacks (
    id UUID PRIMARY KEY,
    interview_id UUID NOT NULL UNIQUE
        REFERENCES interviews(id) ON DELETE RESTRICT,
    evaluator_id UUID NOT NULL,
    criteria_scores JSONB NOT NULL,
    overall_score NUMERIC(4,2) NOT NULL,
    comment VARCHAR(4000) NOT NULL,
    conclusion VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT interview_feedbacks_overall_score_check CHECK (
        overall_score >= 1 AND overall_score <= 10
    ),
    CONSTRAINT interview_feedbacks_comment_check CHECK (
        comment = btrim(comment)
        AND comment <> ''
        AND comment !~ '[[:cntrl:]]'
    ),
    CONSTRAINT interview_feedbacks_conclusion_check CHECK (
        conclusion IN ('PASS', 'FAIL', 'NEXT_ROUND')
    )
);

ALTER TABLE interview_event_outbox
    DROP CONSTRAINT IF EXISTS interview_event_outbox_action_check;

ALTER TABLE interview_event_outbox
    ADD CONSTRAINT interview_event_outbox_action_check CHECK (
        action IN (
            'SCHEDULED',
            'CONFIRMED',
            'RESCHEDULE_REQUESTED',
            'RESCHEDULED',
            'IN_PROGRESS',
            'COMPLETED',
            'CANCELLED',
            'NO_SHOW',
            'REMINDER'
        )
    );

ALTER TABLE interview_event_outbox
    DROP CONSTRAINT IF EXISTS interview_event_outbox_payload_check;

ALTER TABLE interview_event_outbox
    ADD CONSTRAINT interview_event_outbox_payload_check CHECK (
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
    );

