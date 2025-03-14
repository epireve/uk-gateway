import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { 
  EnrichedCompanySchema, 
  EnrichedCompany, 
  CompanyProfileSchema 
} from '../lib/models';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Validate environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'COMPANIES_HOUSE_API_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} environment variable is not set`);
    process.exit(1);
  }
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Companies House API configuration
const companiesHouseApiKey = process.env.COMPANIES_HOUSE_API_KEY!;
const companiesHouseBaseUrl = 'https://api.company-information.service.gov.uk';

// Set up logging directory
const logDir = path.join(process.cwd(), 'logs');
fs.ensureDirSync(logDir);

// Generate datestamped log filenames
const currentDate = new Date().toISOString().split('T')[0];
const processLogFile = path.join(logDir, `enrichment-process-${currentDate}.log`);
const successLogFile = path.join(logDir, `successful-enrichment-${currentDate}.log`);
const failedLogFile = path.join(logDir, `failed-enrichment-${currentDate}.log`);

// Batch and rate limit settings
const BATCH_SIZE = 100;
const RATE_LIMIT = process.env.API_RATE_LIMIT 
  ? parseInt(process.env.API_RATE_LIMIT) 
  : 600; // Default to 600 per 5 minutes
const WINDOW_SIZE = 5 * 60 * 1000; // 5 minutes in milliseconds
const DELAY_BETWEEN_REQUESTS = 500; // ms

// Create logger function
function logToFile(filePath: string, data: any) {
  const timestamp = new Date().toISOString();
  const logEntry = typeof data === 'string' 
    ? `${timestamp} - ${data}\n` 
    : `${timestamp} - ${JSON.stringify(data)}\n`;
  
  fs.appendFileSync(filePath, logEntry);
}

// Log process start
logToFile(processLogFile, `Starting data enrichment process`);
console.log(`Starting data enrichment process. Logs will be saved to ${logDir}`);

// Utility function to chunk array into batches
function chunk<T>(array: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(array.length / size) },
    (_, index) => array.slice(index * size, (index + 1) * size)
  );
}

