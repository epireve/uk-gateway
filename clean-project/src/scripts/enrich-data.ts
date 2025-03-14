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
const processLogFile = path.join(logDir, `enrichment-process-${currentDate}.log`);
const successLogFile = path.join(logDir, `successful-enrichment-${currentDate}.log`);
const failedLogFile = path.join(logDir, `failed-enrichment-${currentDate}.log`);

// Concurrency and rate limit settings
const BATCH_SIZE = 100;
const DELAY_BETWEEN_REQUESTS = 300; // ms
const CONCURRENCY_LIMIT = process.env.CONCURRENCY_LIMIT 
  ? parseInt(process.env.CONCURRENCY_LIMIT) 
  : Math.min(5, apiKeys.length * 2); // Default to 5 or double the number of keys, whichever is smaller

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
logToFile(processLogFile, `Starting data enrichment process with ${apiKeys.length} API keys and concurrency ${CONCURRENCY_LIMIT}`);
console.log(`Starting data enrichment process. Logs will be saved to ${logDir}`);

// Utility function to chunk array into batches
function chunk<T>(array: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(array.length / size) },
    (_, index) => array.slice(index * size, (index + 1) * size)
  );
}

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

// Function to process a single company
async function processCompany(company: Record<string, unknown>, stats: {
  successful: number;
  failed: number;
  apiCallsMade: number;
}) {
  try {
    // Step 1: Search for the company
    const searchResult = await searchCompany(company.original_name);
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
      return;
    }
    
    // Step 2: Get detailed company profile
    const profile = await getCompanyProfile(searchResult.company_number);
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
      return;
    }
    
    // Log success
    logToFile(successLogFile, {
      companyId: company.id,
      companyName: company.original_name,
      companyNumber: profile.company_number,
      timestamp: new Date().toISOString(),
    });
    
    stats.successful++;
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('Rate limit exceeded')) {
      // Individual key rate limit, throw to be handled by the batch processor
      throw error;
    } else {
      logToFile(failedLogFile, {
        companyId: company.id,
        companyName: company.original_name,
        error: `Unexpected error: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
      stats.failed++;
    }
  }
}

// Main function to process companies with concurrency and rate limiting
async function processCompaniesWithConcurrency() {
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

  // Process in batches
  const batches = chunk(companies, BATCH_SIZE);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    logToFile(processLogFile, `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} companies)`);
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} companies)`);
    
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
    
    // Array to store unprocessed companies for retry
    const retryCompanies: typeof batch = [];
    
    // Process batch with concurrency
    await Promise.all(
      batch.map(company => 
        limit(() => processCompany(company, stats).catch(error => {
          // If rate limit error, add to retry array
          if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
            logToFile(processLogFile, `Rate limit for one key exceeded when processing ${company.original_name}, adding to retry queue`);
            retryCompanies.push(company);
          } else {
            // Log other unexpected errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(failedLogFile, {
              companyId: company.id,
              companyName: company.original_name,
              error: `Unexpected error in concurrent processing: ${errorMessage}`,
              timestamp: new Date().toISOString(),
              retryCount: 0,
            });
            stats.failed++;
          }
        }))
      )
    );
    
    // If there are companies to retry, wait for key refresh and retry them sequentially
    if (retryCompanies.length > 0) {
      logToFile(processLogFile, `Need to retry ${retryCompanies.length} companies due to rate limits`);
      console.log(`Need to retry ${retryCompanies.length} companies due to rate limits`);
      
      // If all keys are exhausted, wait for reset
      if (keyManager.areAllKeysExhausted()) {
        const waitTime = keyManager.getWaitTimeMs() + 1000; // Add 1s buffer
        logToFile(processLogFile, `All keys exhausted before retry. Waiting ${waitTime/1000} seconds`);
        console.log(`All keys exhausted before retry. Waiting ${waitTime/1000} seconds`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Process retries sequentially with higher delays
      for (const company of retryCompanies) {
        try {
          await processCompany(company, stats);
          // Add extra delay for retries
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS * 2));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logToFile(failedLogFile, {
            companyId: company.id,
            companyName: company.original_name,
            error: `Failed during retry: ${errorMessage}`,
            timestamp: new Date().toISOString(),
            retryCount: 1,
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
  
  // Log final key usage
  const finalKeyStats = keyManager.getStats();
  logToFile(processLogFile, { finalKeyUsageStats: finalKeyStats });
  console.log('Final key usage:', finalKeyStats.map(k => `${k.key.substring(0, 8)}...: ${k.usagePercent}% (${k.requestCount} calls)`).join(', '));
  
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
      keyUsage: keyManager.getStats()
    },
    batchSize: BATCH_SIZE,
    concurrencyLimit: CONCURRENCY_LIMIT,
    delayBetweenRequestsMs: DELAY_BETWEEN_REQUESTS,
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
        } catch (_) {
          return null;
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error processing failed records:', errorMessage);
  }
}

// Execute the main process
processCompaniesWithConcurrency()
  .then(() => {
    console.log('Data enrichment process completed');
    process.exit(0);
  })
  .catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Fatal error in data enrichment process:', errorMessage);
    logToFile(processLogFile, `Fatal error: ${errorMessage}`);
    process.exit(1);
  }); 