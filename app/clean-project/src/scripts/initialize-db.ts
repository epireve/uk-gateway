import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create a Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Create the companies table in Supabase if it doesn't exist
 */
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Check if the table exists
    const { error } = await supabase
      .from('companies')
      .select('id')
      .limit(1);
      
    if (!error) {
      console.log('Table "companies" already exists. No initialization needed.');
      return;
    }
    
    // Create the companies table using Supabase REST API
    console.log('Creating "companies" table...');
    
    const { error: createError } = await supabase
      .from('companies')
      .insert([{ 
        id: '00000000-0000-0000-0000-000000000000',
        original_name: 'INITIALIZATION PLACEHOLDER',
        company_name: 'INITIALIZATION PLACEHOLDER',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select();
    
    if (createError) {
      console.error('Error creating table:', createError);
      return;
    }
    
    // Remove the placeholder record
    const { error: deleteError } = await supabase
      .from('companies')
      .delete()
      .eq('id', '00000000-0000-0000-0000-000000000000');
    
    if (deleteError) {
      console.warn('Warning: Could not delete placeholder record:', deleteError);
    }
    
    console.log('Database initialized successfully!');
    
  } catch (error) {
    console.error('Error in database initialization:', error);
  }
}

// Run the initialization
initializeDatabase().catch(console.error); 