// Function to search for a company in Companies House
async function searchCompany(companyName: string) {
  try {
    const response = await axios.get(
      `${companiesHouseBaseUrl}/search/companies`,
      {
        params: {
          q: companyName,
        },
        auth: {
          username: companiesHouseApiKey,
          password: '',
        },
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    return response.data.items?.[0] || null;
  } catch (error: any) {
    const statusCode = error.response?.status;
    logToFile(failedLogFile, {
      companyName,
      error: error.message,
      httpStatus: statusCode,
      action: 'search',
      timestamp: new Date().toISOString(),
    });

    if (statusCode === 429) {
      // Rate limit exceeded
      throw new Error(`Rate limit exceeded when searching for ${companyName}`);
    }

    console.error(`Error searching for company ${companyName}:`, error.message);
    return null;
  }
}

// Function to get company profile from Companies House
async function getCompanyProfile(companyNumber: string) {
  try {
    const response = await axios.get(
      `${companiesHouseBaseUrl}/company/${companyNumber}`,
      {
        auth: {
          username: companiesHouseApiKey,
          password: '',
        },
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    // Validate the response against our schema
    return CompanyProfileSchema.parse(response.data);
  } catch (error: any) {
    const statusCode = error.response?.status;
    logToFile(failedLogFile, {
      companyNumber,
      error: error.message,
      httpStatus: statusCode,
      action: 'profile',
      timestamp: new Date().toISOString(),
    });

    if (statusCode === 429) {
      // Rate limit exceeded
      throw new Error(`Rate limit exceeded when fetching profile for ${companyNumber}`);
    }

    console.error(`Error fetching company profile for ${companyNumber}:`, error.message);
    return null;
  }
}

// Main function to process companies with rate limiting
async function processCompaniesWithRateLimit() {
  // Get companies that need enrichment from Supabase
  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .is('company_number', null) // Select only records that haven't been enriched
    .limit(10000); // Adjust as needed

  if (error) {
    console.error('Error fetching companies from Supabase:', error.message);
    logToFile(processLogFile, `Error fetching companies: ${error.message}`);
    return;
  }

  if (!companies || companies.length === 0) {
    console.log('No companies found that need enrichment');
    logToFile(processLogFile, 'No companies found that need enrichment');
    return;
  }

  console.log(`Found ${companies.length} companies to enrich`);
  logToFile(processLogFile, `Found ${companies.length} companies to enrich`);

  // Initialize statistics
  const stats = {
    total: companies.length,
    successful: 0,
    failed: 0,
    startTime: Date.now(),
    endTime: 0,
    apiCallsMade: 0,
  };

  // Track rate limit window
  let requestCount = 0;
  let windowStartTime = Date.now();

  // Process in batches
  const batches = chunk(companies, BATCH_SIZE);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    logToFile(processLogFile, `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} companies)`);
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} companies)`);
    
    // Check if we need to reset the rate limit window
    if (Date.now() - windowStartTime > WINDOW_SIZE) {
      requestCount = 0;
      windowStartTime = Date.now();
      logToFile(processLogFile, 'Rate limit window reset');
    }
    
    // Check if we're approaching the rate limit
    if (requestCount + batch.length * 2 > RATE_LIMIT) { // *2 because we do search + profile
      const timeToWait = WINDOW_SIZE - (Date.now() - windowStartTime) + 1000; // Add 1s buffer
      logToFile(processLogFile, `Rate limit approaching: Waiting ${timeToWait/1000} seconds`);
      console.log(`Rate limit approaching: Waiting ${timeToWait/1000} seconds`);
      await new Promise(resolve => setTimeout(resolve, timeToWait));
      requestCount = 0;
      windowStartTime = Date.now();
    }
    
    // Process each company in the batch
    for (const company of batch) {
      try {
        // Step 1: Search for the company
        const searchResult = await searchCompany(company.original_name);
        requestCount++;
        stats.apiCallsMade++;
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
        
        if (!searchResult) {
          logToFile(failedLogFile, {
            companyId: company.id,
            companyName: company.original_name,
            error: 'No search results found',
            timestamp: new Date().toISOString(),
            retryCount: 0,
          });
          stats.failed++;
          continue;
        }
        
        // Step 2: Get detailed company profile
        const profile = await getCompanyProfile(searchResult.company_number);
        requestCount++;
        stats.apiCallsMade++;
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
        
        if (!profile) {
          logToFile(failedLogFile, {
            companyId: company.id,
            companyName: company.original_name,
            companyNumber: searchResult.company_number,
            error: 'Failed to fetch company profile',
            timestamp: new Date().toISOString(),
            retryCount: 0,
          });
          stats.failed++;
          continue;
        }
        
        // Step 3: Update the company record in Supabase with enriched data
        const enrichedData: Partial<EnrichedCompany> = {
          company_name: profile.company_name,
          company_number: profile.company_number,
          company_status: profile.company_status || null,
          company_type: profile.type || null,
          date_of_creation: profile.date_of_creation || null,
          address: profile.registered_office_address || null,
          sic_codes: profile.sic_codes || null,
          raw_json: profile,
          jurisdiction: profile.jurisdiction || null,
          accounts_info: profile.accounts || null,
          confirmation_statement_info: profile.confirmation_statement || null,
          has_been_liquidated: profile.has_been_liquidated || null,
          has_charges: profile.has_charges || null,
          has_insolvency_history: profile.has_insolvency_history || null,
          registered_office_is_in_dispute: profile.registered_office_is_in_dispute || null,
          undeliverable_registered_office_address: profile.undeliverable_registered_office_address || null,
          has_super_secure_pscs: profile.has_super_secure_pscs || null,
          etag: profile.etag || null,
          enrichment_date: new Date().toISOString(),
        };
        
        const { error: updateError } = await supabase
          .from('companies')
          .update(enrichedData)
          .eq('id', company.id);
        
        if (updateError) {
          logToFile(failedLogFile, {
            companyId: company.id,
            companyName: company.original_name,
            error: `Failed to update Supabase: ${updateError.message}`,
            timestamp: new Date().toISOString(),
            retryCount: 0,
          });
          stats.failed++;
          continue;
        }
        
        // Log success
        logToFile(successLogFile, {
          companyId: company.id,
          companyName: company.original_name,
          companyNumber: profile.company_number,
          timestamp: new Date().toISOString(),
        });
        
        stats.successful++;
        
      } catch (error: any) {
        if (error.message.includes('Rate limit exceeded')) {
          // Wait for rate limit window to reset
          const timeToWait = WINDOW_SIZE + 1000; // Full window + 1s buffer
          logToFile(processLogFile, `Rate limit exceeded: Waiting ${timeToWait/1000} seconds`);
          console.log(`Rate limit exceeded: Waiting ${timeToWait/1000} seconds`);
          await new Promise(resolve => setTimeout(resolve, timeToWait));
          requestCount = 0;
          windowStartTime = Date.now();
          
          // Push the company back to the end of this batch to retry
          batch.push(company);
        } else {
          logToFile(failedLogFile, {
            companyId: company.id,
            companyName: company.original_name,
            error: `Unexpected error: ${error.message}`,
            timestamp: new Date().toISOString(),
            retryCount: 0,
          });
          stats.failed++;
        }
      }
    }
    
    // Add a delay between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Update statistics and log completion
  stats.endTime = Date.now();
  const durationMinutes = (stats.endTime - stats.startTime) / (1000 * 60);
  
  const summaryMessage = `
    Data enrichment complete.
    Total: ${stats.total} companies
    Successful: ${stats.successful} companies
    Failed: ${stats.failed} companies
    API calls made: ${stats.apiCallsMade}
    Duration: ${durationMinutes.toFixed(2)} minutes
  `;
  
  console.log(summaryMessage);
  logToFile(processLogFile, summaryMessage);
  
  // Save detailed report
  const reportFile = path.join(logDir, `enrichment-report-${currentDate}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    date: currentDate,
    stats: {
      total: stats.total,
      successful: stats.successful,
      failed: stats.failed,
      apiCallsMade: stats.apiCallsMade,
      durationMs: stats.endTime - stats.startTime,
      durationMinutes: durationMinutes,
    },
    rateLimitSettings: {
      batchSize: BATCH_SIZE,
      rateLimit: RATE_LIMIT,
      windowSizeMs: WINDOW_SIZE,
      delayBetweenRequestsMs: DELAY_BETWEEN_REQUESTS,
    }
  }, null, 2));
  
  // Save failed records to Supabase for later reprocessing
  await saveFailedRecordsToSupabase();
}

