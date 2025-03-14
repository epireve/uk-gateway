import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { 
  CompanyProfileSchema,
  EnrichedCompany
} from '../lib/models';

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
const processLogFile = path.join(logDir, `reprocess-failed-${currentDate}.log`);
const successLogFile = path.join(logDir, `reprocess-success-${currentDate}.log`);
const failedLogFile = path.join(logDir, `reprocess-failed-${currentDate}.log`);

// Batch and rate limit settings
const BATCH_SIZE = 50; // Smaller batch size for reprocessing
const RATE_LIMIT = process.env.API_RATE_LIMIT 
  ? parseInt(process.env.API_RATE_LIMIT) 
  : 600; // Default to 600 per 5 minutes
const WINDOW_SIZE = 5 * 60 * 1000; // 5 minutes in milliseconds
const DELAY_BETWEEN_REQUESTS = 500; // ms
const MAX_RETRY_COUNT = 5;

// Create logger function
function logToFile(filePath: string, data: any) {
  const timestamp = new Date().toISOString();
  const logEntry = typeof data === 'string' 
    ? `${timestamp} - ${data}\n` 
    : `${timestamp} - ${JSON.stringify(data)}\n`;
  
  fs.appendFileSync(filePath, logEntry);
}

// Log process start
logToFile(processLogFile, `Starting failed records reprocessing`);
console.log(`Starting failed records reprocessing. Logs will be saved to ${logDir}`);

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
    
    if (statusCode === 429) {
      // Rate limit exceeded
      throw new Error(`Rate limit exceeded when fetching profile for ${companyNumber}`);
    }

    console.error(`Error fetching company profile for ${companyNumber}:`, error.message);
    return null;
  }
}

// Function to collect failed records from Supabase and log files
async function collectFailedRecords() {
  const failedRecords = new Map<string, any>();
  
  // Get records from Supabase
  const { data: failedFromDb, error } = await supabase
    .from('failed_enrichments')
    .select('*')
    .lt('retry_count', MAX_RETRY_COUNT) // Only get records that haven't exceeded retry limit
    .order('retry_count', { ascending: true })
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching failed records from Supabase:', error.message);
    logToFile(processLogFile, `Error fetching failed records: ${error.message}`);
  } else if (failedFromDb && failedFromDb.length > 0) {
    console.log(`Found ${failedFromDb.length} failed records in Supabase`);
    
    for (const record of failedFromDb) {
      failedRecords.set(record.company_id, {
        id: record.company_id,
        name: record.company_name,
        retryCount: record.retry_count,
        source: 'db',
        dbRecordId: record.id
      });
    }
  }
  
  // Get recent failed log files (last 7 days)
  const recentDates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    recentDates.push(date.toISOString().split('T')[0]);
  }
  
  // Read from log files
  for (const date of recentDates) {
    const logFile = path.join(logDir, `failed-enrichment-${date}.log`);
    
    if (fs.existsSync(logFile)) {
      try {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        
        console.log(`Found ${lines.length} log entries in ${logFile}`);
        
        for (const line of lines) {
          try {
            const parts = line.split(' - ');
            if (parts.length === 2) {
              const data = JSON.parse(parts[1]);
              
              // Only add if not already in the map or if the record from logs has a lower retry count
              const existingRecord = failedRecords.get(data.companyId);
              if (!existingRecord || existingRecord.retryCount > (data.retryCount || 0)) {
                failedRecords.set(data.companyId, {
                  id: data.companyId,
                  name: data.companyName,
                  retryCount: data.retryCount || 0,
                  source: 'log'
                });
              }
            }
          } catch (e) {
            // Skip malformed log entries
          }
        }
      } catch (e) {
        console.error(`Error reading log file ${logFile}:`, e);
      }
    }
  }
  
  // Convert map to array and sort by retry count (ascending)
  const recordsArray = Array.from(failedRecords.values()).sort((a, b) => a.retryCount - b.retryCount);
  
  console.log(`Collected ${recordsArray.length} unique failed records for reprocessing`);
  logToFile(processLogFile, `Collected ${recordsArray.length} unique failed records for reprocessing`);
  
  return recordsArray;
}

