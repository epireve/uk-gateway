import * as dotenv from 'dotenv';
import { supabase } from '../lib/supabase';

// Load environment variables
dotenv.config();

/**
 * Initialize Supabase tables for storing company data
 */
async function initSupabase() {
  try {
    console.log('Initializing Supabase tables...');
    
    // Check if the table already exists
    const { error: tableCheckError } = await supabase
      .from('companies')
      .select('id')
      .limit(1);
      
    if (!tableCheckError) {
      console.log('Companies table already exists.');
      return;
    }
    
    // Create the companies table if it doesn't exist
    const { error: createError } = await supabase.rpc('create_companies_table', {
      sql_query: `
        CREATE TABLE companies (
          id UUID PRIMARY KEY,
          original_name TEXT NOT NULL UNIQUE,
          company_name TEXT,
          company_number TEXT,
          company_status TEXT,
          company_type TEXT,
          date_of_creation TEXT,
          address JSONB,
          sic_codes TEXT[],
          town_city TEXT,
          county TEXT,
          type_rating TEXT,
          route TEXT,
          -- New fields for enhanced data capture
          raw_json JSONB,
          jurisdiction TEXT,
          accounts_info JSONB,
          confirmation_statement_info JSONB,
          foreign_company_details_info JSONB,
          links_info JSONB,
          service_address_info JSONB,
          has_been_liquidated BOOLEAN,
          has_charges BOOLEAN,
          has_insolvency_history BOOLEAN,
          registered_office_is_in_dispute BOOLEAN,
          undeliverable_registered_office_address BOOLEAN,
          has_super_secure_pscs BOOLEAN,
          etag TEXT,
          external_registration_number TEXT,
          last_full_members_list_date TEXT,
          enrichment_date TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
        
        CREATE INDEX idx_company_name ON companies (company_name);
        CREATE INDEX idx_company_number ON companies (company_number);
        CREATE INDEX idx_original_name ON companies (original_name);
      `
    });
    
    if (createError) {
      if (createError.message.includes('function "create_companies_table" does not exist')) {
        console.error('Error: The create_companies_table function does not exist in your Supabase instance.');
        console.log('Please set up the "create_companies_table" function in your Supabase SQL editor:');
        console.log(`
CREATE OR REPLACE FUNCTION create_companies_table(sql_query TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
        `);
      } else {
        console.error('Error creating companies table:', createError);
      }
      return;
    }
    
    console.log('Companies table created successfully!');
    
    // Create indexes for better search performance
    const { error: indexError } = await supabase.rpc('create_indexes', {
      sql_query: `
        CREATE INDEX idx_company_status ON companies (company_status);
        CREATE INDEX idx_company_type ON companies (company_type);
        CREATE INDEX idx_town_city ON companies (town_city);
        CREATE INDEX idx_county ON companies (county);
        CREATE INDEX idx_jurisdiction ON companies (jurisdiction);
        CREATE INDEX idx_enrichment_date ON companies (enrichment_date);
      `
    });
    
    if (indexError) {
      console.error('Error creating indexes:', indexError);
      return;
    }
    
    console.log('Indexes created successfully!');
    console.log('Supabase initialization complete!');
    
  } catch (error) {
    console.error('Error in Supabase initialization:', error);
  }
}

// Execute the initialization function
initSupabase().catch(console.error); 