// Function to save failed records to Supabase
async function saveFailedRecordsToSupabase() {
  try {
    const failedContent = fs.readFileSync(failedLogFile, 'utf8');
    const failedEntries = failedContent
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        const parts = line.split(' - ');
        if (parts.length !== 2) return null;
        
        try {
          const timestamp = parts[0];
          const data = JSON.parse(parts[1]);
          return {
            company_id: data.companyId,
            company_name: data.companyName,
            error_message: data.error,
            http_status: data.httpStatus || null,
            retry_count: data.retryCount || 0,
            timestamp: timestamp,
            created_at: new Date().toISOString(),
          };
        } catch (e) {
          return null;
        }
      })
      .filter(entry => entry !== null);
    
    if (failedEntries.length > 0) {
      // Check if failed_enrichments table exists
      const { error: tableCheckError } = await supabase
        .from('failed_enrichments')
        .select('id')
        .limit(1);
      
      // Create table if it doesn't exist
      if (tableCheckError) {
        const { error: createTableError } = await supabase.rpc('create_failed_enrichments_table');
        if (createTableError) {
          console.error('Error creating failed_enrichments table:', createTableError.message);
          return;
        }
      }
      
      // Insert failed entries
      const { error: insertError } = await supabase
        .from('failed_enrichments')
        .insert(failedEntries);
      
      if (insertError) {
        console.error('Error saving failed records to Supabase:', insertError.message);
      } else {
        console.log(`Saved ${failedEntries.length} failed records to Supabase for reprocessing`);
        logToFile(processLogFile, `Saved ${failedEntries.length} failed records to Supabase for reprocessing`);
      }
    }
  } catch (error: any) {
    console.error('Error processing failed records:', error.message);
  }
}

// Execute the main process
processCompaniesWithRateLimit()
  .then(() => {
    console.log('Data enrichment process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error in data enrichment process:', error);
    logToFile(processLogFile, `Fatal error: ${error.message}`);
    process.exit(1);
  }); 