# UK SIC Code Structure and Scraping Summary

## Overview

This document provides a summary of the Standard Industrial Classification (SIC) code structure in the UK and the data extracted from the Companies House website. The SIC code system categorizes businesses by their economic activities, making it valuable for economic analysis, statistical reporting, and business categorization.

## Key Statistics

From our scraping process, we extracted:
- **731 unique SIC codes** organized into 21 sections (A through U)
- **Industry distribution:**
  - Manufacturing (Section C): 259 codes (35.4%)
  - Wholesale and Retail Trade (Section G): 103 codes (14.1%)
  - Administrative and Support Services (Section N): 44 codes (6.0%)
  - Agriculture, Forestry and Fishing (Section A): 40 codes (5.5%)
  - Financial and Insurance Activities (Section K): 34 codes (4.7%)

## SIC Code Structure

Each SIC code follows a specific structure:
- Five-digit numerical code (e.g., 01110)
- First two digits typically indicate the division
- The complete code uniquely identifies a specific economic activity

## Section Organization

The 21 sections represent broad categories of economic activity:

| Section | Industry | Example Activities |
|---------|----------|-------------------|
| A | Agriculture, Forestry and Fishing | Crop growing, animal production, forestry |
| B | Mining and Quarrying | Coal mining, oil extraction, quarrying |
| C | Manufacturing | Food production, textiles, machinery, electronics |
| D | Electricity, Gas, Steam and Air Conditioning | Power generation and distribution |
| E | Water Supply, Waste Management | Water collection, waste treatment |
| F | Construction | Building construction, civil engineering |
| G | Wholesale and Retail Trade | Retail outlets, wholesale, motor trade |
| H | Transportation and Storage | Land transport, shipping, warehousing |
| I | Accommodation and Food Service | Hotels, restaurants, catering |
| J | Information and Communication | Publishing, broadcasting, telecommunications |
| K | Financial and Insurance | Banking, insurance, financial services |
| L | Real Estate | Property rental, management, agencies |
| M | Professional, Scientific and Technical | Legal, accounting, research services |
| N | Administrative and Support | Employment agencies, travel agencies, cleaning |
| O | Public Administration and Defence | Government activities, justice, defense |
| P | Education | Primary, secondary, higher education |
| Q | Human Health and Social Work | Healthcare, residential care, social work |
| R | Arts, Entertainment and Recreation | Creative arts, sports, entertainment |
| S | Other Service Activities | Membership organizations, personal services |
| T | Activities of Households as Employers | Household employment activities |
| U | Activities of Extraterritorial Organisations | International organizations, embassies |

## Usage in Business and Administration

SIC codes are used for:
1. **Company Registration**: Required when registering a company with Companies House
2. **Taxation**: Used to categorize businesses for tax purposes
3. **Statistical Reporting**: Used in national and international economic reporting
4. **Industry Analysis**: Enables sector-specific analysis and comparison
5. **Business Activities**: Companies can have multiple SIC codes to represent various activities

## Data Source and Methodology

Our data was extracted from the official Companies House website using a Python script with the following approach:
1. Fetching the SIC code listing from the official resources page
2. Parsing the HTML structure to extract codes and descriptions
3. Categorizing codes into sections based on the UK SIC 2007 standard code ranges
4. Organizing the data into a structured CSV format

## Conclusion

SIC codes provide a standardized approach to classifying business activities, enabling consistent tracking and analysis across government agencies, statistical offices, and business organizations. The structured categorization allows for meaningful grouping of companies for economic analysis and regulatory purposes. 