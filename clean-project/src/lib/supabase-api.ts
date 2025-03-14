import { supabase } from './supabase';
import { EnrichedCompany } from './models';

/**
 * Get all companies from Supabase with pagination
 * @param page Page number (starting from 1)
 * @param pageSize Number of items per page
 * @returns Companies and pagination metadata
 */
export async function getCompanies(
  page: number = 1, 
  pageSize: number = 20
): Promise<{
  companies: EnrichedCompany[];
  count: number;
  currentPage: number;
  totalPages: number;
}> {
  // Calculate range for pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  // Get companies with pagination
  const { data: companies, error, count } = await supabase
    .from('companies')
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('company_name', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }

  // Calculate total pages
  const totalPages = count ? Math.ceil(count / pageSize) : 0;

  return {
    companies: (companies || []) as EnrichedCompany[],
    count: count || 0,
    currentPage: page,
    totalPages,
  };
}

/**
 * Search companies by name, number, or other fields
 * @param searchTerm Search term
 * @param page Page number (starting from 1)
 * @param pageSize Number of items per page
 * @returns Matching companies and pagination metadata
 */
export async function searchCompanies(
  searchTerm: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{
  companies: EnrichedCompany[];
  count: number;
  currentPage: number;
  totalPages: number;
}> {
  // Calculate range for pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  // Clean search term and prepare for search
  const term = searchTerm.trim();
  
  // Search companies with pagination
  const { data: companies, error, count } = await supabase
    .from('companies')
    .select('*', { count: 'exact' })
    .or(`company_name.ilike.%${term}%,original_name.ilike.%${term}%,company_number.ilike.%${term}%`)
    .range(from, to)
    .order('company_name', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Error searching companies:', error);
    throw error;
  }

  // Calculate total pages
  const totalPages = count ? Math.ceil(count / pageSize) : 0;

  return {
    companies: (companies || []) as EnrichedCompany[],
    count: count || 0,
    currentPage: page,
    totalPages,
  };
}

/**
 * Get a single company by ID
 * @param id Company ID
 * @returns Company details or null if not found
 */
export async function getCompanyById(id: string): Promise<EnrichedCompany | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // PGRST116 is the code for "no rows returned"
      return null;
    }
    console.error('Error fetching company:', error);
    throw error;
  }

  return data as EnrichedCompany;
}

/**
 * Get a single company by company number
 * @param companyNumber Companies House company number
 * @returns Company details or null if not found
 */
export async function getCompanyByNumber(companyNumber: string): Promise<EnrichedCompany | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('company_number', companyNumber)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // PGRST116 is the code for "no rows returned"
      return null;
    }
    console.error('Error fetching company by number:', error);
    throw error;
  }

  return data as EnrichedCompany;
} 