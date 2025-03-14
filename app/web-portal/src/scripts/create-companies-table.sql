-- Drop the table if it exists (be careful with this in production!)
DROP TABLE IF EXISTS companies;

-- Create the companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  original_name TEXT NOT NULL UNIQUE,
  company_name TEXT,
  company_number TEXT,
  company_status TEXT,
  company_type TEXT,
  date_of_creation TEXT,
  
  -- Address components
  address JSONB,
  town_city TEXT,
  county TEXT,
  
  -- Original CSV data fields
  type_rating TEXT,
  route TEXT,
  
  -- API enrichment fields
  jurisdiction TEXT,
  accounts_info JSONB,
  confirmation_statement_info JSONB,
  foreign_company_details_info JSONB,
  links_info JSONB,
  service_address_info JSONB,
  
  -- Boolean flags
  has_been_liquidated BOOLEAN,
  has_charges BOOLEAN,
  has_insolvency_history BOOLEAN,
  registered_office_is_in_dispute BOOLEAN,
  undeliverable_registered_office_address BOOLEAN,
  has_super_secure_pscs BOOLEAN,
  
  -- Additional fields
  etag TEXT,
  external_registration_number TEXT,
  last_full_members_list_date TEXT,
  sic_codes TEXT[],
  raw_json JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  enrichment_date TIMESTAMP WITH TIME ZONE
);

-- Create an index on original_name for faster lookups and to help with upsert operations
CREATE INDEX idx_companies_original_name ON companies (original_name);

-- Create an index on company_name for search operations
CREATE INDEX idx_companies_company_name ON companies (company_name);

-- Create a search index if using Supabase full-text search
CREATE INDEX idx_companies_name_search ON companies USING GIN (to_tsvector('english', coalesce(company_name, '') || ' ' || coalesce(original_name, '')));

-- Add a comment to the table
COMMENT ON TABLE companies IS 'UK Companies data imported from CSV and enriched with Companies House API data'; 