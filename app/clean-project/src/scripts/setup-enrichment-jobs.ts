import { supabase } from '../lib/supabase';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupEnrichmentJobsTable() {
  console.log('Setting up enrichment_jobs table...');

  try {
    // Read the SQL file content
    const sqlFilePath = path.join(__dirname, 'create-enrichment-jobs-table.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    // First, check if the table already exists
    const { error: tableCheckError } = await supabase
      .from('enrichment_jobs')
      .select('id')
      .limit(1);
    
    if (tableCheckError && tableCheckError.code === '42P01') {
      console.log('The enrichment_jobs table does not exist. Creating now...');
      
      // Execute the SQL to create the table
      const { error } = await supabase.rpc('exec_sql', { sql: sqlContent });
      
      if (error) {
        console.error('Error creating enrichment_jobs table:', error);
        return false;
      }
      
      console.log('Successfully created enrichment_jobs table!');
      return true;
    } else if (tableCheckError) {
      console.error('Error checking if table exists:', tableCheckError);
      return false;
    } else {
      console.log('The enrichment_jobs table already exists.');
      return true;
    }
  } catch (error) {
    console.error('Error setting up enrichment_jobs table:', error);
    return false;
  }
}

// Create a new table for enrichment log entries
async function setupEnrichmentLogsTable() {
  console.log('Setting up enrichment_logs table...');

  try {
    // SQL to create the logs table
    const createLogsTableSQL = `
      CREATE TABLE IF NOT EXISTS enrichment_logs (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES enrichment_jobs(id),
        log_level TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        metadata JSONB
      );
      
      CREATE INDEX IF NOT EXISTS idx_enrichment_logs_job_id ON enrichment_logs(job_id);
      CREATE INDEX IF NOT EXISTS idx_enrichment_logs_timestamp ON enrichment_logs(timestamp);
      
      ALTER TABLE enrichment_logs ENABLE ROW LEVEL SECURITY;
      
      COMMENT ON TABLE enrichment_logs IS 'Table to store logs from data enrichment processes';
    `;

    // Execute the SQL to create the logs table
    const { error } = await supabase.rpc('exec_sql', { sql: createLogsTableSQL });
    
    if (error) {
      console.error('Error creating enrichment_logs table:', error);
      return false;
    }
    
    console.log('Successfully set up enrichment_logs table!');
    return true;
  } catch (error) {
    console.error('Error setting up enrichment_logs table:', error);
    return false;
  }
}

// Main function to run both setups
async function main() {
  const jobsTableSuccess = await setupEnrichmentJobsTable();
  const logsTableSuccess = await setupEnrichmentLogsTable();
  
  if (jobsTableSuccess && logsTableSuccess) {
    console.log('✅ All tables set up successfully!');
    process.exit(0);
  } else {
    console.error('❌ Failed to set up one or more tables.');
    process.exit(1);
  }
}

// Run the main function
main(); 