import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import { searchCompanies, getCompanyProfile } from '../lib/companies-house-api';
import { supabase } from '../lib/supabase';
import { CompanyCsv, CompanyCsvSchema, EnrichedCompany } from '../lib/models';

// Load environment variables
dotenv.config();

// Path to CSV file
const CSV_FILE_PATH = path.resolve(__dirname, '../../data/companies.csv');

// Sleep function to avoid hitting API rate limits
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Process a single company by searching the Companies House API and getting company details
 */
async function processCompany(company: CompanyCsv): Promise<EnrichedCompany | null> {
  try {
    const orgName = company['Organisation Name'];
    console.log(`Processing company: ${orgName}`);
    
    // Search for company by name
    const searchResults = await searchCompanies(orgName);
    
    // If no results found, return basic info
    if (!searchResults.items || searchResults.items.length === 0) {
      console.log(`No companies found for: ${orgName}`);
      return {
        id: uuidv4(),
        original_name: orgName,
        town_city: company['Town/City'] || null,
        county: company['County'] || null,
        type_rating: company['Type & Rating'] || null,
        route: company['Route'] || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        enrichment_date: new Date().toISOString(),
      };
    }
    
    // Get the first (most relevant) search result
    const firstResult = searchResults.items[0];
    
    // Get detailed company profile if company number is available
    let companyProfile = null;
    if (firstResult.company_number) {
      try {
        companyProfile = await getCompanyProfile(firstResult.company_number);
        // Wait to avoid hitting rate limits
        await sleep(200);
      } catch (error) {
        console.error(`Error getting company profile for ${firstResult.company_number}:`, error);
      }
    }
    
    // Current timestamp for data enrichment
    const now = new Date().toISOString();
    
    // If we have a company profile, use it to build the enriched company data
    if (companyProfile) {
      // Combine data from search result and detailed company profile
      const enrichedCompany: EnrichedCompany = {
        id: uuidv4(),
        original_name: orgName,
        company_name: companyProfile.company_name,
        company_number: companyProfile.company_number,
        company_status: companyProfile.company_status || null,
        company_type: companyProfile.type || null,
        date_of_creation: companyProfile.date_of_creation || null,
        address: companyProfile.registered_office_address || firstResult.address || undefined,
        sic_codes: companyProfile.sic_codes || null,
        town_city: company['Town/City'] || null,
        county: company['County'] || null,
        type_rating: company['Type & Rating'] || null,
        route: company['Route'] || null,
        created_at: now,
        updated_at: now,
        enrichment_date: now,
        
        // Store the entire raw JSON for future reference
        raw_json: companyProfile as Record<string, unknown>,
        
        // Store additional detailed fields
        jurisdiction: companyProfile.jurisdiction || null,
        accounts_info: companyProfile.accounts || null,
        confirmation_statement_info: companyProfile.confirmation_statement || null,
        foreign_company_details_info: companyProfile.foreign_company_details || null,
        links_info: companyProfile.links || null,
        service_address_info: companyProfile.service_address || null,
        has_been_liquidated: companyProfile.has_been_liquidated || null,
        has_charges: companyProfile.has_charges || null,
        has_insolvency_history: companyProfile.has_insolvency_history || null,
        registered_office_is_in_dispute: companyProfile.registered_office_is_in_dispute || null,
        undeliverable_registered_office_address: companyProfile.undeliverable_registered_office_address || null,
        has_super_secure_pscs: companyProfile.has_super_secure_pscs || null,
        etag: companyProfile.etag || null,
        external_registration_number: companyProfile.external_registration_number || null,
        last_full_members_list_date: companyProfile.last_full_members_list_date || null,
      };
      
      return enrichedCompany;
    } else {
      // If we only have search results but no detailed profile, use the search result data
      return {
        id: uuidv4(),
        original_name: orgName,
        company_name: firstResult.company_name,
        company_number: firstResult.company_number,
        company_status: firstResult.company_status || null,
        company_type: firstResult.company_type || null,
        date_of_creation: firstResult.date_of_creation || null,
        address: firstResult.address,
        sic_codes: firstResult.sic_codes || null,
        town_city: company['Town/City'] || null,
        county: company['County'] || null,
        type_rating: company['Type & Rating'] || null,
        route: company['Route'] || null,
        created_at: now,
        updated_at: now,
        enrichment_date: now,
        
        // Store the entire raw JSON for future reference
        raw_json: firstResult as Record<string, unknown>,
      };
    }
  } catch (error) {
    console.error(`Error processing company ${company['Organisation Name']}:`, error);
    return null;
  }
}

/**
 * Main function to process the CSV file and store data in Supabase
 */
async function main() {
  try {
    console.log('Starting CSV processing...');
    
    // Read CSV file
    const csvData = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
    const companies: CompanyCsv[] = [];
    
    // Parse CSV
    await new Promise<void>((resolve, reject) => {
      const stream = Readable.from(csvData)
        .pipe(csvParser({ headers: true }));
      
      stream.on('data', (row: Record<string, string>) => {
        try {
          // Validate the row against our schema
          const validatedRow = CompanyCsvSchema.parse(row);
          companies.push(validatedRow);
        } catch (error) {
          console.error('Error parsing row:', row, error);
        }
      });
      
      stream.on('end', () => {
        console.log(`Parsed ${companies.length} companies from CSV.`);
        resolve();
      });
      
      stream.on('error', reject);
    });
    
    // Process companies in batches to avoid overwhelming the API
    const BATCH_SIZE = 10;
    let processedCount = 0;
    const enrichedCompanies: EnrichedCompany[] = [];
    
    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
      const batch = companies.slice(i, i + BATCH_SIZE);
      
      // Process batch concurrently
      const batchResults = await Promise.all(
        batch.map(company => processCompany(company))
      );
      
      // Filter out null results and add to enriched companies
      const validResults = batchResults.filter(
        (result): result is EnrichedCompany => result !== null
      );
      enrichedCompanies.push(...validResults);
      
      processedCount += batch.length;
      console.log(`Processed ${processedCount}/${companies.length} companies...`);
      
      // Wait between batches to avoid hitting rate limits
      await sleep(1000);
    }
    
    // Store enriched companies in Supabase
    console.log(`Storing ${enrichedCompanies.length} enriched companies in Supabase...`);
    const SUPABASE_BATCH_SIZE = 100;
    
    for (let i = 0; i < enrichedCompanies.length; i += SUPABASE_BATCH_SIZE) {
      const batch = enrichedCompanies.slice(i, i + SUPABASE_BATCH_SIZE);
      
      const { error } = await supabase
        .from('companies')
        .upsert(batch, { onConflict: 'original_name' });
      
      if (error) {
        console.error('Error inserting into Supabase:', error);
      } else {
        console.log(`Successfully stored batch ${i / SUPABASE_BATCH_SIZE + 1}/${Math.ceil(enrichedCompanies.length / SUPABASE_BATCH_SIZE)}`);
      }
      
      // Brief pause between Supabase batches
      await sleep(500);
    }
    
    console.log('CSV processing complete!');
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Execute main function
main().catch(console.error); 