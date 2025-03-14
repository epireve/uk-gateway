import dotenv from 'dotenv';
// Load environment variables at the very top
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import pLimit from 'p-limit';
import { 
  EnrichedCompany 
} from '../lib/models';
import { getKeyManager } from '../lib/key-manager';
import { logEnrichmentProcess, updateEnrichmentJob, getActiveJobId } from './logging-helper';

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
const DELAY_BETWEEN_REQUESTS = 500;
const CONCURRENCY_LIMIT = process.env.CONCURRENCY_LIMIT 
  ? parseInt(process.env.CONCURRENCY_LIMIT) 
  : Math.min(5, apiKeys.length);

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
    keyManager.registerSuccess(apiKey);
    
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
    
    // Register the error with the key manager
    keyManager.registerRequest(apiKey);
    keyManager.registerError(apiKey, statusCode);
    
    logToFile(failedLogFile, {
      companyName,
      error: errorObj.message,
      httpStatus: statusCode,
      action: 'search',
      timestamp: new Date().toISOString(),
      apiKey: apiKey.substring(0, 8) + '...',
    });

    // Handle 403 Forbidden errors - likely temporary IP block or key suspension
    if (statusCode === 403) {
      const forbiddenErrorMsg = `403 Forbidden error when searching for ${companyName}. API key or IP may be temporarily blocked.`;
      console.error(forbiddenErrorMsg);
      if (activeJobId) {
        await logEnrichmentProcess(forbiddenErrorMsg, 'error', activeJobId);
      }
      
      // Throw a specific type of error for 403s to trigger the longer cooldown
      throw new Error(`FORBIDDEN_ERROR: ${forbiddenErrorMsg}`);
    }
    
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
    keyManager.registerSuccess(apiKey);
    
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
    
    // Register the error with the key manager
    keyManager.registerRequest(apiKey);
    keyManager.registerError(apiKey, statusCode);
    
    logToFile(failedLogFile, {
      companyNumber,
      error: errorObj.message,
      httpStatus: statusCode,
      action: 'profile',
      timestamp: new Date().toISOString(),
      apiKey: apiKey.substring(0, 8) + '...',
    });

    // Handle 403 Forbidden errors - likely temporary IP block or key suspension
    if (statusCode === 403) {
      const forbiddenErrorMsg = `403 Forbidden error when fetching profile for ${companyNumber}. API key or IP may be temporarily blocked.`;
      console.error(forbiddenErrorMsg);
      if (activeJobId) {
        await logEnrichmentProcess(forbiddenErrorMsg, 'error', activeJobId);
      }
      
      // Throw a specific type of error for 403s to trigger the longer cooldown
      throw new Error(`FORBIDDEN_ERROR: ${forbiddenErrorMsg}`);
    }
    
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
  
  // Initialize overall statistics
  const overallStats = {
    total: 0,
    successful: 0,
    failed: 0,
    startTime: Date.now(),
    endTime: 0,
    apiCallsMade: 0,
    supabaseUpdates: 0,
    lastStatUpdate: Date.now() // Track when we last updated stats
  };

  // Process all companies using pagination
  let hasMoreCompanies = true;
  let pageNumber = 0;
  const PAGE_SIZE = 2000; // Process 2000 companies per page

  while (hasMoreCompanies) {
    pageNumber++;
    const message = `[INFO] Retrieving page ${pageNumber} of companies that need enrichment (${PAGE_SIZE} per page)`;
    console.log(message);
    
    if (activeJobId) {
      await logEnrichmentProcess(message, 'info', activeJobId);
    }
    
    // Get companies that need enrichment from Supabase with pagination
    // IMPORTANT: We need to sort by ID to ensure we don't miss records between pages
    const { data: companies, error, count } = await supabase
      .from('companies')
      .select('*', { count: 'exact' })
      .is('company_number', null)
      .order('id', { ascending: true })
      .range((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE - 1);

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
      
      break;
    }

    if (!companies || companies.length === 0) {
      const noCompaniesMsg = pageNumber === 1 ? 
        'No companies found that need enrichment' : 
        `No more companies found after page ${pageNumber-1}`;
      console.log(noCompaniesMsg);
      logToFile(processLogFile, noCompaniesMsg);
      
      if (activeJobId) {
        await logEnrichmentProcess(noCompaniesMsg, 'info', activeJobId);
        if (pageNumber === 1) {
          await updateEnrichmentJob(activeJobId, {
            status: 'completed',
            result: 'No companies to process',
            completedAt: true
          });
        }
      }
      
      hasMoreCompanies = false;
      continue;
    }

    // Update the total number of companies if this is the first page
    if (pageNumber === 1 && count !== null) {
      overallStats.total = count;
      const totalMsg = `Total of ${count} companies need enrichment, processing in batches`;
      console.log(totalMsg);
      logToFile(processLogFile, totalMsg);
      
      if (activeJobId) {
        await logEnrichmentProcess(totalMsg, 'info', activeJobId);
        await updateEnrichmentJob(activeJobId, {
          totalItems: count
        });
      }
    } else {
      // If we don't have an exact count, update with what we know
      overallStats.total += companies.length;
    }

    const foundCompaniesMsg = `Found ${companies.length} companies to enrich on page ${pageNumber}`;
    console.log(foundCompaniesMsg);
    logToFile(processLogFile, foundCompaniesMsg);
    
    if (activeJobId) {
      await logEnrichmentProcess(foundCompaniesMsg, 'info', activeJobId);
    }

    // Initialize statistics for this page
    const pageStats = {
      total: companies.length,
      successful: 0,
      failed: 0,
      startTime: Date.now(),
      endTime: 0,
      apiCallsMade: 0,
      supabaseUpdates: 0,
      lastStatUpdate: Date.now()
    };

    // Process in batches
    const batches = chunk(companies, BATCH_SIZE);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchMsg = `Processing batch ${batchIndex + 1}/${batches.length} on page ${pageNumber} (${batch.length} companies)`;
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
        // Enhanced cool-down period - wait for the rate limit window to reset
        const waitTime = keyManager.getWaitTimeMs() + 5000; // Regular rate limit cooldown + 5s buffer
        const waitMsg = `All keys approaching rate limits. Implementing cool-down period of ${Math.ceil(waitTime/1000)} seconds`;
        logToFile(processLogFile, waitMsg);
        console.log(waitMsg);
        
        if (activeJobId) {
          await logEnrichmentProcess(waitMsg, 'warning', activeJobId);
          await updateEnrichmentJob(activeJobId, {
            status: 'waiting',
            result: `Cool-down period: waiting ${Math.ceil(waitTime/1000)} seconds for API rate limits to reset`
          });
        }
        
        // Log the time when the cool-down starts
        const cooldownStartTime = new Date().toISOString();
        const cooldownEndTime = new Date(Date.now() + waitTime).toISOString();
        logToFile(processLogFile, `Cool-down period started at ${cooldownStartTime}, expected to end at ${cooldownEndTime}`);
        console.log(`Cool-down period started at ${cooldownStartTime}, expected to end at ${cooldownEndTime}`);
        
        // Wait for the cool-down period
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Log the end of the cool-down period
        const cooldownEndedMsg = `Cool-down period ended at ${new Date().toISOString()}, resuming processing`;
        logToFile(processLogFile, cooldownEndedMsg);
        console.log(cooldownEndedMsg);
        
        if (activeJobId) {
          await logEnrichmentProcess(cooldownEndedMsg, 'info', activeJobId);
          await updateEnrichmentJob(activeJobId, {
            status: 'processing'
          });
        }
        
        // Reset the key manager after the cool-down
        keyManager.resetCounters();
        logToFile(processLogFile, 'Key usage counters have been reset');
      }
      
      // Create a concurrency limiter
      const limit = pLimit(CONCURRENCY_LIMIT);
      
      // Array to store unprocessed companies for retry
      const retryCompanies: typeof batch = [];
      
      // Process batch with concurrency
      await Promise.all(
        batch.map(company => 
          limit(() => processCompany(company, pageStats).catch(error => {
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
                  itemsFailed: overallStats.failed + 1
                }).catch(console.error);
              }
              
              pageStats.failed++;
              overallStats.failed++;
            }
          }))
        )
      );
      
      // If there are companies to retry, implement an enhanced retry mechanism
      if (retryCompanies.length > 0) {
        const retryMsg = `Need to retry ${retryCompanies.length} companies due to rate limits or forbidden errors`;
        logToFile(processLogFile, retryMsg);
        console.log(retryMsg);
        
        if (activeJobId) {
          await logEnrichmentProcess(retryMsg, 'info', activeJobId);
        }
        
        // Check if we have any 403 Forbidden errors that need a longer cooldown
        const hasForbiddenErrors = keyManager.hasForbiddenErrors();
        
        // If all keys are exhausted or we have forbidden errors, implement a more sophisticated cool-down strategy
        if (keyManager.areAllKeysExhausted() || hasForbiddenErrors) {
          // Determine cooldown time based on error type
          const waitTime = hasForbiddenErrors 
            ? getRandomCooldownTime(10 * 60 * 1000, 15 * 60 * 1000) // 10-15 minutes for 403 errors
            : keyManager.getWaitTimeMs() + 5000; // Regular rate limit cooldown + 5s buffer
          
          const waitMsg = hasForbiddenErrors
            ? `403 Forbidden errors detected. Implementing extended cool-down period of ${Math.ceil(waitTime/60000)} minutes`
            : `All keys exhausted before retry. Implementing cool-down period of ${Math.ceil(waitTime/1000)} seconds`;
          
          logToFile(processLogFile, waitMsg);
          console.log(waitMsg);
          
          if (activeJobId) {
            await logEnrichmentProcess(waitMsg, 'warning', activeJobId);
            await updateEnrichmentJob(activeJobId, {
              status: 'waiting',
              result: hasForbiddenErrors
                ? `Extended cool-down period: waiting ${Math.ceil(waitTime/60000)} minutes due to 403 Forbidden errors`
                : `Cool-down period: waiting ${Math.ceil(waitTime/1000)} seconds for API rate limits to reset`
            });
          }
          
          // Log the time when the cool-down starts
          const cooldownStartTime = new Date().toISOString();
          const cooldownEndTime = new Date(Date.now() + waitTime).toISOString();
          logToFile(processLogFile, `Cool-down period started at ${cooldownStartTime}, expected to end at ${cooldownEndTime}`);
          console.log(`Cool-down period started at ${cooldownStartTime}, expected to end at ${cooldownEndTime}`);
          
          // Wait for the cool-down period
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // Log the end of the cool-down period
          const cooldownEndedMsg = `Cool-down period ended at ${new Date().toISOString()}, resuming processing`;
          logToFile(processLogFile, cooldownEndedMsg);
          console.log(cooldownEndedMsg);
          
          if (activeJobId) {
            await logEnrichmentProcess(cooldownEndedMsg, 'info', activeJobId);
            await updateEnrichmentJob(activeJobId, {
              status: 'processing'
            });
          }
          
          // Reset the key manager after the cool-down
          keyManager.resetCounters();
          logToFile(processLogFile, 'Key usage counters have been reset after cool-down');
        }
        
        // Process retries with a more sophisticated approach - add increasing delays
        for (let i = 0; i < retryCompanies.length; i++) {
          const company = retryCompanies[i];
          try {
            // Calculate an adaptive delay based on the position in the retry queue
            const adaptiveDelay = DELAY_BETWEEN_REQUESTS * (2 + (i % 5)); // Varies between 2-6x normal delay
            
            await processCompany(company, pageStats);
            overallStats.apiCallsMade += 2; // Each company typically makes 2 API calls
            
            // Add the adaptive delay
            await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
            
            // Log the successful retry
            const retrySuccessMsg = `Successfully processed retry for company ${company.original_name} after ${adaptiveDelay}ms delay`;
            console.log(retrySuccessMsg);
            
            // Check if we need a longer pause every 5 companies
            if (i > 0 && i % 5 === 0) {
              const pauseMsg = `Taking a short pause after ${i} retries to avoid rate limits`;
              console.log(pauseMsg);
              logToFile(processLogFile, pauseMsg);
              
              if (activeJobId) {
                await logEnrichmentProcess(pauseMsg, 'info', activeJobId);
              }
              
              // Take a 3-second pause every 5 retries
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // If we hit another rate limit, we need a more aggressive cool-down
            if (errorMessage.includes('Rate limit exceeded')) {
              const rateLimitCooldownMsg = `Hit another rate limit during retry for ${company.original_name}, implementing cool-down`;
              console.log(rateLimitCooldownMsg);
              logToFile(processLogFile, rateLimitCooldownMsg);
              
              if (activeJobId) {
                await logEnrichmentProcess(rateLimitCooldownMsg, 'warning', activeJobId);
              }
              
              // Take a 30-second pause when we hit another rate limit during retries
              await new Promise(resolve => setTimeout(resolve, 30000));
              
              // Try again after the pause (we stay on the same company)
              i--; // Decrement to retry the same company
              continue;
            }
            
            // Handle other errors
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
                itemsFailed: overallStats.failed + 1
              });
            }
            
            pageStats.failed++;
            overallStats.failed++;
          }
        }
      }
      
      // Update overall stats from page stats
      overallStats.successful += pageStats.successful;
      overallStats.apiCallsMade += pageStats.apiCallsMade;
      if (pageStats.supabaseUpdates !== undefined) {
        overallStats.supabaseUpdates = (overallStats.supabaseUpdates || 0) + pageStats.supabaseUpdates;
      }
      
      // Update job status
      if (activeJobId) {
        await updateEnrichmentJob(activeJobId, {
          itemsProcessed: overallStats.successful,
          itemsFailed: overallStats.failed
        });
      }
      
      // Add a delay between batches to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Check if we've processed all pages by seeing if we got fewer records than the page size
    if (companies.length < PAGE_SIZE) {
      // Check if there are really no more companies to process
      const { count: remainingCount } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true })
        .is('company_number', null)
        .gt('id', companies[companies.length - 1].id);
      
      if (remainingCount && remainingCount > 0) {
        const moreCompaniesMsg = `Found ${remainingCount} more companies to process after current page`;
        console.log(moreCompaniesMsg);
        logToFile(processLogFile, moreCompaniesMsg);
        if (activeJobId) {
          await logEnrichmentProcess(moreCompaniesMsg, 'info', activeJobId);
        }
        // We have more companies, continue to next page
        hasMoreCompanies = true;
      } else {
        hasMoreCompanies = false;
        console.log(`Reached the end of companies to process on page ${pageNumber}`);
      }
    } else {
      // Log progress before moving to the next page
      const progressMsg = `Completed page ${pageNumber}. Progress so far: ${overallStats.successful} successful, ${overallStats.failed} failed out of ${overallStats.total} total`;
      console.log(progressMsg);
      logToFile(processLogFile, progressMsg);
      
      if (activeJobId) {
        await logEnrichmentProcess(progressMsg, 'info', activeJobId);
      }
      
      // Add a longer delay between pages to give the API a chance to recover
      const pageDelayMsg = `Taking a 10-second pause before processing the next page`;
      console.log(pageDelayMsg);
      logToFile(processLogFile, pageDelayMsg);
      
      if (activeJobId) {
        await logEnrichmentProcess(pageDelayMsg, 'info', activeJobId);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  // Update statistics and log completion
  overallStats.endTime = Date.now();
  const durationMinutes = (overallStats.endTime - overallStats.startTime) / (1000 * 60);
  
  const summaryMessage = `
    Data enrichment complete.
    Total: ${overallStats.total} companies
    Successful: ${overallStats.successful} companies
    Failed: ${overallStats.failed} companies
    API calls made: ${overallStats.apiCallsMade}
    Duration: ${durationMinutes.toFixed(2)} minutes
  `;
  
  console.log(summaryMessage);
  logToFile(processLogFile, summaryMessage);
  
  // Final update to the job with complete stats
  if (activeJobId) {
    await updateEnrichmentJob(activeJobId, {
      status: 'completed',
      itemsProcessed: overallStats.successful,
      itemsFailed: overallStats.failed,
      result: `Completed: ${overallStats.successful} enriched, ${overallStats.failed} failed, in ${durationMinutes.toFixed(2)} minutes`,
      completedAt: true,
      metadata: {
        durationMinutes,
        apiCallsMade: overallStats.apiCallsMade,
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
      total: overallStats.total,
      successful: overallStats.successful,
      failed: overallStats.failed,
      apiCallsMade: overallStats.apiCallsMade,
      durationMs: overallStats.endTime - overallStats.startTime,
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
        const errorMsg = 'Failed enrichments table does not exist, recording errors to log file only';
        console.log(errorMsg);
        
        if (activeJobId) {
          await logEnrichmentProcess(errorMsg, 'warning', activeJobId);
        }
        
        // Instead of trying to create the table (which requires admin privileges),
        // just log the failures to the file and continue
        console.log(`Saving ${failedEntries.length} failed records to log file only`);
        
        // Save the failed entries to a dedicated JSON file for later processing
        const failedJsonFile = path.join(logDir, `failed-enrichments-${currentDate}.json`);
        fs.writeFileSync(failedJsonFile, JSON.stringify(failedEntries, null, 2));
        
        return; // Skip the database insert
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
        
        // Save the failed entries to a dedicated JSON file for later processing
        const failedJsonFile = path.join(logDir, `failed-enrichments-${currentDate}.json`);
        fs.writeFileSync(failedJsonFile, JSON.stringify(failedEntries, null, 2));
        console.log(`Saved failed entries to ${failedJsonFile} for later processing`);
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
          itemsFailed: stats.failed
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
    } else if (errorMessage.includes('FORBIDDEN_ERROR')) {
      // 403 Forbidden error, throw to be handled with extended cooldown
      console.error(`403 Forbidden error for ${companyName}. Will implement extended cooldown.`);
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

// Add a function to generate random cooldown times within a range
function getRandomCooldownTime(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
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