import { supabase } from './supabase';
import { EnrichedCompany } from './models';

/**
 * Get all companies from Supabase with pagination
 * @param page Page number (starting from 1)
 * @param pageSize Number of items per page
 * @param filters Filter options (enrichedOnly, townCity, route, typeRating)
 * @returns Companies and pagination metadata
 */
export async function getCompanies(
  page: number = 1, 
  pageSize: number = 20,
  filters: {
    enrichedOnly?: boolean;
    townCity?: string;
    route?: string;
    typeRating?: string;
  } = {}
): Promise<{
  companies: EnrichedCompany[];
  count: number;
  currentPage: number;
  totalPages: number;
}> {
  // Calculate range for pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  // Start query
  let query = supabase
    .from('companies')
    .select('*', { count: 'exact' });
  
  // Apply filters
  if (filters.enrichedOnly) {
    query = query.not('company_number', 'is', null);
  }
  
  if (filters.townCity && filters.townCity !== 'all') {
    query = query.eq('town_city', filters.townCity);
  }
  
  if (filters.route && filters.route !== 'all') {
    query = query.eq('route', filters.route);
  }
  
  if (filters.typeRating && filters.typeRating !== 'all') {
    query = query.eq('type_rating', filters.typeRating);
  }
  
  // Complete the query with pagination and ordering
  const { data: companies, error, count } = await query
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
 * @param filters Filter options (enrichedOnly, townCity, route, typeRating)
 * @returns Matching companies and pagination metadata
 */
export async function searchCompanies(
  searchTerm: string,
  page: number = 1,
  pageSize: number = 20,
  filters: {
    enrichedOnly?: boolean;
    townCity?: string;
    route?: string;
    typeRating?: string;
  } = {}
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
  
  // Start query
  let query = supabase
    .from('companies')
    .select('*', { count: 'exact' })
    .or(`company_name.ilike.%${term}%,original_name.ilike.%${term}%,company_number.ilike.%${term}%`);
  
  // Apply filters
  if (filters.enrichedOnly) {
    query = query.not('company_number', 'is', null);
  }
  
  if (filters.townCity && filters.townCity !== 'all') {
    query = query.eq('town_city', filters.townCity);
  }
  
  if (filters.route && filters.route !== 'all') {
    query = query.eq('route', filters.route);
  }
  
  if (filters.typeRating && filters.typeRating !== 'all') {
    query = query.eq('type_rating', filters.typeRating);
  }
  
  // Complete the query
  const { data: companies, error, count } = await query
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

/**
 * Get all unique town/city values for filtering
 * @returns Array of town/city values
 */
export async function getTownCityOptions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('town_city')
    .not('town_city', 'is', null)
    .order('town_city', { ascending: true });

  if (error) {
    console.error('Error fetching town/city options:', error);
    throw error;
  }

  // Extract unique town_city values
  const townCities = data
    .map(item => item.town_city as string)
    .filter((value, index, self) => 
      value && self.indexOf(value) === index
    );

  return townCities;
}

/**
 * Get all unique route values for filtering
 * @returns Array of route values
 */
export async function getRouteOptions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('route')
    .not('route', 'is', null)
    .order('route', { ascending: true });

  if (error) {
    console.error('Error fetching route options:', error);
    throw error;
  }

  // Extract unique route values
  const routes = data
    .map(item => item.route as string)
    .filter((value, index, self) => 
      value && self.indexOf(value) === index
    );

  return routes;
}

/**
 * Get all unique type & rating values for filtering
 * @returns Array of type & rating values
 */
export async function getTypeRatingOptions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('type_rating')
    .not('type_rating', 'is', null)
    .order('type_rating', { ascending: true });

  if (error) {
    console.error('Error fetching type & rating options:', error);
    throw error;
  }

  // Extract unique type_rating values
  const typeRatings = data
    .map(item => item.type_rating as string)
    .filter((value, index, self) => 
      value && self.indexOf(value) === index
    );

  return typeRatings;
} 