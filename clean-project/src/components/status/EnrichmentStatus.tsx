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
  const [updatingLogs, setUpdatingLogs] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [stats, setStats] = useState<StatsData>(initialStats);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState<boolean>(true);
  const logsEndRef = React.useRef<HTMLTableCellElement>(null);

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
  const fetchLogsAndJobStatus = async (initialLoad = false) => {
    try {
      if (initialLoad) {
        setLoading(true);
      } else {
        setUpdatingLogs(true);
      }
      
      // Get active job
      const job = await getActiveEnrichmentJob();
      setActiveJob(job);
      
      // Get logs
      const { logs: newLogs, hasMore } = await getEnrichmentLogs(job?.id, 50);
      
      if (initialLoad) {
        // Initial load, replace logs
        setLogs(newLogs);
      } else {
        // Append new logs without duplicates
        if (newLogs.length > 0) {
          // Filter out logs we already have
          const existingLogIds = new Set(logs.map(log => log.id));
          const uniqueNewLogs = newLogs.filter(log => !existingLogIds.has(log.id));
          
          if (uniqueNewLogs.length > 0) {
            setLogs(prevLogs => [...prevLogs, ...uniqueNewLogs]);
            
            // Scroll to end of logs if user is already near the bottom
            setTimeout(() => {
              if (logsEndRef.current) {
                logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }, 100);
          }
        }
      }
      
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
      setUpdatingLogs(false);
    }
  };

  // Set up polling for logs and job status when an enrichment job is active
  useEffect(() => {
    // Initial fetch
    fetchLogsAndJobStatus(true);
    
    // Clean up any existing interval first
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    
    // Set up polling if auto-refresh is enabled
    if (autoRefreshLogs) {
      const interval = setInterval(() => fetchLogsAndJobStatus(false), 5000); // Poll every 5 seconds
      setPollingInterval(interval);
    }
    
    // Clean up interval on unmount
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [autoRefreshLogs]);

  // Function to format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="mb-8">
      <h2 className="govuk-heading-m">Enrichment Overview</h2>
      <div className="govuk-grid-row mb-6">
        <div className="govuk-grid-column-one-quarter">
          <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0">
            <div className="govuk-panel__title govuk-!-font-size-27">{stats.total}</div>
            <div className="govuk-panel__body govuk-!-font-size-16">Total Companies</div>
          </div>
        </div>
        <div className="govuk-grid-column-one-quarter">
          <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-background-colour-green">
            <div className="govuk-panel__title govuk-!-font-size-27">{stats.enriched}</div>
            <div className="govuk-panel__body govuk-!-font-size-16">Enriched ({Math.round(stats.enriched / stats.total * 100)}%)</div>
          </div>
        </div>
        <div className="govuk-grid-column-one-quarter">
          <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-background-colour-yellow">
            <div className="govuk-panel__title govuk-!-font-size-27">{stats.remaining}</div>
            <div className="govuk-panel__body govuk-!-font-size-16">Remaining ({Math.round(stats.remaining / stats.total * 100)}%)</div>
          </div>
        </div>
        <div className="govuk-grid-column-one-quarter">
          <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-background-colour-red">
            <div className="govuk-panel__title govuk-!-font-size-27">{stats.failed}</div>
            <div className="govuk-panel__body govuk-!-font-size-16">Failed</div>
          </div>
        </div>
      </div>
      
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div className="bg-green-600 h-4 rounded-full" style={{ width: `${Math.round(stats.enriched / stats.total * 100)}%` }}></div>
        </div>
      </div>
      
      {/* Active Job Status */}
      {activeJob && (
        <div className="govuk-inset-text govuk-!-margin-bottom-6">
          <h3 className="govuk-heading-s govuk-!-margin-bottom-2">Active Enrichment Process</h3>
          <p className="govuk-body-s govuk-!-margin-bottom-2">
            <span className="govuk-!-font-weight-bold">Type:</span> {activeJob.job_type === 'reprocess_failed' ? 'Reprocessing Failed Items' : 'Processing Remaining Items'}
          </p>
          <p className="govuk-body-s govuk-!-margin-bottom-2">
            <span className="govuk-!-font-weight-bold">Status:</span> {activeJob.status === 'pending' ? 'Pending' : 'Processing'}
          </p>
          <p className="govuk-body-s govuk-!-margin-bottom-2">
            <span className="govuk-!-font-weight-bold">Started:</span> {activeJob.started_at ? new Date(activeJob.started_at).toLocaleString() : 'Not started yet'}
          </p>
          {activeJob.total_items !== null && activeJob.total_items > 0 && (
            <p className="govuk-body-s govuk-!-margin-bottom-2">
              <span className="govuk-!-font-weight-bold">Total Items:</span> {activeJob.total_items}
            </p>
          )}
          {activeJob.items_processed > 0 && (
            <p className="govuk-body-s govuk-!-margin-bottom-2">
              <span className="govuk-!-font-weight-bold">Items Processed:</span> {activeJob.items_processed}
            </p>
          )}
          {activeJob.items_failed > 0 && (
            <p className="govuk-body-s govuk-!-margin-bottom-2">
              <span className="govuk-!-font-weight-bold">Items Failed:</span> {activeJob.items_failed}
            </p>
          )}
          
          {/* Add progress bar for active job */}
          {activeJob.progress_percentage !== null && activeJob.progress_percentage > 0 && (
            <div className="govuk-!-margin-top-4">
              <div className="govuk-progress-bar">
                <div 
                  className="govuk-progress-bar__fill" 
                  style={{ width: `${activeJob.progress_percentage}%` }}
                  role="progressbar"
                  aria-valuenow={activeJob.progress_percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ></div>
              </div>
              <p className="govuk-body-s govuk-!-margin-top-1 govuk-!-text-align-right">{activeJob.progress_percentage}% Complete</p>
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
          <>
            <button 
              onClick={() => fetchLogsAndJobStatus(true)} 
              className="govuk-button govuk-button--secondary govuk-!-margin-left-2"
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh Logs'}
            </button>
            
            <div className="govuk-checkboxes govuk-checkboxes--small govuk-!-display-inline-block govuk-!-margin-left-4">
              <div className="govuk-checkboxes__item">
                <input 
                  type="checkbox"
                  id="auto-refresh-logs" 
                  className="govuk-checkboxes__input"
                  checked={autoRefreshLogs} 
                  onChange={() => setAutoRefreshLogs(!autoRefreshLogs)} 
                />
                <label className="govuk-label govuk-checkboxes__label" htmlFor="auto-refresh-logs">
                  Auto-refresh logs
                </label>
              </div>
            </div>
          </>
        )}
        
        {/* Add a separate button to refresh stats */}
        <button 
          onClick={fetchStats} 
          className="govuk-button govuk-button--secondary govuk-!-margin-left-2"
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
            {updatingLogs && (
              <span className="inline-block ml-2 h-4 w-4">
                <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
            )}
          </div>
          
          {loading ? (
            <div className="p-6 text-center">
              <div className="govuk-loader"></div>
              <p className="govuk-body govuk-!-margin-top-2">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-center govuk-!-text-colour-secondary">
              No logs available. Logs will appear here when an enrichment process is running.
            </div>
          ) : (
            <div className="govuk-!-overflow-y-auto" style={{ maxHeight: '24rem' }}>
              <table className="govuk-table">
                <thead className="govuk-table__head">
                  <tr className="govuk-table__row">
                    <th scope="col" className="govuk-table__header">Time</th>
                    <th scope="col" className="govuk-table__header">Level</th>
                    <th scope="col" className="govuk-table__header">Message</th>
                  </tr>
                </thead>
                <tbody className="govuk-table__body">
                  {logs.map((log) => (
                    <tr key={log.id} className="govuk-table__row">
                      <td className="govuk-table__cell">{formatTimestamp(log.timestamp)}</td>
                      <td className="govuk-table__cell">
                        <span className={`govuk-tag ${log.log_level.toLowerCase() === 'error' ? 'govuk-tag--red' : log.log_level.toLowerCase() === 'warning' ? 'govuk-tag--yellow' : 'govuk-tag--blue'}`}>
                          {log.log_level.toUpperCase()}
                        </span>
                      </td>
                      <td className="govuk-table__cell govuk-!-white-space-pre-wrap">{log.message}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={3} ref={logsEndRef} className="govuk-table__cell"></td></tr>
                </tbody>
              </table>
            </div>
          )}
          
          {hasMoreLogs && (
            <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
              <button 
                className="govuk-button govuk-button--secondary" 
                onClick={() => fetchLogsAndJobStatus(true)}
                disabled={loading}
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
  const [stats, setStats] = useState<StatsData | null>(null);

  const loadFailedItems = async () => {
    setLoading(true);
    try {
      const result = await getFailedEnrichments(page, pageSize);
      setFailedItems(result.items);
      setTotalPages(result.totalPages);
      
      // Get overall stats to display count information
      const statsData = await getEnrichmentStats();
      setStats(statsData);
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

      {/* Stats summary cards */}
      {stats && (
        <div className="govuk-grid-row mb-6">
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-background-colour-red">
              <div className="govuk-panel__title govuk-!-font-size-27">{stats.failed}</div>
              <div className="govuk-panel__body govuk-!-font-size-16">Failed Enrichments</div>
            </div>
          </div>
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0">
              <div className="govuk-panel__title govuk-!-font-size-27">{stats.total}</div>
              <div className="govuk-panel__body govuk-!-font-size-16">Total Companies</div>
            </div>
          </div>
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0">
              <div className="govuk-panel__title govuk-!-font-size-27">
                {stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0}%
              </div>
              <div className="govuk-panel__body govuk-!-font-size-16">Failed Percentage</div>
            </div>
          </div>
        </div>
      )}

      {activeJob && activeJob.job_type === 'reprocess_failed' && (
        <div className="govuk-inset-text govuk-!-margin-bottom-4">
          <p className="govuk-body-s govuk-!-font-weight-bold govuk-!-margin-bottom-2">Reprocessing failed enrichments</p>
          {activeJob.progress_percentage !== null && (
            <div className="govuk-!-margin-top-2">
              <div className="govuk-progress-bar">
                <div 
                  className="govuk-progress-bar__fill" 
                  style={{ width: `${activeJob.progress_percentage}%` }}
                  role="progressbar"
                  aria-valuenow={activeJob.progress_percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ></div>
              </div>
              <p className="govuk-body-s govuk-!-margin-top-1 govuk-!-text-align-right">
                {activeJob.progress_percentage}% Complete
                {activeJob.items_processed > 0 && ` (${activeJob.items_processed} processed)`}
                {activeJob.total_items && ` of ${activeJob.total_items} items`}
              </p>
            </div>
          )}
        </div>
      )}

      {message.text && (
        <div className={`govuk-inset-text govuk-!-margin-bottom-4 ${message.type === 'error' ? 'govuk-inset-text--error' : 'govuk-inset-text--success'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center my-8">
          <div className="govuk-loader"></div>
        </div>
      ) : failedItems.length === 0 ? (
        <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-6 govuk-!-margin-bottom-0 govuk-!-background-colour-light-grey govuk-!-text-colour-secondary">
          No failed enrichments found
        </div>
      ) : (
        <>
          <div className="govuk-!-margin-bottom-6">
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th scope="col" className="govuk-table__header">Company Name</th>
                  <th scope="col" className="govuk-table__header">Retry Count</th>
                  <th scope="col" className="govuk-table__header">Last Error</th>
                  <th scope="col" className="govuk-table__header">Last Attempt</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {failedItems.map((item) => (
                  <tr key={item.id} className="govuk-table__row">
                    <td className="govuk-table__cell govuk-!-font-weight-bold">{item.company_name}</td>
                    <td className="govuk-table__cell">{item.retry_count}</td>
                    <td className="govuk-table__cell govuk-table__cell--truncate">{item.last_error?.substring(0, 50)}...</td>
                    <td className="govuk-table__cell">{new Date(item.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="govuk-pagination" role="navigation" aria-label="Pagination">
              <div className="govuk-pagination__prev">
                <a className={`govuk-pagination__link ${page === 1 ? 'govuk-pagination__link--disabled' : ''}`} 
                   href="#prev" 
                   onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                   rel="prev">
                  <svg className="govuk-pagination__icon govuk-pagination__icon--prev" xmlns="http://www.w3.org/2000/svg" height="13" width="15" aria-hidden="true">
                    <path d="m6.5938-0.0078125-6.7266 6.7266 6.7441 6.4062 1.377-1.449-4.1856-3.9768h12.896v-2h-12.984l4.2931-4.293-1.414-1.414z"></path>
                  </svg>
                  <span className="govuk-pagination__link-title">Previous</span>
                </a>
              </div>
              <ul className="govuk-pagination__list">
                {Array.from({length: Math.min(totalPages, 5)}, (_, i) => {
                  const pageNumber = i + 1;
                  return (
                    <li key={pageNumber} className="govuk-pagination__item">
                      <a className={`govuk-pagination__link ${pageNumber === page ? 'govuk-pagination__link--current' : ''}`} 
                         href={`#page-${pageNumber}`}
                         onClick={(e) => { e.preventDefault(); setPage(pageNumber); }}
                         aria-current={pageNumber === page ? 'page' : undefined}
                         aria-label={`Page ${pageNumber}`}>
                        {pageNumber}
                      </a>
                    </li>
                  );
                })}
              </ul>
              <div className="govuk-pagination__next">
                <a className={`govuk-pagination__link ${page === totalPages ? 'govuk-pagination__link--disabled' : ''}`}
                   href="#next"
                   onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                   rel="next">
                  <span className="govuk-pagination__link-title">Next</span>
                  <svg className="govuk-pagination__icon govuk-pagination__icon--next" xmlns="http://www.w3.org/2000/svg" height="13" width="15" aria-hidden="true">
                    <path d="m8.107-0.0078125-1.4136 1.414 4.2926 4.293h-12.986v2h12.896l-4.1855 3.9766 1.377 1.4492 6.7441-6.4062-6.7246-6.7266z"></path>
                  </svg>
                </a>
              </div>
            </nav>
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
  const [stats, setStats] = useState<StatsData | null>(null);

  const loadRemainingItems = async () => {
    setLoading(true);
    try {
      const result = await getRemainingCompanies(page, pageSize);
      setRemainingItems(result.items);
      setTotalPages(result.totalPages);
      
      // Get overall stats to display count information
      const statsData = await getEnrichmentStats();
      setStats(statsData);
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

      {/* Stats summary cards */}
      {stats && (
        <div className="govuk-grid-row mb-6">
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-background-colour-yellow">
              <div className="govuk-panel__title govuk-!-font-size-27">{stats.remaining}</div>
              <div className="govuk-panel__body govuk-!-font-size-16">Remaining Items</div>
            </div>
          </div>
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0">
              <div className="govuk-panel__title govuk-!-font-size-27">{stats.total}</div>
              <div className="govuk-panel__body govuk-!-font-size-16">Total Companies</div>
            </div>
          </div>
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0">
              <div className="govuk-panel__title govuk-!-font-size-27">
                {stats.total > 0 ? Math.round((stats.remaining / stats.total) * 100) : 0}%
              </div>
              <div className="govuk-panel__body govuk-!-font-size-16">Remaining Percentage</div>
            </div>
          </div>
        </div>
      )}

      {activeJob && activeJob.job_type === 'enrich_remaining' && (
        <div className="govuk-inset-text govuk-!-margin-bottom-4">
          <p className="govuk-body-s govuk-!-font-weight-bold govuk-!-margin-bottom-2">Enrichment process is currently running</p>
          {activeJob.progress_percentage !== null && (
            <div className="govuk-!-margin-top-2">
              <div className="govuk-progress-bar">
                <div 
                  className="govuk-progress-bar__fill" 
                  style={{ width: `${activeJob.progress_percentage}%` }}
                  role="progressbar"
                  aria-valuenow={activeJob.progress_percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ></div>
              </div>
              <p className="govuk-body-s govuk-!-margin-top-1 govuk-!-text-align-right">
                {activeJob.progress_percentage}% Complete
                {activeJob.items_processed > 0 && ` (${activeJob.items_processed} processed)`}
                {activeJob.total_items && ` of ${activeJob.total_items} items`}
              </p>
            </div>
          )}
        </div>
      )}

      {message.text && (
        <div className={`govuk-inset-text govuk-!-margin-bottom-4 ${message.type === 'error' ? 'govuk-inset-text--error' : 'govuk-inset-text--success'}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center my-8">
          <div className="govuk-loader"></div>
        </div>
      ) : remainingItems.length === 0 ? (
        <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-6 govuk-!-margin-bottom-0 govuk-!-background-colour-light-grey govuk-!-text-colour-secondary">
          No remaining items found
        </div>
      ) : (
        <>
          <div className="govuk-!-margin-bottom-6">
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th scope="col" className="govuk-table__header">Company Name</th>
                  <th scope="col" className="govuk-table__header">Town/City</th>
                  <th scope="col" className="govuk-table__header">County</th>
                  <th scope="col" className="govuk-table__header">Type & Rating</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {remainingItems.map((item) => (
                  <tr key={item.id} className="govuk-table__row">
                    <td className="govuk-table__cell govuk-!-font-weight-bold">{item.original_name}</td>
                    <td className="govuk-table__cell">{item.town_city || '-'}</td>
                    <td className="govuk-table__cell">{item.county || '-'}</td>
                    <td className="govuk-table__cell">{item.type_rating || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="govuk-pagination" role="navigation" aria-label="Pagination">
              <div className="govuk-pagination__prev">
                <a className={`govuk-pagination__link ${page === 1 ? 'govuk-pagination__link--disabled' : ''}`} 
                   href="#prev" 
                   onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                   rel="prev">
                  <svg className="govuk-pagination__icon govuk-pagination__icon--prev" xmlns="http://www.w3.org/2000/svg" height="13" width="15" aria-hidden="true">
                    <path d="m6.5938-0.0078125-6.7266 6.7266 6.7441 6.4062 1.377-1.449-4.1856-3.9768h12.896v-2h-12.984l4.2931-4.293-1.414-1.414z"></path>
                  </svg>
                  <span className="govuk-pagination__link-title">Previous</span>
                </a>
              </div>
              <ul className="govuk-pagination__list">
                {Array.from({length: Math.min(totalPages, 5)}, (_, i) => {
                  const pageNumber = i + 1;
                  return (
                    <li key={pageNumber} className="govuk-pagination__item">
                      <a className={`govuk-pagination__link ${pageNumber === page ? 'govuk-pagination__link--current' : ''}`} 
                         href={`#page-${pageNumber}`}
                         onClick={(e) => { e.preventDefault(); setPage(pageNumber); }}
                         aria-current={pageNumber === page ? 'page' : undefined}
                         aria-label={`Page ${pageNumber}`}>
                        {pageNumber}
                      </a>
                    </li>
                  );
                })}
              </ul>
              <div className="govuk-pagination__next">
                <a className={`govuk-pagination__link ${page === totalPages ? 'govuk-pagination__link--disabled' : ''}`}
                   href="#next"
                   onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                   rel="next">
                  <span className="govuk-pagination__link-title">Next</span>
                  <svg className="govuk-pagination__icon govuk-pagination__icon--next" xmlns="http://www.w3.org/2000/svg" height="13" width="15" aria-hidden="true">
                    <path d="m8.107-0.0078125-1.4136 1.414 4.2926 4.293h-12.986v2h12.896l-4.1855 3.9766 1.377 1.4492 6.7441-6.4062-6.7246-6.7266z"></path>
                  </svg>
                </a>
              </div>
            </nav>
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
        <div className="govuk-loader"></div>
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
  const [autoSwitchTabs, setAutoSwitchTabs] = useState<boolean>(false);

  // Check for active job to highlight the appropriate tab
  const checkActiveJob = async () => {
    try {
      const job = await getActiveEnrichmentJob();
      setActiveJob(job);
      
      // Only auto-switch if the feature is enabled
      if (autoSwitchTabs) {
        // Automatically switch to the relevant tab if a job is active
        if (job && job.job_type === 'reprocess_failed' && activeTab !== 'failed') {
          setActiveTab('failed');
        } else if (job && job.job_type === 'enrich_remaining' && activeTab !== 'remaining') {
          setActiveTab('remaining');
        }
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
    <div className="container mx-auto py-6 px-4">
      <div className="mb-8">
        <h1 className="govuk-heading-l">Data Enrichment Status</h1>
        
        {/* Add a toggle for auto-switching tabs */}
        <div className="govuk-form-group mb-4">
          <div className="govuk-checkboxes">
            <div className="govuk-checkboxes__item">
              <input 
                type="checkbox"
                id="auto-switch-tabs" 
                className="govuk-checkboxes__input"
                checked={autoSwitchTabs} 
                onChange={() => setAutoSwitchTabs(!autoSwitchTabs)} 
              />
              <label className="govuk-label govuk-checkboxes__label" htmlFor="auto-switch-tabs">
                Auto-switch to active job tab
              </label>
            </div>
          </div>
        </div>
        
        <div className="govuk-tabs" data-module="govuk-tabs">
          <ul className="govuk-tabs__list">
            <li className={`govuk-tabs__list-item ${activeTab === 'overview' ? 'govuk-tabs__list-item--selected' : ''}`}>
              <a 
                className="govuk-tabs__tab" 
                href="#overview" 
                onClick={(e) => { e.preventDefault(); setActiveTab('overview'); }}
                aria-selected={activeTab === 'overview'}
              >
                Overview
              </a>
            </li>
            <li className={`govuk-tabs__list-item ${activeTab === 'remaining' ? 'govuk-tabs__list-item--selected' : ''}`}>
              <a 
                className="govuk-tabs__tab" 
                href="#remaining" 
                onClick={(e) => { e.preventDefault(); setActiveTab('remaining'); }}
                aria-selected={activeTab === 'remaining'}
              >
                Remaining Items
                {activeJob?.job_type === 'enrich_remaining' && (
                  <span className="govuk-tag govuk-tag--green govuk-!-margin-left-2">
                    Active
                  </span>
                )}
              </a>
            </li>
            <li className={`govuk-tabs__list-item ${activeTab === 'failed' ? 'govuk-tabs__list-item--selected' : ''}`}>
              <a 
                className="govuk-tabs__tab" 
                href="#failed" 
                onClick={(e) => { e.preventDefault(); setActiveTab('failed'); }}
                aria-selected={activeTab === 'failed'}
              >
                Failed Enrichments
                {activeJob?.job_type === 'reprocess_failed' && (
                  <span className="govuk-tag govuk-tag--green govuk-!-margin-left-2">
                    Active
                  </span>
                )}
              </a>
            </li>
          </ul>
          
          <div className="govuk-tabs__panel" id={activeTab}>
            <TabContent activeTab={activeTab} />
          </div>
        </div>
      </div>
    </div>
  );
}; 