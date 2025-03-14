import axios from 'axios';
import { CompanySearchItem, CompanyProfile } from './models';
import { getKeyManager } from './key-manager';

const API_BASE_URL = process.env.COMPANIES_HOUSE_API_BASE_URL;

// Get API keys from environment variables
const apiKeys = process.env.COMPANIES_HOUSE_API_KEYS?.split(',').map(key => key.trim()) || [];

if (!API_BASE_URL || apiKeys.length === 0) {
  throw new Error('Missing Companies House API environment variables');
}

// Initialize the key manager
const keyManager = getKeyManager(apiKeys);

/**
 * Get an axios instance with the next available API key
 * @returns Axios instance with authentication headers
 */
function getApiClient() {
  const apiKey = keyManager.getNextKey();
  console.log(`[API] Using key: ${apiKey.substring(0, 8)}...`);
  
  return axios.create({
    baseURL: API_BASE_URL,
    auth: {
      username: apiKey,
      password: '',
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

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
    const apiClient = getApiClient();
    const apiKey = (apiClient.defaults.auth as { username: string }).username;
    
    console.log(`[API] Searching for company: "${query}" with key: ${apiKey.substring(0, 8)}...`);
    const response = await apiClient.get('/search/companies', {
      params: {
        q: query,
        items_per_page: itemsPerPage,
        start_index: startIndex,
      },
    });
    
    // Register successful request
    keyManager.registerRequest(apiKey);
    
    // Log success info
    const items = response.data.items || [];
    console.log(`[API] ✅ Search successful for "${query}" - Found ${items.length} results - Status: ${response.status}`);
    
    return response.data;
  } catch (error: unknown) {
    // Register the request even if it failed
    const errorWithConfig = error as { config?: { auth?: { username: string } }; response?: { status?: number } };
    if (errorWithConfig.config?.auth?.username) {
      keyManager.registerRequest(errorWithConfig.config.auth.username);
    }
    
    const statusCode = errorWithConfig.response?.status;
    console.error(`[API] ❌ Error searching for company "${query}": Status ${statusCode}`, error);
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
    const apiClient = getApiClient();
    const apiKey = (apiClient.defaults.auth as { username: string }).username;
    
    console.log(`[API] Fetching profile for company number: "${companyNumber}" with key: ${apiKey.substring(0, 8)}...`);
    const response = await apiClient.get(`/company/${companyNumber}`);
    
    // Register successful request
    keyManager.registerRequest(apiKey);
    
    // Log success info
    console.log(`[API] ✅ Profile fetch successful for "${companyNumber}" - Company name: "${response.data.company_name}" - Status: ${response.status}`);
    
    return response.data;
  } catch (error: unknown) {
    // Register the request even if it failed
    const errorWithConfig = error as { config?: { auth?: { username: string } }; response?: { status?: number } };
    if (errorWithConfig.config?.auth?.username) {
      keyManager.registerRequest(errorWithConfig.config.auth.username);
    }
    
    const statusCode = errorWithConfig.response?.status;
    console.error(`[API] ❌ Error fetching profile for company ${companyNumber}: Status ${statusCode}`, error);
    throw error;
  }
} 