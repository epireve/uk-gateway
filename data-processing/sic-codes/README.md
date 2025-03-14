# SIC Code Processing

This directory contains scripts and data for working with UK Standard Industrial Classification (SIC) codes.

## Files

- `sic_scraper.py` - Script to scrape SIC codes from the Companies House website
- `sic_codes.csv` - CSV file containing all SIC codes with sections and descriptions
- `create_sic_table.sql` - SQL script to create the SIC codes table in Supabase
- `upload_sic_to_supabase.py` - Script to upload SIC codes to Supabase

## Usage

### Scraping SIC Codes

To scrape SIC codes from the Companies House website:

```bash
python sic_scraper.py
```

The script will create a `sic_codes.csv` file with all SIC codes.

### Creating the Supabase Table

To create the SIC codes table in Supabase, run the SQL in `create_sic_table.sql` in the Supabase SQL Editor. The script will:

1. Enable the `pg_trgm` extension for text search
2. Create the `sic_codes` table with appropriate columns
3. Create indexes for faster lookups
4. Set up Row Level Security (RLS) policies
5. Grant access to necessary roles

### Uploading SIC Codes to Supabase

To upload the SIC codes to Supabase:

```bash
# Ensure you have an .env file with Supabase credentials
python upload_sic_to_supabase.py
```

For detailed instructions, see the `/docs/SUPABASE_UPLOAD_README.md` file.

## Data Structure

The SIC codes CSV file contains:

- `sic_code`: The numeric SIC code (e.g., "01110")
- `description`: Description of the industrial activity
- `section`: The section identifier (e.g., "Section A")
- `section_title`: The title of the section (e.g., "Agriculture, Forestry and Fishing")

## Requirements

- Python 3.6+
- Required packages (install via `pip install -r ../../requirements.txt`):
  - requests
  - beautifulsoup4
  - supabase
  - python-dotenv 