-- Migration: Create jobsearch tables
-- Requirements: 1.1, 3.1, 4.2, 5.5

-- =============================================================================
-- Table: jobsearch_listings
-- Stores scraped job listing records with deduplication support
-- =============================================================================

CREATE TABLE jobsearch_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(255) NOT NULL,
  company varchar(255) NOT NULL,
  location varchar(255) NOT NULL,
  work_mode text NOT NULL CHECK (work_mode IN ('Remote', 'Hybrid', 'Onsite')),
  description varchar(5000),
  source_urls text[] NOT NULL DEFAULT '{}',
  salary_min numeric CHECK (salary_min >= 0 AND salary_min <= 999999999),
  salary_max numeric CHECK (salary_max >= 0 AND salary_max <= 999999999),
  date_posted timestamptz NOT NULL,
  date_scraped timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Composite index for deduplication lookups (company + title + location)
CREATE INDEX idx_listings_company_title_location
  ON jobsearch_listings (company, title, location);

-- Index for work_mode filter queries
CREATE INDEX idx_listings_work_mode
  ON jobsearch_listings (work_mode);

-- Index for default sort by date_posted descending
CREATE INDEX idx_listings_date_posted_desc
  ON jobsearch_listings (date_posted DESC);

-- =============================================================================
-- Table: jobsearch_applications
-- Tracks a user's job applications across lifecycle stages
-- =============================================================================

CREATE TABLE jobsearch_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  listing_id uuid NOT NULL REFERENCES jobsearch_listings(id),
  stage text NOT NULL DEFAULT 'Wishlist' CHECK (stage IN ('Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected')),
  notes varchar(2000),
  date_added timestamptz NOT NULL DEFAULT now(),
  date_stage_changed timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

-- Index for Kanban column queries (user + stage)
CREATE INDEX idx_applications_user_stage
  ON jobsearch_applications (user_id, stage);

-- Index for sorting within columns by date_stage_changed descending
CREATE INDEX idx_applications_date_stage_changed_desc
  ON jobsearch_applications (date_stage_changed DESC);

-- =============================================================================
-- Table: jobsearch_stage_history
-- Records stage transitions for application timeline display
-- =============================================================================

CREATE TABLE jobsearch_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES jobsearch_applications(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected')),
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE jobsearch_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobsearch_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobsearch_stage_history ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- jobsearch_listings policies
-- Read: all authenticated users
-- Write: service-role only (for ingestion)
-- ---------------------------------------------------------------------------

CREATE POLICY "Authenticated users can read listings"
  ON jobsearch_listings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert listings"
  ON jobsearch_listings
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update listings"
  ON jobsearch_listings
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- jobsearch_applications policies
-- Users can only read/write their own applications
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can read own applications"
  ON jobsearch_applications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
  ON jobsearch_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
  ON jobsearch_applications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications"
  ON jobsearch_applications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- jobsearch_stage_history policies
-- Accessible only through the parent application's user ownership
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can read own application stage history"
  ON jobsearch_stage_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobsearch_applications
      WHERE jobsearch_applications.id = jobsearch_stage_history.application_id
        AND jobsearch_applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert stage history for own applications"
  ON jobsearch_stage_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobsearch_applications
      WHERE jobsearch_applications.id = jobsearch_stage_history.application_id
        AND jobsearch_applications.user_id = auth.uid()
    )
  );
