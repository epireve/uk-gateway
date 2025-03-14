import axios from 'axios';
import { CompanySearchItem, CompanyProfile } from './models';

const API_BASE_URL = process.env.COMPANIES_HOUSE_API_BASE_URL;
const API_KEY = process.env.COMPANIES_HOUSE_API_KEY;

if (!API_BASE_URL || !API_KEY) {
  throw new Error('Missing Companies House API environment variables');
}

// Create axios instance with basic auth
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  auth: {
    username: API_KEY,
    password: '',
  },
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Search for companies by name
 * @param query Company name to search for
 * @param itemsPerPage Number of results per page (default: 20)
 * @param startIndex Start index for pagination (default: 0)
 * @returns Company search results
 */
export async function searchCompanies(
  query: string,
  itemsPerPage: number = 20,
  startIndex: number = 0
): Promise<{
  items: CompanySearchItem[];
  total_results: number;
  page_number: number;
  items_per_page: number;
}> {
  try {
    const response = await apiClient.get('/search/companies', {
      params: {
        q: query,
        items_per_page: itemsPerPage,
        start_index: startIndex,
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error searching companies:', error);
    throw error;
  }
}

/**
 * Get company details by company number
 * @param companyNumber Companies House company number
 * @returns Company profile details
 */
export async function getCompanyProfile(companyNumber: string): Promise<CompanyProfile> {
  try {
    const response = await apiClient.get(`/company/${companyNumber}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting company profile for ${companyNumber}:`, error);
    throw error;
  }
} 