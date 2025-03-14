# UK Company Portal

A NextJS application for loading, enriching, and querying UK company data using the Companies House API and Supabase.

## Features

- Import company data from CSV files
- Enrich data using the Companies House API with comprehensive data capture
- Store complete API responses as raw JSON for future reference
- Store enriched data in Supabase with structured fields for efficient querying
- Search and filter companies by name, number, and other attributes
- View detailed company information including accounts, confirmation statements, etc.
- Track data enrichment timestamps for each company
- Responsive UI for desktop and mobile devices

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **API Integration**: Companies House API
- **Data Processing**: Node.js scripts
- **Validation**: Zod

## Data Capture

The application captures comprehensive data from the Companies House API, including:

- Basic company details (name, number, status, type)
- Address information (registered office, service address)
- Financial information (accounts)
- Filing information (confirmation statements)
- Status flags (can_file, has_charges, etc.)
- For foreign companies: foreign company details and external registration
- Complete raw JSON response for future reference
- Enrichment timestamp to track when data was last fetched

Different company types have different data structures in the API response. Our implementation is designed to handle these variations and store all available data.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Companies House API key

### Environment Setup

Create a `.env` file in the root directory with the following variables:

```
# Supabase Credentials
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Companies House API
COMPANIES_HOUSE_API_BASE_URL=https://api.company-information.service.gov.uk
COMPANIES_HOUSE_LIVE_API_KEY=your_live_api_key
COMPANIES_HOUSE_TEST_API_KEY=your_test_api_key

# Environment mode (development or production)
NODE_ENV=development
```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/uk-company-portal.git
   cd uk-company-portal
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Initialize Supabase tables:
   ```bash
   npx tsx src/scripts/init-supabase.ts
   ```

4. Process the company CSV file:
   ```bash
   npx tsx src/scripts/process-csv.ts
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Supabase Setup

Before running the initialization script, you need to create two SQL functions in your Supabase project:

1. Open the SQL Editor in your Supabase dashboard
2. Create the following functions:

```sql
CREATE OR REPLACE FUNCTION create_companies_table(sql_query TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_indexes(sql_query TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Data Processing

The application processes company data in the following steps:

1. Read companies from the CSV file
2. For each company, search the Companies House API by name
3. Get detailed information for each company using its company number
4. Capture the complete API response as raw JSON
5. Extract specific fields into structured data
6. Store both the structured data and raw JSON in Supabase
7. Record the timestamp when the data was enriched

## API Integration

The application integrates with the Companies House API for two main purposes:

1. **Search Companies**: Search for companies by name
2. **Get Company Details**: Retrieve detailed information using a company number

The Companies House API returns different data structures for different company types (UK, overseas, etc.). Our implementation handles these variations and stores all available data.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Companies House](https://www.gov.uk/government/organisations/companies-house) for providing the public data API
- [Supabase](https://supabase.io/) for the backend infrastructure
- [Next.js](https://nextjs.org/) for the frontend framework

## Database Setup for Enrichment Features

The application uses several tables in Supabase for data enrichment functionality:

1. `companies` - Main table for storing company data
2. `failed_enrichments` - Table for tracking failed enrichment attempts
3. `enrichment_jobs` - Table for managing enrichment processes
4. `enrichment_logs` - Table for storing logs from enrichment processes

### Setting Up Required Tables

To create the required tables:

1. Make sure your Supabase environment variables are set in your `.env` file:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. Run the database setup scripts:
   ```bash
   # If you're using npm
   npm run setup-db

   # If you're using pnpm
   pnpm run setup-db
   ```

3. Alternatively, you can execute the scripts directly:
   ```bash
   npx tsx src/scripts/setup-enrichment-jobs.ts
   ```

### Creating Tables Manually

If you encounter issues with the scripts, you can manually create the tables in Supabase:

1. Navigate to your Supabase project dashboard
2. Go to the SQL Editor
3. Run the following SQL scripts:
   - `src/scripts/create-companies-table.sql`
   - `src/scripts/create-failed-enrichments-table.sql`
   - `src/scripts/create-enrichment-jobs-table.sql`

Then add the `enrichment_logs` table:

```sql
CREATE TABLE IF NOT EXISTS enrichment_logs (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES enrichment_jobs(id),
  log_level TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_enrichment_logs_job_id ON enrichment_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_logs_timestamp ON enrichment_logs(timestamp);

ALTER TABLE enrichment_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE enrichment_logs IS 'Table to store logs from data enrichment processes';
```
