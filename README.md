# UK Gateway

This repository contains the UK Gateway project, which includes a web portal for managing UK company data and data processing components.

## Project Structure

The project is organized into the following directories:

### `/app`

Contains the Next.js web application:

- `/app/web-portal`: The main web portal for managing and viewing UK company data

### `/data-processing`

Contains scripts and utilities for data processing:

- `/data-processing/sic-codes`: SIC code scraping and uploading to Supabase
- `/data-processing/companies`: Company data processing and CSV files

### `/docs`

Documentation files:

- `SIC_CODE_SUMMARY.md`: Summary of SIC codes
- `SUPABASE_UPLOAD_README.md`: Instructions for uploading SIC codes to Supabase
- `DATA_ENRICHMENT.md`: Documentation on data enrichment processes

### `/config`

Configuration files and utility scripts:

- `.env.example`: Example environment variables
- `build.sh`: Build script for the web portal

## Development

### Web Portal

To run the web portal:

```bash
cd app/web-portal
pnpm install
pnpm dev
```

For production build:

```bash
cd config
./build.sh
```

### Data Processing

To work with data processing scripts:

```bash
cd data-processing
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate
# Install dependencies
pip install -r requirements.txt
```

#### SIC Code Upload

To upload SIC codes to Supabase:

```bash
cd data-processing/sic-codes
source ../../venv/bin/activate
python upload_sic_to_supabase.py
```

See `/docs/SUPABASE_UPLOAD_README.md` for detailed instructions.

#### Company Data Processing

Company data files are stored in `/data-processing/companies/`. To process company data:

1. Place your company CSV files in this directory
2. Use the web portal's data processing scripts to load and enrich the data

## License

See the [LICENSE](LICENSE) file for details. 