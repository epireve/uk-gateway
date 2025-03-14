# UK Company Data Enrichment

This document outlines the process for enriching UK company data using the Companies House API.

## Overview

The data enrichment process involves:

1. Retrieving company records from Supabase that need enrichment
2. Searching for each company in the Companies House API
3. Retrieving detailed company profiles
4. Updating the Supabase database with the enriched data
5. Logging successes and failures
6. Reprocessing failed records as needed

## API Rate Limits and Key Rotation

The Companies House API has a rate limit of 600 requests per 5-minute window per API key. To maximize throughput, the system implements API key rotation:

- Multiple API keys can be provided in the `.env` file as a comma-separated list
- The system automatically rotates between keys based on usage
- Keys approaching their rate limits are temporarily avoided
- If all keys are exhausted, the system will wait for rate limits to reset

## Concurrent Processing

The enrichment process uses concurrent processing to maximize throughput:

- Requests are processed in batches with controlled concurrency
- The concurrency limit can be configured in the `.env` file
- Default concurrency is calculated based on the number of available API keys
- Rate-limited requests are automatically retried with a different key

## Batch Processing Strategy

Data is processed in batches to manage memory usage and provide better progress reporting:

1. Companies are retrieved from Supabase in batches (default: 100 records per batch)
2. Each batch is processed concurrently with controlled concurrency
3. Rate-limited requests are queued for retry
4. After each batch completes, the system logs progress and key usage statistics

## Logging System

The enrichment process includes comprehensive logging:

- Process logs: General information about the enrichment process
- Success logs: Records of successfully enriched companies
- Failure logs: Records of failed enrichment attempts with error details
- All logs are stored in the `/logs` directory with datestamped filenames
- Detailed reports are generated at the end of each run

## Retry Strategy for Failed Records

Failed records are tracked and can be reprocessed:

1. Failed records are logged with error details
2. A separate table in Supabase (`failed_enrichments`) tracks failed records
3. The `reprocess-failed.ts` script can be run to retry failed records
4. Exponential backoff is implemented for retries
5. Records are prioritized by retry count (fewer retries first)

## Running the Scripts

### Environment Setup

Create a `.env` file based on `.env.example` with the following variables:

```
# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Companies House API configuration
# Comma-separated list of API keys for rotation
COMPANIES_HOUSE_API_KEYS=key1,key2,key3,key4

# Optional: Set concurrency limit for API requests
CONCURRENCY_LIMIT=5
```

### Data Enrichment

To enrich company data:

```bash
npm run enrich-data
```

### Reprocessing Failed Records

To reprocess failed records:

```bash
npm run reprocess-failed
```

### Viewing Reports

To view enrichment reports:

```bash
npm run view-report
# Or specify a date
npm run view-report -- --date=2023-03-14
```

## Data Storage

All enriched data is stored in the Supabase `companies` table with the following structure:

- Original CSV data (name, town/city, county, etc.)
- Companies House data (company number, status, type, address, etc.)
- Complete raw JSON response for future reference
- Additional fields captured from the API response

## Error Handling

The system includes robust error handling:

- API errors are logged with detailed information
- Network issues are handled with appropriate retries
- Rate limit errors trigger key rotation
- Database errors are logged and tracked
- All errors include timestamps and context for debugging 