import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CompanyCsv, CompanyCsvSchema } from '../lib/models';

// Load environment variables
dotenv.config();

// Supabase client setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Path to CSV file
const CSV_FILE_PATH = path.resolve(__dirname, '../../data/companies.csv');

// Sleep function to avoid overwhelming the database
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Main function to load CSV data directly to Supabase
 */
async function main() {
  try {
    console.log('Starting CSV loading to Supabase...');
    
    if (!fs.existsSync(CSV_FILE_PATH)) {
      console.error(`CSV file not found at path: ${CSV_FILE_PATH}`);
      return;
    }
    
    console.log(`Reading CSV file from: ${CSV_FILE_PATH}`);
    
    // Create an array to hold valid company data
    const companies: CompanyCsv[] = [];
    
    // Parse CSV
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(CSV_FILE_PATH)
        .pipe(csvParser({
          mapHeaders: ({ header }) => header.trim(), // Trim whitespace from headers
          mapValues: ({ value }) => value.trim() // Trim whitespace from values
        }))
        .on('data', (row: Record<string, string>) => {
          try {
            // Try to construct an object with the expected schema keys
            const mappedRow = {
              'Organisation Name': row['Organisation Name'],
              'Town/City': row['Town/City'] || null,
              'County': row['County'] || null,
              'Type & Rating': row['Type & Rating'] || null,
              'Route': row['Route'] || null,
            };
            
            // Validate the mapped row against our schema
            const validatedRow = CompanyCsvSchema.parse(mappedRow);
            companies.push(validatedRow);
          } catch (error) {
            console.error('Error parsing row:', row, error);
          }
        })
        .on('end', () => {
          console.log(`Parsed ${companies.length} companies from CSV.`);
          resolve();
        })
        .on('error', (error) => {
          console.error('Error reading CSV file:', error);
          reject(error);
        });
    });
    
    if (companies.length === 0) {
      console.log('No valid companies found in CSV. Exiting.');
      return;
    }
    
    // Prepare data for Supabase insert
    const supabaseData = companies.map(company => {
      const now = new Date().toISOString();
      
      return {
        id: uuidv4(),
        original_name: company['Organisation Name'],
        company_name: company['Organisation Name'], // Using original name initially
        town_city: company['Town/City'] || null,
        county: company['County'] || null,
        type_rating: company['Type & Rating'] || null,
        route: company['Route'] || null,
        created_at: now,
        updated_at: now,
        enrichment_date: null, // Will be set after API enrichment
      };
    });
    
    // Store data in Supabase in batches
    console.log(`Storing ${supabaseData.length} companies in Supabase...`);
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < supabaseData.length; i += BATCH_SIZE) {
      const batch = supabaseData.slice(i, i + BATCH_SIZE);
      
      // Use simple insert instead of upsert with onConflict
      const { error } = await supabase
        .from('companies')
        .insert(batch);
      
      if (error) {
        console.error('Error inserting into Supabase:', error);
      } else {
        console.log(`Successfully stored batch ${i / BATCH_SIZE + 1}/${Math.ceil(supabaseData.length / BATCH_SIZE)}`);
      }
      
      // Brief pause between batches
      await sleep(500);
    }
    
    console.log('CSV loading to Supabase complete!');
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Execute main function
main().catch(console.error); 