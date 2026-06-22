-- Migration: Create upskilling tables
-- Module 4: Career Roadmap & Learning Engine
-- Requirements: 2.1, 2.2, 4.1, 4.2, 4.3, 4.9, 6.1, 6.3, 6.4, 7.5, 7.6

-- =============================================================================
-- Table: upskilling_project_suggestions
-- Stores AI-generated portfolio project suggestions owned by a user
-- =============================================================================

CREATE TABLE upskilling_project_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  target_role varchar(100) NOT NULL,
  title varchar(150) NOT NULL CHECK (char_length(title) >= 3),
  description varchar(1000) NOT NULL CHECK (char_length(description) >= 50),
  demonstrated_skills text[] NOT NULL
    CHECK (array_length(demonstrated_skills, 1) BETWEEN 1 AND 10),
  difficulty text NOT NULL CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
  estimated_effort_hours integer NOT NULL CHECK (estimated_effort_hours BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- List-sort index: user's suggestions by created_at DESC, then id ASC (Requirement 2.2)
CREATE INDEX idx_upskilling_suggestions_user_created_id
  ON upskilling_project_suggestions (user_id, created_at DESC, id ASC);

-- =============================================================================
-- Table: upskilling_roadmaps
-- Stores a persisted career-transition plan owned by a user
-- =============================================================================

CREATE TABLE upskilling_roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  "current_role" varchar(100) NOT NULL,
  target_role varchar(100) NOT NULL,
  target_duration_months integer NOT NULL CHECK (target_duration_months BETWEEN 1 AND 36),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- List-sort index: user's roadmaps by created_at DESC (Requirement 4.3)
CREATE INDEX idx_upskilling_roadmaps_user_created
  ON upskilling_roadmaps (user_id, created_at DESC);

-- =============================================================================
-- Table: upskilling_milestones
-- Ordered steps within a roadmap; cascade-deleted with the parent roadmap
-- =============================================================================

CREATE TABLE upskilling_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES upskilling_roadmaps(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 1),
  title varchar(150) NOT NULL CHECK (char_length(title) >= 1),
  description varchar(1000) NOT NULL CHECK (char_length(description) >= 20),
  skills text[] NOT NULL DEFAULT '{}'
    CHECK (coalesce(array_length(skills, 1), 0) <= 10),
  estimated_duration_weeks integer NOT NULL CHECK (estimated_duration_weeks BETWEEN 1 AND 156),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  UNIQUE (roadmap_id, sequence)
);

-- Index for fetching a roadmap's milestones in sequence order
CREATE INDEX idx_upskilling_milestones_roadmap_sequence
  ON upskilling_milestones (roadmap_id, sequence ASC);

-- =============================================================================
-- Table: upskilling_saved_courses
-- Bookmarked course/certificate recommendations owned by a user
-- =============================================================================

CREATE TABLE upskilling_saved_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title varchar(150) NOT NULL,
  provider varchar(100) NOT NULL,
  url varchar(2048) NOT NULL,
  normalized_url varchar(2048) NOT NULL,
  cost text NOT NULL CHECK (cost IN ('Free', 'Paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, normalized_url)
);

-- List-sort index: user's saved courses by created_at DESC, then url ASC (Requirement 6.3)
CREATE INDEX idx_upskilling_saved_courses_user_created_url
  ON upskilling_saved_courses (user_id, created_at DESC, url ASC);

-- =============================================================================
-- Row Level Security (RLS) — Requirement 7.6
-- =============================================================================

ALTER TABLE upskilling_project_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE upskilling_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE upskilling_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE upskilling_saved_courses ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- upskilling_project_suggestions policies (owner-scoped: auth.uid() = user_id)
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can read own project suggestions"
  ON upskilling_project_suggestions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project suggestions"
  ON upskilling_project_suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project suggestions"
  ON upskilling_project_suggestions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own project suggestions"
  ON upskilling_project_suggestions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- upskilling_roadmaps policies (owner-scoped: auth.uid() = user_id)
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can read own roadmaps"
  ON upskilling_roadmaps
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own roadmaps"
  ON upskilling_roadmaps
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own roadmaps"
  ON upskilling_roadmaps
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own roadmaps"
  ON upskilling_roadmaps
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- upskilling_milestones policies (parent-scoped via roadmap's user_id)
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can read milestones of own roadmaps"
  ON upskilling_milestones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM upskilling_roadmaps
      WHERE upskilling_roadmaps.id = upskilling_milestones.roadmap_id
        AND upskilling_roadmaps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert milestones for own roadmaps"
  ON upskilling_milestones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM upskilling_roadmaps
      WHERE upskilling_roadmaps.id = upskilling_milestones.roadmap_id
        AND upskilling_roadmaps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update milestones of own roadmaps"
  ON upskilling_milestones
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM upskilling_roadmaps
      WHERE upskilling_roadmaps.id = upskilling_milestones.roadmap_id
        AND upskilling_roadmaps.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM upskilling_roadmaps
      WHERE upskilling_roadmaps.id = upskilling_milestones.roadmap_id
        AND upskilling_roadmaps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete milestones of own roadmaps"
  ON upskilling_milestones
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM upskilling_roadmaps
      WHERE upskilling_roadmaps.id = upskilling_milestones.roadmap_id
        AND upskilling_roadmaps.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- upskilling_saved_courses policies (owner-scoped: auth.uid() = user_id)
-- ---------------------------------------------------------------------------

CREATE POLICY "Users can read own saved courses"
  ON upskilling_saved_courses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved courses"
  ON upskilling_saved_courses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved courses"
  ON upskilling_saved_courses
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved courses"
  ON upskilling_saved_courses
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
