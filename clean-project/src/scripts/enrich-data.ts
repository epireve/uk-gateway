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
import { logEnrichmentProcess, updateEnrichmentJob, getActiveJobId } from './logging-helper';

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

// Variable to store our active job ID for logging
let activeJobId: number | null = null;

// Create logger function
function logToFile(filePath: string, data: unknown): void {
  const timestamp = new Date().toISOString();
  const logEntry = typeof data === 'string' 
    ? `${timestamp} - ${data}\n` 
    : `${timestamp} - ${JSON.stringify(data)}\n`;
  
  fs.appendFileSync(filePath, logEntry);
  
  // Also log to database if we have an active job ID
  if (activeJobId) {
    const level = filePath.includes('failed') ? 'error' : 'info';
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    logEnrichmentProcess(message, level, activeJobId).catch(err => {
      console.error('Error saving log to database:', err);
    });
  }
}

// Log process start
async function initializeProcess() {
  // Check for and get active job ID from database
  activeJobId = await getActiveJobId();
  
  if (activeJobId) {
    await updateEnrichmentJob(activeJobId, {
      status: 'processing',
      startedAt: true,
    });
    await logEnrichmentProcess(`Starting data enrichment process with ${apiKeys.length} API keys and concurrency ${CONCURRENCY_LIMIT}`, 'info', activeJobId);
  }
  
  logToFile(processLogFile, `Starting data enrichment process with ${apiKeys.length} API keys and concurrency ${CONCURRENCY_LIMIT}`);
  console.log(`Starting data enrichment process. Logs will be saved to ${logDir}`);
}

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
    
    const firstItem = response.data.items?.[0] || null;
    if (firstItem) {
      const message = `Found company "${companyName}" - matched with "${firstItem.title}" (${firstItem.company_number})`;
      console.log(`[SUCCESS] ${message}`);
      if (activeJobId) {
        await logEnrichmentProcess(message, 'info', activeJobId);
      }
    } else {
      const message = `No matches found for company "${companyName}"`;
      console.log(`[WARNING] ${message}`);
      if (activeJobId) {
        await logEnrichmentProcess(message, 'warning', activeJobId);
      }
    }
    
    return firstItem;
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

    const errorMessage = `Error searching for company ${companyName}: ${errorObj.message}`;
    console.error(errorMessage);
    if (activeJobId) {
      await logEnrichmentProcess(errorMessage, 'error', activeJobId);
    }
    return null;
  }
}

// Enhanced function to log successful API calls with detailed information
async function successLogDetails(companyName: string, companyNumber: string, profile: Record<string, unknown>) {
  // Create a structured success log entry
  const successData = {
    companyName,
    companyNumber,
    companyStatus: profile.company_status || 'N/A',
    type: profile.type || 'N/A',
    dateOfCreation: profile.date_of_creation || 'N/A',
    address: profile.registered_office_address ? 
      `${(profile.registered_office_address as Record<string, string>).address_line_1 || ''}, ${(profile.registered_office_address as Record<string, string>).locality || ''}, ${(profile.registered_office_address as Record<string, string>).postal_code || ''}` 
      : 'N/A',
    sicCodes: Array.isArray(profile.sic_codes) ? profile.sic_codes : [],
    timestamp: new Date().toISOString(),
    apiUrl: `https://api.company-information.service.gov.uk/company/${companyNumber}`,
  };
  
  // Log to success file
  logToFile(successLogFile, successData);
  
  // Also log to database
  if (activeJobId) {
    const message = `Successfully enriched: ${companyName} (${companyNumber})`;
    await logEnrichmentProcess(message, 'info', activeJobId);
  }
  
  // Also log to console
  console.log(`\n[SUCCESS LOG] ✅ Successfully enriched company data:`);
  console.log(`  - Company Name: ${companyName}`);
  console.log(`  - Company Number: ${companyNumber}`);
  console.log(`  - Status: ${successData.companyStatus}`);
  console.log(`  - Type: ${successData.type}`);
  console.log(`  - Date Created: ${successData.dateOfCreation}`);
  console.log(`  - Address: ${successData.address}`);
  console.log(`  - SIC Codes: ${successData.sicCodes.join(', ') || 'None'}`);
  console.log(`  - API URL: ${successData.apiUrl}`);
  console.log(`  - Timestamp: ${successData.timestamp}`);
}

