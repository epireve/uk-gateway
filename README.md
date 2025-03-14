# UK Gateway

This repository contains the UK Gateway project, which includes a Next.js web application and data processing components.

## Project Structure

The project is organized into the following directories:

### `/app`

Contains the Next.js web applications:

- `/app/clean-project`: The main Next.js application
- `/app/uk-company-portal`: Alternative version of the portal

### `/data-processing`

Contains scripts and utilities for data processing:

- `/data-processing/sic-codes`: SIC code scraping and uploading to Supabase
- `/data-processing/companies`: Company data processing

### `/docs`

Documentation files:

- `SIC_CODE_SUMMARY.md`: Summary of SIC codes
- `SUPABASE_UPLOAD_README.md`: Instructions for uploading SIC codes to Supabase
- `DATA_ENRICHMENT.md`: Documentation on data enrichment processes

### `/config`

Configuration files and utility scripts:

- `.env.example`: Example environment variables
- `build.sh`: Build script

## Development

### Next.js Application

To run the Next.js application:

```bash
cd app/clean-project
npm install
npm run dev
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

## SIC Code Upload

To upload SIC codes to Supabase:

```bash
cd data-processing/sic-codes
# Create and activate a virtual environment if not already done
python -m venv ../../venv
source ../../venv/bin/activate
# Run the upload script
python upload_sic_to_supabase.py
```

See `/docs/SUPABASE_UPLOAD_README.md` for detailed instructions.

## License

See the [LICENSE](LICENSE) file for details. 