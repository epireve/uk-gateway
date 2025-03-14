"use client";

import React, { useState, useEffect } from 'react';
import { getEnrichmentStats, getFailedEnrichments, getRemainingCompanies, triggerEnrichment, FailedEnrichmentItem, getActiveEnrichmentJob, getEnrichmentLogs, EnrichmentLogEntry } from '@/lib/supabase-api';
import { EnrichedCompany } from '@/lib/models';

type TabType = 'overview' | 'failed' | 'remaining';

interface StatsData {
  total: number;
  enriched: number;
  failed: number;
  remaining: number;
}

interface TabContentProps {
  activeTab: TabType;
}

// Define an interface for the active job object
interface ActiveEnrichmentJob {
  id: number;
  job_type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  items_processed: number;
  items_failed: number;
  total_items: number | null;
  progress_percentage: number | null;
}

const EnrichmentOverview: React.FC<{ stats: StatsData }> = ({ stats: initialStats }) => {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<EnrichmentLogEntry[]>([]);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveEnrichmentJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [stats, setStats] = useState<StatsData>(initialStats);

  // Function to fetch stats
  const fetchStats = async () => {
    try {
      const freshStats = await getEnrichmentStats();
      setStats(freshStats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Function to fetch logs and job status
  const fetchLogsAndJobStatus = async () => {
    try {
      setLoading(true);
      
      // Get active job
      const job = await getActiveEnrichmentJob();
      setActiveJob(job);
      
      // Get logs
      const { logs, hasMore } = await getEnrichmentLogs(job?.id, 50);
      setLogs(logs);
      setHasMoreLogs(hasMore);
      
      // If we have an active job, show logs automatically
      if (job) {
        setShowLogs(true);
        // Also refresh stats when there's an active job
        await fetchStats();
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Set up polling for logs and job status when an enrichment job is active
  useEffect(() => {
    // Initial fetch
    fetchLogsAndJobStatus();
    
    // Set up polling if not already set
    if (!pollingInterval) {
      const interval = setInterval(fetchLogsAndJobStatus, 5000); // Poll every 5 seconds
      setPollingInterval(interval);
    }
    
    // Clean up interval on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  // Function to format log level with appropriate styling
  const getLogLevelStyles = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-600 font-medium';
      case 'warning':
        return 'text-amber-600 font-medium';
      case 'info':
      default:
        return 'text-blue-600 font-medium';
    }
  };

  // Function to format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="mb-8">
      <h2 className="govuk-heading-m">Data Enrichment Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-6 rounded-md shadow-sm border border-gray-200">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-gray-500">Total Companies</div>
        </div>
        <div className="bg-white p-6 rounded-md shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-green-600">{stats.enriched}</div>
          <div className="text-gray-500">Enriched ({Math.round(stats.enriched / stats.total * 100)}%)</div>
        </div>
        <div className="bg-white p-6 rounded-md shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-yellow-600">{stats.remaining}</div>
          <div className="text-gray-500">Remaining ({Math.round(stats.remaining / stats.total * 100)}%)</div>
        </div>
        <div className="bg-white p-6 rounded-md shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-gray-500">Failed</div>
        </div>
      </div>
      
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div className="bg-green-600 h-4 rounded-full" style={{ width: `${Math.round(stats.enriched / stats.total * 100)}%` }}></div>
        </div>
      </div>
      
      {/* Active Job Status */}
      {activeJob && (
        <div className="mb-6 p-4 border border-blue-200 bg-blue-50 rounded-md">
          <h3 className="text-lg font-medium mb-2">Active Enrichment Process</h3>
          <p className="mb-2">
            <span className="font-medium">Type:</span> {activeJob.job_type === 'reprocess_failed' ? 'Reprocessing Failed Items' : 'Processing Remaining Items'}
          </p>
          <p className="mb-2">
            <span className="font-medium">Status:</span> {activeJob.status === 'pending' ? 'Pending' : 'Processing'}
          </p>
          <p className="mb-2">
            <span className="font-medium">Started:</span> {activeJob.started_at ? new Date(activeJob.started_at).toLocaleString() : 'Not started yet'}
          </p>
          {activeJob.total_items !== null && activeJob.total_items > 0 && (
            <p className="mb-2">
              <span className="font-medium">Total Items:</span> {activeJob.total_items}
            </p>
          )}
          {activeJob.items_processed > 0 && (
            <p className="mb-2">
              <span className="font-medium">Items Processed:</span> {activeJob.items_processed}
            </p>
          )}
          {activeJob.items_failed > 0 && (
            <p className="mb-2">
              <span className="font-medium">Items Failed:</span> {activeJob.items_failed}
            </p>
          )}
          
          {/* Add progress bar for active job */}
          {activeJob.progress_percentage !== null && activeJob.progress_percentage > 0 && (
            <div className="mt-4">
              <div className="w-full bg-blue-100 rounded-full h-2.5 mb-1">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${activeJob.progress_percentage}%` }}
                ></div>
              </div>
              <p className="text-sm text-right text-blue-700">{activeJob.progress_percentage}% Complete</p>
            </div>
          )}
        </div>
      )}
      
      {/* Log Controls */}
      <div className="mb-4">
        <button 
          onClick={() => setShowLogs(!showLogs)} 
          className="govuk-button govuk-button--secondary"
        >
          {showLogs ? 'Hide Logs' : 'Show Logs'}
        </button>
        
        {showLogs && (
          <button 
            onClick={fetchLogsAndJobStatus} 
            className="govuk-button govuk-button--secondary ml-2"
            disabled={loading}
          >
            Refresh Logs
          </button>
        )}
        
        {/* Add a separate button to refresh stats */}
        <button 
          onClick={fetchStats} 
          className="govuk-button govuk-button--secondary ml-2"
          disabled={loading}
        >
          Refresh Stats
        </button>
      </div>
      
      {/* Logs Display */}
      {showLogs && (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="p-3 bg-gray-100 border-b border-gray-200 font-medium">
            Enrichment Process Logs
          </div>
          
          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-govuk-blue mx-auto"></div>
              <p className="mt-2">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No logs available. Logs will appear here when an enrichment process is running.
            </div>
          ) : (
            <div className="overflow-y-auto max-h-96">
              <table className="w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Level
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={getLogLevelStyles(log.log_level)}>
                          {log.log_level.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 whitespace-pre-wrap">
                        {log.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {hasMoreLogs && (
            <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
              <button 
                className="text-blue-600 hover:text-blue-800 font-medium" 
                onClick={fetchLogsAndJobStatus}
              >
                Load more logs
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const FailedEnrichmentsTab: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [failedItems, setFailedItems] = useState<FailedEnrichmentItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveEnrichmentJob | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const loadFailedItems = async () => {
    setLoading(true);
    try {
      const result = await getFailedEnrichments(page, pageSize);
      setFailedItems(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Error loading failed items:', error);
      setMessage({ text: 'Failed to load data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Check for active job and refresh data
  const checkActiveJobAndRefresh = async () => {
    try {
      // Get active job status
      const job = await getActiveEnrichmentJob();
      
      // Only update if job status changed or if job is processing
      if (
        (job && (!activeJob || job.status !== activeJob.status)) ||
        (job && job.status === 'processing')
      ) {
        setActiveJob(job);
        await loadFailedItems();
      } else if (!job && activeJob) {
        // Job completed or was removed
        setActiveJob(null);
        await loadFailedItems();
      }
    } catch (error) {
      console.error('Error checking active job:', error);
    }
  };

  // Set up polling for data refreshes
  useEffect(() => {
    // Initial load
    loadFailedItems();
    checkActiveJobAndRefresh();
    
    // Set up polling if not already set
    if (!pollingInterval) {
      const interval = setInterval(checkActiveJobAndRefresh, 10000); // Poll every 10 seconds
      setPollingInterval(interval);
    }
    
    // Clean up interval on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  // Reload when page changes or when manually refreshed
  useEffect(() => {
    loadFailedItems();
  }, [page, refreshCount]);

  const handleProcessFailed = async () => {
    setProcessing(true);
    setMessage({ text: '', type: '' });
    try {
      const result = await triggerEnrichment('failed');
      setMessage({ 
        text: result.message, 
        type: result.success ? 'success' : 'error' 
      });
      
      // Force refresh data after triggering enrichment
      if (result.success) {
        setTimeout(() => loadFailedItems(), 1500);
      }
    } catch (error) {
      console.error('Error processing failed items:', error);
      setMessage({ text: 'Failed to start processing', type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="govuk-heading-m">Failed Enrichments</h2>
        <div className="flex space-x-2">
          <button 
            onClick={() => setRefreshCount(prev => prev + 1)} 
            className="govuk-button govuk-button--secondary"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh List'}
          </button>
          <button 
            onClick={handleProcessFailed}
            disabled={processing || failedItems.length === 0}
            className="govuk-button"
          >
            {processing ? 'Processing...' : 'Process Failed Items'}
          </button>
        </div>
      </div>

      {activeJob && activeJob.job_type === 'reprocess_failed' && (
        <div className="p-4 mb-4 bg-blue-50 border border-blue-200 rounded">
          <p className="font-medium">Reprocessing failed enrichments</p>
          {activeJob.progress_percentage !== null && (
            <div className="mt-2">
              <div className="w-full bg-blue-100 rounded-full h-2.5 mb-1">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${activeJob.progress_percentage}%` }}
                ></div>
              </div>
              <p className="text-sm text-right text-blue-700">
                {activeJob.progress_percentage}% Complete
                {activeJob.items_processed > 0 && ` (${activeJob.items_processed} processed)`}
              </p>
            </div>
          )}
        </div>
      )}

      {message.text && (
        <div className={`p-4 mb-4 rounded ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center my-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-govuk-blue"></div>
        </div>
      ) : failedItems.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded">
          No failed enrichments found
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Retry Count
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Error
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Attempt
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {failedItems.map((item, index) => (
                  <tr 
                    key={item.id} 
                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors duration-150 ease-in-out`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.company_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.retry_count}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {item.last_error?.substring(0, 50)}...
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(item.updated_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <div className="inline-flex rounded-md shadow-sm">
                <button
                  className="relative inline-flex items-center px-4 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span className="relative inline-flex items-center px-4 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="relative inline-flex items-center px-4 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const RemainingItemsTab: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [remainingItems, setRemainingItems] = useState<EnrichedCompany[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveEnrichmentJob | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const loadRemainingItems = async () => {
    setLoading(true);
    try {
      const result = await getRemainingCompanies(page, pageSize);
      setRemainingItems(result.items);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Error loading remaining items:', error);
      setMessage({ text: 'Failed to load data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Check for active job and refresh data
  const checkActiveJobAndRefresh = async () => {
    try {
      // Get active job status
      const job = await getActiveEnrichmentJob();
      
      // Only update if job status changed or if job is processing
      if (
        (job && (!activeJob || job.status !== activeJob.status)) ||
        (job && job.status === 'processing')
      ) {
        setActiveJob(job);
        await loadRemainingItems();
      } else if (!job && activeJob) {
        // Job completed or was removed
        setActiveJob(null);
        await loadRemainingItems();
      }
    } catch (error) {
      console.error('Error checking active job:', error);
    }
  };

  // Set up polling for data refreshes
  useEffect(() => {
    // Initial load
    loadRemainingItems();
    checkActiveJobAndRefresh();
    
    // Set up polling if not already set
    if (!pollingInterval) {
      const interval = setInterval(checkActiveJobAndRefresh, 10000); // Poll every 10 seconds
      setPollingInterval(interval);
    }
    
    // Clean up interval on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  // Reload when page changes or when manually refreshed
  useEffect(() => {
    loadRemainingItems();
  }, [page, refreshCount]);

  const handleProcessRemaining = async () => {
    setProcessing(true);
    setMessage({ text: '', type: '' });
    try {
      const result = await triggerEnrichment('remaining');
      if (!result) {
        setMessage({ 
          text: 'Failed to trigger enrichment: No response from server', 
          type: 'error' 
        });
        return;
      }
      
      setMessage({ 
        text: result.message || 'Operation completed, but no status message was returned', 
        type: result.success ? 'success' : 'error' 
      });

      // Force refresh data after triggering enrichment
      if (result.success) {
        setTimeout(() => loadRemainingItems(), 1500);
      }
    } catch (error) {
      console.error('Error processing remaining items:', error);
      const errorMessage = error instanceof Error 
        ? `Failed to start processing: ${error.message}` 
        : 'Failed to start processing due to an unknown error';
      
      setMessage({ text: errorMessage, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="govuk-heading-m">Remaining Items</h2>
        <div className="flex space-x-2">
          <button 
            onClick={() => setRefreshCount(prev => prev + 1)} 
            className="govuk-button govuk-button--secondary"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh List'}
          </button>
          <button 
            onClick={handleProcessRemaining}
            disabled={processing || remainingItems.length === 0}
            className="govuk-button"
          >
            {processing ? 'Processing...' : 'Process Remaining Items'}
          </button>
        </div>
      </div>

      {activeJob && activeJob.job_type === 'enrich_remaining' && (
        <div className="p-4 mb-4 bg-blue-50 border border-blue-200 rounded">
          <p className="font-medium">Enrichment process is currently running</p>
          {activeJob.progress_percentage !== null && (
            <div className="mt-2">
              <div className="w-full bg-blue-100 rounded-full h-2.5 mb-1">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${activeJob.progress_percentage}%` }}
                ></div>
              </div>
              <p className="text-sm text-right text-blue-700">
                {activeJob.progress_percentage}% Complete
                {activeJob.items_processed > 0 && ` (${activeJob.items_processed} processed)`}
              </p>
            </div>
          )}
        </div>
      )}

      {message.text && (
        <div className={`p-4 mb-4 rounded ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center my-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-govuk-blue"></div>
        </div>
      ) : remainingItems.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded">
          No remaining items found
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Town/City
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    County
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type & Rating
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {remainingItems.map((item, index) => (
                  <tr 
                    key={item.id} 
                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors duration-150 ease-in-out`}
                  >
                    <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900">
                      {item.original_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.town_city || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.county || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.type_rating || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center mt-6">
              <div className="inline-flex rounded-md shadow-sm">
                <button
                  className="relative inline-flex items-center px-4 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span className="relative inline-flex items-center px-4 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="relative inline-flex items-center px-4 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const TabContent: React.FC<TabContentProps> = ({ activeTab }) => {
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    enriched: 0,
    failed: 0,
    remaining: 0
  });
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await getEnrichmentStats();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  // Refresh data when the tab changes
  useEffect(() => {
    // Trigger a refresh by incrementing refreshKey
    setRefreshKey(prev => prev + 1);
  }, [activeTab]);

  if (loading && activeTab === 'overview') {
    return (
      <div className="flex justify-center my-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-govuk-blue"></div>
      </div>
    );
  }

  return (
    <div>
      {activeTab === 'overview' && <EnrichmentOverview stats={stats} key={`overview-${refreshKey}`} />}
      {activeTab === 'failed' && <FailedEnrichmentsTab key={`failed-${refreshKey}`} />}
      {activeTab === 'remaining' && <RemainingItemsTab key={`remaining-${refreshKey}`} />}
    </div>
  );
};

export const EnrichmentStatus: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [activeJob, setActiveJob] = useState<ActiveEnrichmentJob | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Check for active job to highlight the appropriate tab
  const checkActiveJob = async () => {
    try {
      const job = await getActiveEnrichmentJob();
      setActiveJob(job);
      
      // Automatically switch to the relevant tab if a job is active
      if (job && job.job_type === 'reprocess_failed' && activeTab !== 'failed') {
        setActiveTab('failed');
      } else if (job && job.job_type === 'enrich_remaining' && activeTab !== 'remaining') {
        setActiveTab('remaining');
      }
    } catch (error) {
      console.error('Error checking active job:', error);
    }
  };

  // Set up polling to check for active jobs
  useEffect(() => {
    // Initial check
    checkActiveJob();
    
    // Set up polling
    if (!pollingInterval) {
      const interval = setInterval(checkActiveJob, 15000); // Check every 15 seconds
      setPollingInterval(interval);
    }
    
    // Clean up on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  return (
    <div className="bg-white p-6 rounded-md shadow-sm">
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-govuk-blue text-govuk-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('failed')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'failed'
                ? 'border-govuk-blue text-govuk-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Failed Enrichments
            {activeJob && activeJob.job_type === 'reprocess_failed' && (
              <span className="ml-2 w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('remaining')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'remaining'
                ? 'border-govuk-blue text-govuk-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Remaining Items
            {activeJob && activeJob.job_type === 'enrich_remaining' && (
              <span className="ml-2 w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
            )}
          </button>
        </nav>
      </div>

      <TabContent activeTab={activeTab} />
    </div>
  );
}; 