// Function to get company profile from Companies House with key rotation
async function getCompanyProfile(companyNumber: string) {
  // Get the next available API key
  const apiKey = keyManager.getNextKey();
  
  try {
    // Log the exact URL being used
    const apiUrl = `${companiesHouseBaseUrl}/company/${companyNumber}`;
    console.log(`[API URL] Requesting: ${apiUrl}`);
    
    const response = await axios.get(
      apiUrl,
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
    
    const message = `Retrieved profile for company number "${companyNumber}" - ${response.data.company_name}`;
    console.log(`[SUCCESS] ${message}`);
    
    if (activeJobId) {
      await logEnrichmentProcess(message, 'info', activeJobId);
    }
    
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

    const errorMessage = `Error fetching company profile for ${companyNumber}: ${errorObj.message}`;
    console.error(errorMessage);
    
    if (activeJobId) {
      await logEnrichmentProcess(errorMessage, 'error', activeJobId);
    }
    
    return null;
  }
}

// Main function to process companies with concurrency and rate limiting
async function processCompaniesWithConcurrency() {
  // Initialize process and get active job ID
  await initializeProcess();
  
  // Get companies that need enrichment from Supabase - Process all remaining companies
  const message = '[INFO] Retrieving all remaining companies that need enrichment';
  console.log(message);
  
  if (activeJobId) {
    await logEnrichmentProcess(message, 'info', activeJobId);
  }
  
  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .is('company_number', null);  // Remove the limit to process all remaining companies

  if (error) {
    const errorMessage = `Error fetching companies from Supabase: ${error.message}`;
    console.error(errorMessage);
    logToFile(processLogFile, errorMessage);
    
    if (activeJobId) {
      await logEnrichmentProcess(errorMessage, 'error', activeJobId);
      await updateEnrichmentJob(activeJobId, {
        status: 'failed',
        result: errorMessage,
        completedAt: true
      });
    }
    
    return;
  }

  if (!companies || companies.length === 0) {
    const noCompaniesMsg = 'No companies found that need enrichment';
    console.log(noCompaniesMsg);
    logToFile(processLogFile, noCompaniesMsg);
    
    if (activeJobId) {
      await logEnrichmentProcess(noCompaniesMsg, 'info', activeJobId);
      await updateEnrichmentJob(activeJobId, {
        status: 'completed',
        result: 'No companies to process',
        completedAt: true
      });
    }
    
    return;
  }

  const foundCompaniesMsg = `Found ${companies.length} companies to enrich`;
  console.log(foundCompaniesMsg);
  console.log(`First company: ${JSON.stringify(companies[0], null, 2)}`);
  logToFile(processLogFile, foundCompaniesMsg);
  
  if (activeJobId) {
    await logEnrichmentProcess(foundCompaniesMsg, 'info', activeJobId);
    await updateEnrichmentJob(activeJobId, {
      status: 'processing',
      totalItems: companies.length,
      progressPercentage: 0
    });
  }

  // Initialize statistics
  const stats = {
    total: companies.length,
    successful: 0,
    failed: 0,
    startTime: Date.now(),
    endTime: 0,
    apiCallsMade: 0,
    supabaseUpdates: 0,
    lastStatUpdate: Date.now() // Track when we last updated stats
  };

  // Process with optimal concurrency based on available keys
  const processingConcurrency = Math.min(5, apiKeys.length * 2); // Optimized concurrency - up to 5 concurrent requests
  
  // Process in batches
  const batches = chunk(companies, BATCH_SIZE);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchMsg = `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} companies)`;
    logToFile(processLogFile, batchMsg);
    console.log(batchMsg);
    
    if (activeJobId) {
      await logEnrichmentProcess(batchMsg, 'info', activeJobId);
    }
    
    // Log key usage statistics
    const keyStats = keyManager.getStats();
    logToFile(processLogFile, { keyUsageStats: keyStats });
    console.log('Current key usage:', keyStats.map(k => `${k.key.substring(0, 8)}...: ${k.usagePercent}% (${k.requestCount} calls)`).join(', '));
    
    // Check if all keys are approaching their limits
    if (keyManager.areAllKeysExhausted()) {
      const waitTime = keyManager.getWaitTimeMs() + 1000; // Add 1s buffer
      const waitMsg = `All keys approaching rate limits. Waiting ${waitTime/1000} seconds`;
      logToFile(processLogFile, waitMsg);
      console.log(waitMsg);
      
      if (activeJobId) {
        await logEnrichmentProcess(waitMsg, 'warning', activeJobId);
      }
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Create a concurrency limiter using the optimal concurrency setting
    const limit = pLimit(processingConcurrency);
    
    // Array to store unprocessed companies for retry
    const retryCompanies: typeof batch = [];
    
    // Process batch with concurrency
    await Promise.all(
      batch.map(company => 
        limit(() => processCompany(company, stats).catch(error => {
          // If rate limit error, add to retry array
          if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
            const rateLimitMsg = `Rate limit for one key exceeded when processing ${company.original_name}, adding to retry queue`;
            logToFile(processLogFile, rateLimitMsg);
            
            if (activeJobId) {
              logEnrichmentProcess(rateLimitMsg, 'warning', activeJobId).catch(console.error);
            }
            
            retryCompanies.push(company);
          } else {
            // Log other unexpected errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorMsg = `Unexpected error in concurrent processing: ${errorMessage}`;
            logToFile(failedLogFile, {
              companyId: company.id,
              companyName: company.original_name as string,
              error: errorMsg,
              timestamp: new Date().toISOString(),
              retryCount: 0,
            });
            
            if (activeJobId) {
              logEnrichmentProcess(errorMsg, 'error', activeJobId).catch(console.error);
              updateEnrichmentJob(activeJobId, {
                itemsFailed: stats.failed + 1
              }).catch(console.error);
            }
            
            stats.failed++;
          }
        }))
      )
    );
    
    // If there are companies to retry, wait for key refresh and retry them sequentially
    if (retryCompanies.length > 0) {
      const retryMsg = `Need to retry ${retryCompanies.length} companies due to rate limits`;
      logToFile(processLogFile, retryMsg);
      console.log(retryMsg);
      
      if (activeJobId) {
        await logEnrichmentProcess(retryMsg, 'info', activeJobId);
      }
      
      // If all keys are exhausted, wait for reset
      if (keyManager.areAllKeysExhausted()) {
        const waitTime = keyManager.getWaitTimeMs() + 1000; // Add 1s buffer
        const waitMsg = `All keys exhausted before retry. Waiting ${waitTime/1000} seconds`;
        logToFile(processLogFile, waitMsg);
        console.log(waitMsg);
        
        if (activeJobId) {
          await logEnrichmentProcess(waitMsg, 'warning', activeJobId);
        }
        
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
          const errorMsg = `Failed during retry: ${errorMessage}`;
          logToFile(failedLogFile, {
            companyId: company.id,
            companyName: company.original_name as string,
            error: errorMsg,
            timestamp: new Date().toISOString(),
            retryCount: 1,
          });
          
          if (activeJobId) {
            await logEnrichmentProcess(errorMsg, 'error', activeJobId);
            await updateEnrichmentJob(activeJobId, {
              itemsFailed: stats.failed + 1
            });
          }
          
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
  
  // Final update to the job with complete stats
  if (activeJobId) {
    await updateEnrichmentJob(activeJobId, {
      status: 'completed',
      itemsProcessed: stats.successful,
      itemsFailed: stats.failed,
      progressPercentage: 100,
      result: `Completed: ${stats.successful} enriched, ${stats.failed} failed, in ${durationMinutes.toFixed(2)} minutes`,
      completedAt: true,
      metadata: {
        durationMinutes,
        apiCallsMade: stats.apiCallsMade,
        keyUsage: keyManager.getStats()
      }
    });
  }
  
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
  
  // Save failed records to Supabase
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
        } catch {
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
      
      // Create table manually if it doesn't exist
      if (tableCheckError) {
        const errorMsg = 'Failed enrichments table does not exist, creating it manually...';
        console.log(errorMsg);
        
        if (activeJobId) {
          await logEnrichmentProcess(errorMsg, 'warning', activeJobId);
        }
        
        try {
          // Skip table creation for now - just continue with inserts
          console.log('Skipping table creation, will attempt direct inserts');
          
          if (activeJobId) {
            await logEnrichmentProcess('Skipping table creation, will attempt direct inserts', 'info', activeJobId);
          }
        } catch (createError) {
          const errorMsg = `Error during table creation attempt: ${createError instanceof Error ? createError.message : String(createError)}`;
          console.error(errorMsg);
          
          if (activeJobId) {
            await logEnrichmentProcess(errorMsg, 'error', activeJobId);
          }
        }
      }
      
      // Insert failed entries
      const { error: insertError } = await supabase
        .from('failed_enrichments')
        .insert(failedEntries);
      
      if (insertError) {
        const errorMsg = `Error saving failed records to Supabase: ${insertError.message}`;
        console.error(errorMsg);
        
        if (activeJobId) {
          await logEnrichmentProcess(errorMsg, 'error', activeJobId);
        }
      } else {
        const successMsg = `Saved ${failedEntries.length} failed records to Supabase for reprocessing`;
        console.log(successMsg);
        logToFile(processLogFile, successMsg);
        
        if (activeJobId) {
          await logEnrichmentProcess(successMsg, 'info', activeJobId);
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorMsg = `Error processing failed records: ${errorMessage}`;
    console.error(errorMsg);
    
    if (activeJobId) {
      await logEnrichmentProcess(errorMsg, 'error', activeJobId);
    }
  }
}

// Enhanced Supabase update function with better logging
async function updateCompanyInSupabase(companyId: string, enrichedData: Partial<EnrichedCompany>, companyName: string) {
  console.log(`[SUPABASE] Updating company "${companyName}" (ID: ${companyId}) in Supabase...`);
  console.log(`[SUPABASE] Company number being saved: ${enrichedData.company_number}`);
  
  // Log a sample of the data being saved
  const dataSample = {
    company_number: enrichedData.company_number,
    company_name: enrichedData.company_name,
    company_status: enrichedData.company_status,
    company_type: enrichedData.company_type,
    date_of_creation: enrichedData.date_of_creation,
    // Include just enough fields to verify data is formatted correctly
  };
  
  console.log(`[SUPABASE] Sample of data being saved: ${JSON.stringify(dataSample, null, 2)}`);
  
  // Execute the update
  const { data, error } = await supabase
    .from('companies')
    .update(enrichedData)
    .eq('id', companyId)
    .select('id, company_number, company_name')
    .single();
  
  if (error) {
    console.error(`[SUPABASE] ❌ Error updating company in Supabase: ${error.message}`);
    return { success: false, error };
  }
  
  console.log(`[SUPABASE] ✅ Successfully updated company in Supabase:`);
  console.log(`[SUPABASE] Returned data: ${JSON.stringify(data, null, 2)}`);
  
  return { success: true, data };
}

// Function to process a single company - update to avoid using additional_fields
async function processCompany(company: Record<string, unknown>, stats: {
  successful: number;
  failed: number;
  apiCallsMade: number;
  supabaseUpdates?: number;
  total: number;
  lastStatUpdate: number;
  startTime: number;
  endTime: number;
}) {
  try {
    // Log which company we're processing
    const companyName = company.original_name as string;
    const processingMessage = `Processing company: "${companyName}" (ID: ${company.id})`;
    console.log(`\n[PROCESSING] ${processingMessage}`);
    
    if (activeJobId) {
      await logEnrichmentProcess(processingMessage, 'info', activeJobId);
    }
    
    // Log available API keys and usage before processing
    const keyStats = keyManager.getStats();
    console.log(`[KEYS] Available keys: ${keyStats.map(k => `${k.key.substring(0, 8)}... (${k.usagePercent}%)`).join(', ')}`);
    
    // Step 1: Search for the company
    const searchResult = await searchCompany(companyName);
    stats.apiCallsMade++;
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    
    if (!searchResult) {
      const errorMsg = `No search results found for ${companyName}`;
      logToFile(failedLogFile, {
        companyId: company.id,
        companyName: companyName,
        error: 'No search results found',
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
      
      if (activeJobId) {
        await logEnrichmentProcess(errorMsg, 'error', activeJobId);
        await updateEnrichmentJob(activeJobId, {
          itemsFailed: stats.failed + 1
        });
      }
      
      stats.failed++;
      return;
    }
    
    // Log that we're proceeding to company profile
    const progressMsg = `Fetching detailed profile for company number: ${searchResult.company_number}`;
    console.log(`[PROGRESS] ${progressMsg}`);
    
    if (activeJobId) {
      await logEnrichmentProcess(progressMsg, 'info', activeJobId);
    }
    
    // Step 2: Get detailed company profile
    const profile = await getCompanyProfile(searchResult.company_number);
    stats.apiCallsMade++;
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    
    if (!profile) {
      const errorMsg = `Failed to fetch company profile for ${companyName}`;
      logToFile(failedLogFile, {
        companyId: company.id,
        companyName: companyName,
        companyNumber: searchResult.company_number,
        error: 'Failed to fetch company profile',
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
      
      if (activeJobId) {
        await logEnrichmentProcess(errorMsg, 'error', activeJobId);
        await updateEnrichmentJob(activeJobId, {
          itemsFailed: stats.failed + 1
        });
      }
      
      stats.failed++;
      return;
    }
    
    // Step 3: Update the company record in Supabase with enriched data
    // Create a base enrichment object with the fields we know about - REMOVING additional_fields
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
      // REMOVED: additional_fields property as it's not in the database schema
    };
    
    // REMOVED: Don't add additional fields since the column doesn't exist in the database
    
    // Use enhanced Supabase update function
    const updateResult = await updateCompanyInSupabase(company.id as string, enrichedData, companyName);
    
    if (!updateResult.success) {
      const errorMsg = `Failed to update Supabase: ${updateResult.error?.message || 'Unknown error'}`;
      logToFile(failedLogFile, {
        companyId: company.id,
        companyName: companyName,
        error: errorMsg,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
      
      if (activeJobId) {
        await logEnrichmentProcess(errorMsg, 'error', activeJobId);
        await updateEnrichmentJob(activeJobId, {
          itemsFailed: stats.failed + 1
        });
      }
      
      stats.failed++;
      return;
    }
    
    // Increment Supabase update counter
    if (stats.supabaseUpdates !== undefined) {
      stats.supabaseUpdates++;
    }
    
    // Log detailed success
    await successLogDetails(companyName, profile.company_number, profile);
    
    // Update successful count in database job
    if (activeJobId) {
      stats.successful++;
      
      // Only update the database every 5 companies or after 10 seconds to avoid too many updates
      const shouldUpdate = 
        stats.successful % 5 === 0 || // Every 5 companies
        (Date.now() - stats.lastStatUpdate) > 10000; // Or every 10 seconds
        
      if (shouldUpdate) {
        await updateEnrichmentJob(activeJobId, {
          itemsProcessed: stats.successful,
          itemsFailed: stats.failed,
          progressPercentage: Math.round((stats.successful + stats.failed) / stats.total * 100)
        });
        stats.lastStatUpdate = Date.now();
        
        // Log a status update
        const progressMsg = `Progress: ${stats.successful} successful, ${stats.failed} failed (${Math.round((stats.successful + stats.failed) / stats.total * 100)}% complete)`;
        await logEnrichmentProcess(progressMsg, 'info', activeJobId);
      }
    } else {
      stats.successful++;
    }
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const companyName = company.original_name as string;
    
    if (errorMessage.includes('Rate limit exceeded')) {
      // Individual key rate limit, throw to be handled by the batch processor
      throw error;
    } else {
      const errorMsg = `Unexpected error processing ${companyName}: ${errorMessage}`;
      logToFile(failedLogFile, {
        companyId: company.id,
        companyName: companyName,
        error: errorMsg,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      });
      
      if (activeJobId) {
        await logEnrichmentProcess(errorMsg, 'error', activeJobId);
        await updateEnrichmentJob(activeJobId, {
          itemsFailed: stats.failed + 1
        });
      }
      
      stats.failed++;
      
      // Only update the database periodically to avoid too many updates
    }
  }
}

// Execute the main process
processCompaniesWithConcurrency()
  .then(() => {
    const completionMsg = 'Data enrichment process completed';
    console.log(completionMsg);
    
    if (activeJobId) {
      logEnrichmentProcess(completionMsg, 'info', activeJobId).catch(console.error);
    }
    
    process.exit(0);
  })
  .catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fatalMsg = `Fatal error in data enrichment process: ${errorMessage}`;
    console.error(fatalMsg);
    logToFile(processLogFile, `Fatal error: ${errorMessage}`);
    
    if (activeJobId) {
      logEnrichmentProcess(fatalMsg, 'error', activeJobId).catch(console.error);
      updateEnrichmentJob(activeJobId, {
        status: 'failed',
        result: fatalMsg,
        completedAt: true
      }).catch(console.error);
    }
    
    process.exit(1);
  }); 