# UK Gateway

A Next.js application for managing and displaying UK company data from Companies House. This project provides a streamlined interface for importing company data from CSV files, enriching it with the Companies House API, and displaying it in a user-friendly web interface.

## Features

- Import company data from CSV files directly to Supabase
- Search and filter UK companies by name, number, or location
- View detailed company information, including registration details, SIC codes, and status
- Beautiful and responsive UI built with Next.js and TailwindCSS

## Project Structure

The project is organized as a monorepo with the following structure:

```
uk-gateway/
├── clean-project/        # Main Next.js application
│   ├── public/           # Static assets
│   ├── src/              # Source code
│   │   ├── app/          # Next.js app router
│   │   ├── components/   # React components
│   │   ├── lib/          # Utility functions and shared code
│   │   └── scripts/      # CLI scripts for data management
│   ├── data/             # Data files (CSV) - not committed to Git
│   └── ...
└── ...
```

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn
- Supabase account and project
- Companies House API key (optional for data enrichment)

### Installation

1. Clone the repository:
   ```bash
   git clone git@github.com:epireve/uk-gateway.git
   cd uk-gateway/clean-project
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment variables example file and fill in your values:
   ```bash
   cp .env.example .env
   ```

4. Set up the database:
   - Create a Supabase project at [supabase.com](https://supabase.com)
   - Run the SQL in `src/scripts/create-companies-table.sql` in the Supabase SQL editor

5. Start the development server:
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the application for production
- `npm run start` - Start the production server
- `npm run create-table` - Create the database table in Supabase
- `npm run load-csv` - Load CSV data into Supabase
- `npm run enrich-data` - Enrich company data with Companies House API

## Data Flow

1. CSV data is loaded into Supabase using the `load-csv` script
2. (Optional) Data is enriched with Companies House API using the `enrich-data` script
3. The web application displays and allows searching of this data

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Companies House for providing the API
- Supabase for the backend database
- Next.js team for the fantastic framework 