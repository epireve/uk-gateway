-- Create the failed_enrichments table for tracking and reprocessing failed records
CREATE TABLE IF NOT EXISTS failed_enrichments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  error_message TEXT NOT NULL,
  http_status INTEGER,
  retry_count INTEGER DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function to create the table if it doesn't exist
CREATE OR REPLACE FUNCTION create_failed_enrichments_table() RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS failed_enrichments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL,
    company_name TEXT NOT NULL,
    error_message TEXT NOT NULL,
    http_status INTEGER,
    retry_count INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  
  RETURN;
END;
$$ LANGUAGE plpgsql; 