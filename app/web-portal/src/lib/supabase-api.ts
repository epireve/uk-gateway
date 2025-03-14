import { supabase } from './supabase';
import { EnrichedCompany } from './models';

// Define failed enrichment item interface
export interface FailedEnrichmentItem {
  id: string;
  company_name: string;
  company_id: string;
  retry_count: number;
  last_error?: string;
  updated_at: string;
  created_at: string;
}

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

/**
 * Get enrichment status statistics
 * @returns Statistics about data enrichment status
 */
export async function getEnrichmentStats(): Promise<{
  total: number;
  enriched: number;
  failed: number;
  remaining: number;
}> {
  // Get total count
  const { count: total } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true });

  // Get count of enriched records
  const { count: enriched } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .not('company_number', 'is', null);

  // Get count of failed records from failed_enrichments table
  const { count: failed } = await supabase
    .from('failed_enrichments')
    .select('*', { count: 'exact', head: true });

  // Calculate remaining
  const remaining = total ? total - (enriched || 0) : 0;

  return {
    total: total || 0,
    enriched: enriched || 0,
    failed: failed || 0,
    remaining,
  };
}

/**
 * Get list of failed enrichments
 * @param page Page number (starting from 1)
 * @param pageSize Number of items per page
 * @returns List of failed enrichments with pagination
 */
export async function getFailedEnrichments(
  page: number = 1,
  pageSize: number = 20
): Promise<{
  items: FailedEnrichmentItem[];
  count: number;
  currentPage: number;
  totalPages: number;
}> {
  // Calculate range for pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('failed_enrichments')
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching failed enrichments:', error);
    throw error;
  }

  // Calculate total pages
  const totalPages = count ? Math.ceil(count / pageSize) : 0;

  return {
    items: (data || []) as FailedEnrichmentItem[],
    count: count || 0,
    currentPage: page,
    totalPages,
  };
}

/**
 * Get list of companies that need enrichment
 * @param page Page number (starting from 1)
 * @param pageSize Number of items per page
 * @returns List of companies needing enrichment with pagination
 */
export async function getRemainingCompanies(
  page: number = 1,
  pageSize: number = 20
): Promise<{
  items: EnrichedCompany[];
  count: number;
  currentPage: number;
  totalPages: number;
}> {
  // Calculate range for pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('companies')
    .select('*', { count: 'exact' })
    .is('company_number', null)
    .range(from, to)
    .order('original_name', { ascending: true });

  if (error) {
    console.error('Error fetching remaining companies:', error);
    throw error;
  }

  // Calculate total pages
  const totalPages = count ? Math.ceil(count / pageSize) : 0;

  return {
    items: (data || []) as EnrichedCompany[],
    count: count || 0,
    currentPage: page,
    totalPages,
  };
}

/**
 * Trigger enrichment process for failed items
 * @returns Status of the operation
 */
export async function triggerEnrichment(type: 'failed' | 'remaining'): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // First, check if the enrichment_jobs table exists
    const { error: tableCheckError } = await supabase
      .from('enrichment_jobs')
      .select('id')
      .limit(1);
    
    if (tableCheckError) {
      console.error('Enrichment jobs table check failed:', tableCheckError);
      
      // If the table doesn't exist, we should create it
      if (tableCheckError.code === '42P01') { // PostgreSQL code for "table does not exist"
        return {
          success: false,
          message: `The enrichment_jobs table doesn't exist in the database. Please run the database setup script.`
        };
      }
      
      return {
        success: false,
        message: `Failed to check enrichment_jobs table: ${tableCheckError.message}`
      };
    }

    // Create a record in the enrichment_jobs table to signal the server to start enrichment
    const { error, data } = await supabase
      .from('enrichment_jobs')
      .insert([
        {
          job_type: type === 'failed' ? 'reprocess_failed' : 'enrich_remaining',
          status: 'pending',
          created_at: new Date().toISOString(),
        }
      ])
      .select();

    if (error) {
      console.error('Error triggering enrichment:', error);
      return {
        success: false,
        message: `Failed to trigger ${type} enrichment: ${error.message}`
      };
    }

    console.log('Successfully created enrichment job:', data);
    
    return {
      success: true,
      message: `Successfully triggered ${type} enrichment process`
    };
  } catch (error: unknown) {
    console.error('Error triggering enrichment:', error);
    return {
      success: false,
      message: `Failed to trigger ${type} enrichment: ${
        error instanceof Error 
          ? error.message 
          : String(error) || 'Unknown error'
      }`
    };
  }
}

/**
 * Get active enrichment job (if any)
 * @returns Active job if exists, or null
 */
export async function getActiveEnrichmentJob(): Promise<{
  id: number;
  job_type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  items_processed: number;
  items_failed: number;
  total_items: number | null;
  progress_percentage: number | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from('enrichment_jobs')
      .select('*')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No active job found
        return null;
      }
      console.error('Error fetching active enrichment job:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getActiveEnrichmentJob:', error);
    return null;
  }
}

export interface EnrichmentLogEntry {
  id: number;
  job_id: number | null;
  log_level: string;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

/**
 * Get enrichment logs
 * @param jobId Optional job ID to filter logs
 * @param limit Maximum number of logs to return
 * @returns Array of log entries
 */
export async function getEnrichmentLogs(
  jobId?: number,
  limit: number = 100
): Promise<{
  logs: EnrichmentLogEntry[];
  hasMore: boolean;
}> {
  try {
    let query = supabase
      .from('enrichment_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit + 1);
    
    if (jobId) {
      query = query.eq('job_id', jobId);
    }
    
    const { data, error } = await query;

    if (error) {
      // Check if error is because table doesn't exist
      if (error.code === '42P01') {
        return { logs: [], hasMore: false };
      }
      console.error('Error fetching enrichment logs:', error);
      throw error;
    }

    const hasMore = data?.length > limit;
    const logs = data?.slice(0, limit) || [];

    return { logs, hasMore };
  } catch (error) {
    console.error('Error in getEnrichmentLogs:', error);
    return { logs: [], hasMore: false };
  }
}

/**
 * Add a log entry to the enrichment_logs table
 * @param message Log message
 * @param level Log level (info, warning, error)
 * @param jobId Optional job ID to associate with
 * @param metadata Additional metadata
 * @returns Success status
 */
export async function addEnrichmentLog(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  jobId?: number,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('enrichment_logs')
      .insert([
        {
          job_id: jobId || null,
          log_level: level,
          message,
          timestamp: new Date().toISOString(),
          metadata: metadata || null
        }
      ]);

    if (error) {
      console.error('Error adding enrichment log:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in addEnrichmentLog:', error);
    return false;
  }
} 