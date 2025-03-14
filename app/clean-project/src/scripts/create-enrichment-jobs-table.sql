-- This SQL script creates the enrichment_jobs table to track and coordinate enrichment processes
-- It's used by the data enrichment processes to manage job status and coordination

-- First, check if the table exists to avoid errors
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  -- Primary key for the job
  id SERIAL PRIMARY KEY,
  
  -- Type of job: 'reprocess_failed' or 'enrich_remaining'
  job_type TEXT NOT NULL,
  
  -- Status of the job: 'pending', 'processing', 'completed', 'failed'
  status TEXT NOT NULL,
  
  -- When the job was created
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- When the job was started processing
  started_at TIMESTAMP WITH TIME ZONE,
  
  -- When the job completed or failed
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Results or error message
  result TEXT,
  
  -- Number of items processed successfully
  items_processed INTEGER DEFAULT 0,
  
  -- Number of items that failed processing
  items_failed INTEGER DEFAULT 0,
  
  -- Any additional metadata as JSON
  metadata JSONB
);

-- Create an index on status and job_type for faster queries
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON enrichment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_type ON enrichment_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_created_at ON enrichment_jobs(created_at);

-- Grant appropriate permissions
ALTER TABLE enrichment_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE enrichment_jobs IS 'Table to track and coordinate data enrichment jobs'; 