SET search_path TO community_schema, public;

CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT public.generate_uuid_v7(),
    submission_id UUID NOT NULL,
    user_id UUID NOT NULL,
    vote_type VARCHAR(4) NOT NULL CHECK (vote_type IN ('UP', 'DOWN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Typically you'd want each user to have only one vote per submission
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_submission_user ON votes (submission_id, user_id);

-- High-performance counter table tailored for asynchronous Kafka updates
CREATE TABLE IF NOT EXISTS submission_vote_counts (
    submission_id UUID PRIMARY KEY,
    up_count INTEGER NOT NULL DEFAULT 0,
    down_count INTEGER NOT NULL DEFAULT 0
);
