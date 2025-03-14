# UK Company Data Enrichment Process

This document outlines the process for enriching company data in the UK Gateway system, including handling API rate limits, logging strategies, and reprocessing failed data.

## Data Enrichment Overview

The data enrichment process involves:

1. Loading raw CSV data into Supabase
2. Enriching this data with additional information from the Companies House API
3. Managing API rate limits
4. Logging successful and failed operations
5. Reprocessing failed data

## Companies House API Rate Limits

The Companies House API has the following rate limits:

- 600 requests within a 5-minute period (120 requests per minute on average)
- Exceeding this limit results in 429 Too Many Requests HTTP status code
- Rate limit resets after the 5-minute window

## Data Enrichment Execution Strategy

### Batch Processing

To stay within rate limits, we implement batch processing with the following approach:

1. Process data in batches of 100 records
2. Implement a delay between batches to ensure we don't exceed 120 requests per minute
3. Track the number of API calls made within the 5-minute window
4. Automatically pause processing if approaching the rate limit threshold
5. Resume processing after the rate limit window resets

### Rate Limit Handling

```typescript
// Example rate limit handling
const RATE_LIMIT = 600; // Requests per 5 minutes
const WINDOW_SIZE = 5 * 60 * 1000; // 5 minutes in milliseconds
const BATCH_SIZE = 100;

let requestCount = 0;
let windowStartTime = Date.now();

async function processWithRateLimit(records) {
  const batches = chunk(records, BATCH_SIZE);
  
  for (const batch of batches) {
    // Reset counter if window has elapsed
    if (Date.now() - windowStartTime > WINDOW_SIZE) {
      requestCount = 0;
      windowStartTime = Date.now();
    }
    
    // Check if approaching rate limit
    if (requestCount + batch.length > RATE_LIMIT) {
      const timeToWait = WINDOW_SIZE - (Date.now() - windowStartTime);
      console.log(`Rate limit approaching: Waiting ${timeToWait/1000} seconds`);
      await new Promise(resolve => setTimeout(resolve, timeToWait));
      requestCount = 0;
      windowStartTime = Date.now();
    }
    
    // Process batch
    await processBatch(batch);
    requestCount += batch.length;
    
    // Add small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
```

## Logging Strategy

### Log File Structure

We maintain the following log files:

1. `enrichment-process.log` - Overall process log with timestamps, batch information, and summary statistics
2. `successful-enrichment.log` - Log of successfully enriched company records (company ID, timestamp)
3. `failed-enrichment.log` - Detailed log of failed enrichment attempts with:
   - Company ID
   - Timestamp
   - Error message
   - HTTP status code (if applicable)
   - Request payload

### Log File Rotation

Log files are date-stamped and rotated on each run:
```
logs/
  enrichment-process-2025-03-14.log
  successful-enrichment-2025-03-14.log
  failed-enrichment-2025-03-14.log
```

### Sample Log Entry (Failed Enrichment)

```json
{
  "timestamp": "2025-03-14T10:15:30.123Z",
  "companyId": "12345678",
  "companyName": "ACME LTD",
  "error": "Rate limit exceeded",
  "httpStatus": 429,
  "requestPayload": { ... },
  "retryCount": 0
}
```

## Reprocessing Failed Data

### Failed Data Storage

Failed company records are stored in:
1. The log file (`failed-enrichment.log`)
2. A dedicated Supabase table (`failed_enrichments`)

### Reprocessing Command

To reprocess failed records:

```bash
npm run reprocess-failed
```

This script:
1. Reads from both the log file and database table
2. Deduplicates records
3. Prioritizes records by age and retry count
4. Follows the same rate limiting strategy as the main process

### Retry Strategy

1. Exponential backoff between retries
2. Maximum of 5 retry attempts per record
3. Different handling for different failure types:
   - Rate limiting failures (429): Retry with backoff
   - Not found (404): Mark as permanently failed
   - Server errors (5xx): Retry with longer backoff

## API Key Management

Currently using a single API key with rate limit of 600 requests per 5 minutes.

Future enhancement: Implement key rotation between multiple API keys to increase throughput.

### Key Rotation Strategy (Future)

1. Maintain a pool of API keys
2. Track rate limit status for each key
3. Automatically switch to next available key when approaching limits
4. Monitor key usage and effectiveness

## How to Run Data Enrichment

```bash
# Run the full enrichment process
npm run enrich-data

# Reprocess only failed records
npm run reprocess-failed

# Process a specific CSV file
npm run enrich-data -- --file=companies.csv

# Run with verbose logging
npm run enrich-data -- --verbose
```

## Monitoring and Reporting

The enrichment process generates a summary report with:
- Total records processed
- Successfully enriched records
- Failed records
- Processing time
- API usage metrics

This report is saved as `enrichment-report-{date}.json` and can be viewed with:

```bash
npm run view-report -- --date=2025-03-14
``` 