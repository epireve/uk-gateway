import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import { 
  EnrichedCompany
} from '../lib/models';
import { getKeyManager } from '../lib/key-manager';

// Load environment variables
dotenv.config();

// Validate environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'COMPANIES_HOUSE_API_KEYS'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} environment variable is not set`);
    process.exit(1);
  }
}

// Get API keys from environment variables
const apiKeys = process.env.COMPANIES_HOUSE_API_KEYS!.split(',').map(key => key.trim());
if (apiKeys.length === 0) {
  console.error('Error: No API keys provided in COMPANIES_HOUSE_API_KEYS');
  process.exit(1);
}
  
// Initialize key manager
const keyManager = getKeyManager(apiKeys);
console.log(`Initialized key manager with ${apiKeys.length} API keys`);

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Companies House API configuration
const companiesHouseBaseUrl = 'https://api.company-information.service.gov.uk';

// Set up logging directory
const logDir = path.join(process.cwd(), 'logs');
fs.ensureDirSync(logDir);

// Generate datestamped log filenames
const currentDate = new Date().toISOString().split('T')[0];
const processLogFile = path.join(logDir, `reprocess-failed-${currentDate}.log`);
const successLogFile = path.join(logDir, `reprocess-success-${currentDate}.log`);
const failedLogFile = path.join(logDir, `reprocess-failed-${currentDate}.log`);

// Concurrency and rate limit settings
const BATCH_SIZE = 50; // Smaller batch size for reprocessing
const DELAY_BETWEEN_REQUESTS = 500; // ms
const MAX_RETRY_COUNT = 5;
const CONCURRENCY_LIMIT = process.env.CONCURRENCY_LIMIT 
  ? parseInt(process.env.CONCURRENCY_LIMIT) 
  : Math.min(3, apiKeys.length * 2); // Default to 3 or double the number of keys, whichever is smaller

console.log(`Using concurrency limit of ${CONCURRENCY_LIMIT}`);

// Create logger function
function logToFile(filePath: string, data: unknown): void {
  const timestamp = new Date().toISOString();
  const logEntry = typeof data === 'string' 
    ? `${timestamp} - ${data}\n` 
    : `${timestamp} - ${JSON.stringify(data)}\n`;
  
  fs.appendFileSync(filePath, logEntry);
}

// Log process start
logToFile(processLogFile, `Starting failed records reprocessing with ${apiKeys.length} API keys and concurrency ${CONCURRENCY_LIMIT}`);
console.log(`Starting failed records reprocessing. Logs will be saved to ${logDir}`);