// Function to reprocess failed records with rate limiting
async function reprocessFailedRecords() {
  // Get all failed records
  const failedRecords = await collectFailedRecords();
  
  if (failedRecords.length === 0) {
    console.log('No failed records to reprocess');
    logToFile(processLogFile, 'No failed records to reprocess');
    return;
  }
  
  // Initialize statistics
  const stats = {
    total: failedRecords.length,
    successful: 0,
    failed: 0,
    startTime: Date.now(),
    endTime: 0,
    apiCallsMade: 0,
  };
  
  // Track rate limit window
  let requestCount = 0;
  let windowStartTime = Date.now();
  
  // Process in batches with smaller batch size for retries
  const batches = [];
  for (let i = 0; i < failedRecords.length; i += BATCH_SIZE) {
    batches.push(failedRecords.slice(i, i + BATCH_SIZE));
  }
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    logToFile(processLogFile, `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`);
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`);
    
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
    
    // Process each record in the batch with exponential backoff based on retry count
    for (const record of batch) {
      try {
        // Get the company from Supabase to make sure it still needs enrichment
        const { data: company, error } = await supabase
          .from('companies')
          .select('*')
          .eq('id', record.id)
          .is('company_number', null) // Still not enriched
          .single();
        
        if (error || !company) {
          console.log(`Skipping company ${record.id} - already enriched or not found`);
          continue;
        }
        
        // Add exponential backoff based on retry count (0.5s, 1s, 2s, 4s, 8s)
        const backoffDelay = Math.min(8000, 500 * Math.pow(2, record.retryCount));
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        // Step 1: Search for the company
        const searchResult = await searchCompany(record.name);
        requestCount++;
        stats.apiCallsMade++;
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
        
        if (!searchResult) {
          await updateRetryCount(record);
          logToFile(failedLogFile, {
            companyId: record.id,
            companyName: record.name,
            error: 'No search results found',
            timestamp: new Date().toISOString(),
            retryCount: record.retryCount + 1,
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
          await updateRetryCount(record);
          logToFile(failedLogFile, {
            companyId: record.id,
            companyName: record.name,
            companyNumber: searchResult.company_number,
            error: 'Failed to fetch company profile',
            timestamp: new Date().toISOString(),
            retryCount: record.retryCount + 1,
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
          address: profile.registered_office_address as any || null,
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
          .eq('id', record.id);
        
        if (updateError) {
          await updateRetryCount(record);
          logToFile(failedLogFile, {
            companyId: record.id,
            companyName: record.name,
            error: `Failed to update Supabase: ${updateError.message}`,
            timestamp: new Date().toISOString(),
            retryCount: record.retryCount + 1,
          });
          stats.failed++;
          continue;
        }
        
        // If we got here, the record was successfully reprocessed
        // Remove it from the failed_enrichments table if it came from there
        if (record.source === 'db' && record.dbRecordId) {
          await supabase
            .from('failed_enrichments')
            .delete()
            .eq('id', record.dbRecordId);
        }
        
        // Log success
        logToFile(successLogFile, {
          companyId: record.id,
          companyName: record.name,
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
          
          // Push the record back to the end of this batch to retry
          batch.push(record);
        } else {
          await updateRetryCount(record);
          logToFile(failedLogFile, {
            companyId: record.id,
            companyName: record.name,
            error: `Unexpected error: ${error.message}`,
            timestamp: new Date().toISOString(),
            retryCount: record.retryCount + 1,
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
    Reprocessing complete.
    Total: ${stats.total} records
    Successful: ${stats.successful} records
    Failed: ${stats.failed} records
    API calls made: ${stats.apiCallsMade}
    Duration: ${durationMinutes.toFixed(2)} minutes
  `;
  
  console.log(summaryMessage);
  logToFile(processLogFile, summaryMessage);
  
  // Save detailed report
  const reportFile = path.join(logDir, `reprocessing-report-${currentDate}.json`);
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
}

// Helper function to update retry count for a failed record
async function updateRetryCount(record: any) {
  if (record.source === 'db' && record.dbRecordId) {
    await supabase
      .from('failed_enrichments')
      .update({ 
        retry_count: record.retryCount + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', record.dbRecordId);
  }
}

// Execute the reprocessing
reprocessFailedRecords()
  .then(() => {
    console.log('Reprocessing completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error in reprocessing:', error);
    logToFile(processLogFile, `Fatal error: ${error.message}`);
    process.exit(1);
  }); 