SET search_path TO salary_schema, public;

CREATE TABLE IF NOT EXISTS submissions (
    id               UUID PRIMARY KEY DEFAULT public.generate_uuid_v7(),
    role             TEXT NOT NULL,
    company          TEXT,
    country          TEXT NOT NULL DEFAULT 'LK',
    city             TEXT,
    salary_amount    NUMERIC(14,2) NOT NULL,
    currency         VARCHAR(3) NOT NULL DEFAULT 'LKR',
    experience_years INT,
    experience_level VARCHAR(20) CHECK (experience_level IN ('junior','mid','senior','lead','principal')),
    work_type        VARCHAR(10) CHECK (work_type IN ('Remote','Hybrid','Onsite')),
    is_anonymized    BOOLEAN NOT NULL DEFAULT FALSE,
    status           VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_status           ON submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_role             ON submissions (role);
CREATE INDEX IF NOT EXISTS idx_submissions_company          ON submissions (company);
CREATE INDEX IF NOT EXISTS idx_submissions_country          ON submissions (country);
CREATE INDEX IF NOT EXISTS idx_submissions_experience_level ON submissions (experience_level);

CREATE INDEX IF NOT EXISTS idx_submissions_fts ON submissions
    USING gin(to_tsvector('english', coalesce(role,'') || ' ' || coalesce(company,'')));

-- ── Seed data (APPROVED entries for search/stats testing) ─────────────────────
INSERT INTO submissions (role, company, country, city, salary_amount, currency, experience_years, experience_level, work_type, is_anonymized, status) VALUES
('Software Engineer',        'WSO2',             'LK', 'Colombo',    185000,  'LKR', 3,  'mid',       'Hybrid',  false, 'APPROVED'),
('Software Engineer',        'Dialog Axiata',    'LK', 'Colombo',    160000,  'LKR', 2,  'junior',    'Onsite',  false, 'APPROVED'),
('Senior Software Engineer', 'Sysco LABS',       'LK', 'Colombo',    320000,  'LKR', 6,  'senior',    'Hybrid',  false, 'APPROVED'),
('Senior Software Engineer', 'IFS',              'LK', 'Colombo',    300000,  'LKR', 5,  'senior',    'Onsite',  false, 'APPROVED'),
('DevOps Engineer',          'WSO2',             'LK', 'Colombo',    270000,  'LKR', 4,  'mid',       'Remote',  false, 'APPROVED'),
('Data Engineer',            'PickMe',           'LK', 'Colombo',    210000,  'LKR', 3,  'mid',       'Hybrid',  false, 'APPROVED'),
('Frontend Developer',       'Rootcode Labs',    'LK', 'Colombo',    145000,  'LKR', 2,  'junior',    'Onsite',  false, 'APPROVED'),
('Backend Developer',        'Arimac',           'LK', 'Colombo',    175000,  'LKR', 3,  'mid',       'Hybrid',  false, 'APPROVED'),
('Lead Engineer',            'Axiata Digital',   'LK', 'Colombo',    450000,  'LKR', 8,  'lead',      'Hybrid',  false, 'APPROVED'),
('QA Engineer',              '99x',              'LK', 'Colombo',    130000,  'LKR', 2,  'junior',    'Onsite',  false, 'APPROVED'),
('Software Engineer',        NULL,               'LK', 'Kandy',      155000,  'LKR', 2,  'junior',    'Remote',  true,  'APPROVED'),
('Principal Engineer',       'Wiley',            'LK', 'Colombo',    620000,  'LKR', 12, 'principal', 'Remote',  false, 'APPROVED'),
('Data Scientist',           'Dialog Axiata',    'LK', 'Colombo',    280000,  'LKR', 4,  'mid',       'Hybrid',  false, 'APPROVED'),
('Software Engineer',        'Cambio',           'LK', 'Colombo',    195000,  'LKR', 3,  'mid',       'Onsite',  false, 'APPROVED'),
('Cloud Architect',          'WSO2',             'LK', 'Colombo',    520000,  'LKR', 9,  'principal', 'Remote',  false, 'APPROVED'),
('Mobile Developer',         'PickMe',           'LK', 'Colombo',    190000,  'LKR', 3,  'mid',       'Hybrid',  false, 'APPROVED'),
('Senior DevOps Engineer',   'IFS',              'LK', 'Colombo',    380000,  'LKR', 7,  'senior',    'Onsite',  false, 'APPROVED'),
('Software Engineer',        'Millennium IT ESP','LK', 'Colombo',    170000,  'LKR', 2,  'junior',    'Onsite',  false, 'APPROVED'),
('Tech Lead',                'Sysco LABS',       'LK', 'Colombo',    480000,  'LKR', 9,  'lead',      'Hybrid',  false, 'APPROVED'),
('Backend Developer',        NULL,               'LK', 'Colombo',    165000,  'LKR', 2,  'junior',    'Remote',  true,  'APPROVED'),
-- A few PENDING entries to confirm search filters them out
('Software Engineer',        'Startup XYZ',      'LK', 'Colombo',    120000,  'LKR', 1,  'junior',    'Onsite',  false, 'PENDING'),
('Senior Engineer',          'NewCo',            'LK', 'Colombo',    350000,  'LKR', 6,  'senior',    'Remote',  false, 'PENDING');
