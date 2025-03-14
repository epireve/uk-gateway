-- Enable the pg_trgm extension for full-text search if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create a table for SIC codes
CREATE TABLE IF NOT EXISTS sic_codes (
    sic_code TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    section TEXT NOT NULL,
    section_title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add table comment
COMMENT ON TABLE sic_codes IS 'Standard Industrial Classification (SIC) codes from Companies House';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS sic_codes_section_idx ON sic_codes (section);

-- Create a regular text search index instead of gin_trgm_ops
CREATE INDEX IF NOT EXISTS sic_codes_description_idx ON sic_codes USING GIN (to_tsvector('english', description));

-- Set RLS policies
ALTER TABLE sic_codes ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY sic_codes_select_policy ON sic_codes 
  FOR SELECT USING (true);

-- Optionally, grant access to anon and authenticated roles
GRANT SELECT ON sic_codes TO anon, authenticated; 