import { supabase } from '../lib/supabase';
import { addEnrichmentLog } from '../lib/supabase-api';

/**
 * Helper function to add a log entry to both the console and database
 */
export async function logEnrichmentProcess(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  jobId?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Get the current timestamp
  const timestamp = new Date().toISOString();
  
  // Format for console logging
  const levelFormatted = level.toUpperCase().padEnd(7);
  console.log(`[${timestamp}] [${levelFormatted}] ${message}`);
  
  // Add to database logs if supabase connection is available
  try {
    await addEnrichmentLog(message, level, jobId, metadata);
  } catch (error) {
    // If database logging fails, still continue with file logging
    console.error('Failed to add log to database:', error);
  }
}

/**
 * Update enrichment job status and record
 */
export async function updateEnrichmentJob(
  jobId: number, 
  updates: {
    status?: string;
    itemsProcessed?: number;
    itemsFailed?: number;
    result?: string;
    startedAt?: boolean;
    completedAt?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  try {
    const updateData: Record<string, unknown> = {};
    
    if (updates.status) {
      updateData.status = updates.status;
    }
    
    if (updates.itemsProcessed !== undefined) {
      updateData.items_processed = updates.itemsProcessed;
    }
    
    if (updates.itemsFailed !== undefined) {
      updateData.items_failed = updates.itemsFailed;
    }
    
    if (updates.result) {
      updateData.result = updates.result;
    }
    
    if (updates.startedAt) {
      updateData.started_at = new Date().toISOString();
    }
    
    if (updates.completedAt) {
      updateData.completed_at = new Date().toISOString();
    }
    
    if (updates.metadata) {
      updateData.metadata = updates.metadata;
    }
    
    const { error } = await supabase
      .from('enrichment_jobs')
      .update(updateData)
      .eq('id', jobId);
    
    if (error) {
      console.error('Error updating enrichment job:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in updateEnrichmentJob:', error);
    return false;
  }
}

/**
 * Get the active enrichment job ID if one exists
 */
export async function getActiveJobId(): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('enrichment_jobs')
      .select('id')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return data.id;
  } catch (error) {
    console.error('Error getting active job ID:', error);
    return null;
  }
} 