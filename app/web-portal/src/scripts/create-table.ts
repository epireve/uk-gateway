import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create a Supabase client with the service role key (needed for running SQL)
const supabase = createClient(supabaseUrl, supabaseKey);

async function createTable() {
  try {
    console.log('Reading SQL file...');
    const sqlPath = path.resolve(__dirname, './create-companies-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Creating companies table in Supabase...');
    const { error } = await supabase.rpc('pgrest_exec', { query: sql });
    
    if (error) {
      console.error('Error creating table:', error);
      
      // If the first approach fails, try the REST API method
      console.log('Trying alternative method to create table...');
      
      // Split the SQL into statements
      const statements = sql
        .split(';')
        .filter(statement => statement.trim().length > 0)
        .map(statement => statement.trim() + ';');
      
      for (const statement of statements) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        const { error } = await supabase.rpc('pgrest_exec', { query: statement });
        if (error) {
          console.error('Error executing statement:', error);
        }
      }
    } else {
      console.log('Table created successfully!');
    }
  } catch (error) {
    console.error('Error creating table:', error);
    console.log('');
    console.log('IMPORTANT: You may need to manually create the table in the Supabase dashboard.');
    console.log('Use the SQL provided in src/scripts/create-companies-table.sql');
    console.log('');
  }
}

// Execute the function
createTable().catch(console.error); 