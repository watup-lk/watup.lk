SET search_path TO community_schema, public;

CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT public.generate_uuid_v7(),
    submission_id UUID NOT NULL,
    user_id UUID NOT NULL,
    vote_type VARCHAR(4) NOT NULL CHECK (vote_type IN ('UP', 'DOWN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_submission_user ON votes (submission_id, user_id);

-- High-performance counter table tailored for asynchronous Kafka updates
DO $$
BEGIN
    IF to_regclass('community_schema.vote_counts') IS NULL
       AND to_regclass('community_schema.submission_vote_counts') IS NOT NULL THEN
        ALTER TABLE community_schema.submission_vote_counts RENAME TO vote_counts;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS vote_counts (
    submission_id UUID PRIMARY KEY,
    up_count INTEGER NOT NULL DEFAULT 0,
    down_count INTEGER NOT NULL DEFAULT 0
);

DO $$
BEGIN
    IF to_regclass('community_schema.submission_vote_counts') IS NOT NULL THEN
        INSERT INTO vote_counts (submission_id, up_count, down_count)
        SELECT submission_id, up_count, down_count
        FROM community_schema.submission_vote_counts
        ON CONFLICT (submission_id) DO UPDATE
        SET up_count = EXCLUDED.up_count,
            down_count = EXCLUDED.down_count;
    END IF;
END $$;