// Function to search for a company in Companies House with key rotation
async function searchCompany(companyName: string) {
  // Get the next available API key
  const apiKey = keyManager.getNextKey();
  
  try {
    const response = await axios.get(
      `${companiesHouseBaseUrl}/search/companies`,
      {
        params: {
          q: companyName,
        },
        auth: {
          username: apiKey,
          password: '',
        },
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    // Register successful request with key manager
    keyManager.registerRequest(apiKey);
    
    return response.data.items?.[0] || null;
  } catch (error: unknown) {
    const errorObj = error as Error & { response?: { status?: number } };
    const statusCode = errorObj.response?.status;
    logToFile(failedLogFile, {
      companyName,
      error: errorObj.message,
      httpStatus: statusCode,
      action: 'search',
      timestamp: new Date().toISOString(),
      apiKey: apiKey.substring(0, 8) + '...',
    });

    // Still register the request with key manager even if it failed
    keyManager.registerRequest(apiKey);
    
    if (statusCode === 429) {
      // Rate limit exceeded for this key
      throw new Error(`Rate limit exceeded when searching for ${companyName}`);
    }

    console.error(`Error searching for company ${companyName}:`, errorObj.message);
    return null;
  }
}

// Function to get company profile from Companies House with key rotation
async function getCompanyProfile(companyNumber: string) {
  // Get the next available API key
  const apiKey = keyManager.getNextKey();
  
  try {
    const response = await axios.get(
      `${companiesHouseBaseUrl}/company/${companyNumber}`,
      {
        auth: {
          username: apiKey,
          password: '',
        },
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    // Register successful request with key manager
    keyManager.registerRequest(apiKey);
    
    // Return the full response to ensure we capture all fields
    return response.data;
  } catch (error: unknown) {
    const errorObj = error as Error & { response?: { status?: number } };
    const statusCode = errorObj.response?.status;
    logToFile(failedLogFile, {
      companyNumber,
      error: errorObj.message,
      httpStatus: statusCode,
      action: 'profile',
      timestamp: new Date().toISOString(),
      apiKey: apiKey.substring(0, 8) + '...',
    });

    // Still register the request with key manager even if it failed
    keyManager.registerRequest(apiKey);
    
    if (statusCode === 429) {
      // Rate limit exceeded for this key
      throw new Error(`Rate limit exceeded when fetching profile for ${companyNumber}`);
    }

    console.error(`Error fetching company profile for ${companyNumber}:`, errorObj.message);
    return null;
  }
}

// Define a type for the failed record
interface FailedRecord {
  id: string;
  name: string;
  retryCount: number;
  source: 'db' | 'log';
  dbRecordId?: string;
}

// Function to collect failed records from Supabase and log files
async function collectFailedRecords(): Promise<FailedRecord[]> {
  const failedRecords = new Map<string, FailedRecord>();
  
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
          } catch (_) {
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

// Function to process a single failed record
async function processFailedRecord(record: FailedRecord, stats: { 
  successful: number; 
  failed: number;
  apiCallsMade: number;
}) {
  try {
    // Get company details from Supabase
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', record.id)
      .single();
    
    if (companyError) {
      console.error(`Error fetching company ${record.id}:`, companyError.message);
      logToFile(failedLogFile, {
        companyId: record.id,
        companyName: record.name,
        error: `Failed to fetch from Supabase: ${companyError.message}`,
        timestamp: new Date().toISOString(),
        retryCount: record.retryCount + 1,
      });
      stats.failed++;
      return;
    }
    
    if (!company) {
      logToFile(failedLogFile, {
        companyId: record.id,
        companyName: record.name,
        error: 'Company not found in database',
        timestamp: new Date().toISOString(),
        retryCount: record.retryCount + 1,
      });
      stats.failed++;
      return;
    }
    
    // Step 1: Search for the company
    const searchResult = await searchCompany(company.original_name);
    stats.apiCallsMade++;
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    
    if (!searchResult) {
      // Update retry count in failed_enrichments
      if (record.source === 'db') {
        await supabase
          .from('failed_enrichments')
          .update({ retry_count: record.retryCount + 1 })
          .eq('id', record.dbRecordId);
      }
      
      logToFile(failedLogFile, {
        companyId: record.id,
        companyName: record.name,
        error: 'No search results found after retry',
        timestamp: new Date().toISOString(),
        retryCount: record.retryCount + 1,
      });
      stats.failed++;
      return;
    }
    
    // Step 2: Get detailed company profile
    const profile = await getCompanyProfile(searchResult.company_number);
    stats.apiCallsMade++;
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    
    if (!profile) {
      // Update retry count in failed_enrichments
      if (record.source === 'db') {
        await supabase
          .from('failed_enrichments')
          .update({ retry_count: record.retryCount + 1 })
          .eq('id', record.dbRecordId);
      }
      
      logToFile(failedLogFile, {
        companyId: record.id,
        companyName: record.name,
        companyNumber: searchResult.company_number,
        error: 'Failed to fetch company profile after retry',
        timestamp: new Date().toISOString(),
        retryCount: record.retryCount + 1,
      });
      stats.failed++;
      return;
    }
    
    // Step 3: Update the company record in Supabase with enriched data
    // Create a base enrichment object with the fields we know about
    const enrichedData: Partial<EnrichedCompany> = {
      company_name: profile.company_name,
      company_number: profile.company_number,
      company_status: profile.company_status || null,
      company_type: profile.type || null,
      date_of_creation: profile.date_of_creation || null,
      address: profile.registered_office_address || null,
      sic_codes: profile.sic_codes || null,
      raw_json: profile, // Store the entire raw JSON response
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
      additional_fields: {},
    };
    
    // Add any additional fields from the profile that might not be in our schema
    for (const [key, value] of Object.entries(profile)) {
      if (!(key in enrichedData) && key !== 'raw_json') {
        // Store additional fields
        enrichedData.additional_fields![key] = value;
      }
    }
    
    const { error: updateError } = await supabase
      .from('companies')
      .update(enrichedData)
      .eq('id', record.id);
    
    if (updateError) {
      // Update retry count in failed_enrichments
      if (record.source === 'db') {
        await supabase
          .from('failed_enrichments')
          .update({ retry_count: record.retryCount + 1 })
          .eq('id', record.dbRecordId);
      }
      
      logToFile(failedLogFile, {
        companyId: record.id,
        companyName: record.name,
        error: `Failed to update Supabase: ${updateError.message}`,
        timestamp: new Date().toISOString(),
        retryCount: record.retryCount + 1,
      });
      stats.failed++;
      return;
    }
    
    // Log success
    logToFile(successLogFile, {
      companyId: record.id,
      companyName: record.name,
      companyNumber: profile.company_number,
      timestamp: new Date().toISOString(),
      previousRetryCount: record.retryCount,
    });
    
    // Remove from failed_enrichments table if it was from there
    if (record.source === 'db') {
      await supabase
        .from('failed_enrichments')
        .delete()
        .eq('id', record.dbRecordId);
    }
    
    stats.successful++;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('Rate limit exceeded')) {
      // Individual key rate limit, throw to be handled by the batch processor
      throw error;
    } else {
      // Update retry count in failed_enrichments
      if (record.source === 'db') {
        await supabase
          .from('failed_enrichments')
          .update({ 
            retry_count: record.retryCount + 1,
            error_message: `Retry error: ${errorMessage}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', record.dbRecordId);
      }
      
      logToFile(failedLogFile, {
        companyId: record.id,
        companyName: record.name,
        error: `Unexpected error during retry: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        retryCount: record.retryCount + 1,
      });
      stats.failed++;
    }
  }
}

// Function to reprocess failed records with concurrency and rate limiting
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
  
  // Process in batches with smaller batch size for retries
  const batches = [];
  for (let i = 0; i < failedRecords.length; i += BATCH_SIZE) {
    batches.push(failedRecords.slice(i, i + BATCH_SIZE));
  }
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    logToFile(processLogFile, `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`);
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`);
    
    // Log key usage statistics
    const keyStats = keyManager.getStats();
    logToFile(processLogFile, { keyUsageStats: keyStats });
    console.log('Current key usage:', keyStats.map(k => `${k.key.substring(0, 8)}...: ${k.usagePercent}% (${k.requestCount} calls)`).join(', '));
    
    // Check if all keys are approaching their limits
    if (keyManager.areAllKeysExhausted()) {
      const waitTime = keyManager.getWaitTimeMs() + 1000; // Add 1s buffer
      logToFile(processLogFile, `All keys approaching rate limits. Waiting ${waitTime/1000} seconds`);
      console.log(`All keys approaching rate limits. Waiting ${waitTime/1000} seconds`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Create a concurrency limiter
    const limit = pLimit(CONCURRENCY_LIMIT);
    
    // Array to store unprocessed records for retry
    const retryRecords: FailedRecord[] = [];
    
    // Process batch with concurrency
    await Promise.all(
      batch.map(record =>
        limit(() => processFailedRecord(record, stats).catch(error => {
          // If rate limit error, add to retry array
          if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
            logToFile(processLogFile, `Rate limit for one key exceeded when processing ${record.name}, adding to retry queue`);
            retryRecords.push(record);
          } else {
            // Log other unexpected errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Update retry count in failed_enrichments
            if (record.source === 'db') {
              void supabase
                .from('failed_enrichments')
                .update({ 
                  retry_count: record.retryCount + 1,
                  error_message: `Concurrent processing error: ${errorMessage}`,
                  updated_at: new Date().toISOString()
                })
                .eq('id', record.dbRecordId);
            }
            
            logToFile(failedLogFile, {
              companyId: record.id,
              companyName: record.name,
              error: `Unexpected error in concurrent processing: ${errorMessage}`,
              timestamp: new Date().toISOString(),
              retryCount: record.retryCount + 1,
            });
            stats.failed++;
          }
        }))
      )
    );
    
    // If there are records to retry, wait for key refresh and retry them sequentially
    if (retryRecords.length > 0) {
      logToFile(processLogFile, `Need to retry ${retryRecords.length} records due to rate limits`);
      console.log(`Need to retry ${retryRecords.length} records due to rate limits`);
      
      // If all keys are exhausted, wait for reset
      if (keyManager.areAllKeysExhausted()) {
        const waitTime = keyManager.getWaitTimeMs() + 1000; // Add 1s buffer
        logToFile(processLogFile, `All keys exhausted before retry. Waiting ${waitTime/1000} seconds`);
        console.log(`All keys exhausted before retry. Waiting ${waitTime/1000} seconds`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Process retries sequentially with higher delays
      for (const record of retryRecords) {
        try {
          await processFailedRecord(record, stats);
          // Add extra delay for retries
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS * 2));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Update retry count in failed_enrichments
          if (record.source === 'db') {
            await supabase
              .from('failed_enrichments')
              .update({ 
                retry_count: record.retryCount + 1,
                error_message: `Retry error: ${errorMessage}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', record.dbRecordId);
          }
          
          logToFile(failedLogFile, {
            companyId: record.id,
            companyName: record.name,
            error: `Failed during retry: ${errorMessage}`,
            timestamp: new Date().toISOString(),
            retryCount: record.retryCount + 1,
          });
          stats.failed++;
        }
      }
    }
    
    // Add a delay between batches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Update statistics and log completion
  stats.endTime = Date.now();
  const durationMinutes = (stats.endTime - stats.startTime) / (1000 * 60);
  
  const summaryMessage = `
    Reprocessing complete.
    Total: ${stats.total} failed records
    Successfully reprocessed: ${stats.successful} records
    Failed again: ${stats.failed} records
    API calls made: ${stats.apiCallsMade}
    Duration: ${durationMinutes.toFixed(2)} minutes
  `;
  
  console.log(summaryMessage);
  logToFile(processLogFile, summaryMessage);
  
  // Log final key usage
  const finalKeyStats = keyManager.getStats();
  logToFile(processLogFile, { finalKeyUsageStats: finalKeyStats });
  console.log('Final key usage:', finalKeyStats.map(k => `${k.key.substring(0, 8)}...: ${k.usagePercent}% (${k.requestCount} calls)`).join(', '));
  
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
      keyUsage: keyManager.getStats()
    },
    batchSize: BATCH_SIZE,
    concurrencyLimit: CONCURRENCY_LIMIT,
    delayBetweenRequestsMs: DELAY_BETWEEN_REQUESTS,
    maxRetryCount: MAX_RETRY_COUNT
  }, null, 2));
}

// Execute the main process
reprocessFailedRecords()
  .then(() => {
    console.log('Reprocessing of failed records completed');
    process.exit(0);
  })
  .catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Fatal error in reprocessing:', errorMessage);
    logToFile(processLogFile, `Fatal error: ${errorMessage}`);
    process.exit(1);
  }); 