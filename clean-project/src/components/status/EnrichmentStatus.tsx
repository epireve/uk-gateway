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
    <div>
      {/* Stats Cards */}
      <div className="govuk-grid-row govuk-!-margin-bottom-6">
        <div className="govuk-grid-column-one-quarter">
          <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center">
            <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">{stats.total.toLocaleString()}</h3>
            <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Total Companies</p>
          </div>
        </div>
        <div className="govuk-grid-column-one-quarter">
          <div className="govuk-panel govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center" style={{ backgroundColor: '#00703c', color: 'white' }}>
            <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">{stats.enriched.toLocaleString()}</h3>
            <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Enriched ({Math.round(stats.enriched / stats.total * 100)}%)</p>
          </div>
        </div>
        <div className="govuk-grid-column-one-quarter">
          <div className="govuk-panel govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center" style={{ backgroundColor: '#ffdd00', color: 'black' }}>
            <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">{stats.remaining.toLocaleString()}</h3>
            <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Remaining ({Math.round(stats.remaining / stats.total * 100)}%)</p>
          </div>
        </div>
        <div className="govuk-grid-column-one-quarter">
          <div className="govuk-panel govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center" style={{ backgroundColor: '#d4351c', color: 'white' }}>
            <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">{stats.failed.toLocaleString()}</h3>
            <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Failed</p>
          </div>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="govuk-!-margin-bottom-6">
        <h3 className="govuk-heading-s govuk-!-margin-bottom-2">Overall Progress</h3>
        <div className="govuk-progress-bar" style={{ height: '20px' }}>
          <div 
            className="govuk-progress-bar__fill" 
            style={{ width: `${Math.round(stats.enriched / stats.total * 100)}%`, backgroundColor: '#00703c' }}
            role="progressbar"
            aria-valuenow={Math.round(stats.enriched / stats.total * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          ></div>
        </div>
        <p className="govuk-body-s govuk-!-margin-top-1 govuk-!-text-align-right">
          {Math.round(stats.enriched / stats.total * 100)}% Complete ({stats.enriched.toLocaleString()} of {stats.total.toLocaleString()} companies)
        </p>
      </div>
      
      {/* Active Job Status */}
      {activeJob && (
        <div className="govuk-inset-text govuk-!-margin-bottom-6">
          <h3 className="govuk-heading-s govuk-!-margin-bottom-4">Active Enrichment Process</h3>
          
          <div className="govuk-grid-row">
            <div className="govuk-grid-column-one-half">
              <dl className="govuk-summary-list govuk-summary-list--no-border">
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Type</dt>
                  <dd className="govuk-summary-list__value">
                    {activeJob.job_type === 'reprocess_failed' ? 'Reprocessing Failed Items' : 'Processing Remaining Items'}
                  </dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Status</dt>
                  <dd className="govuk-summary-list__value">
                    {activeJob.status === 'pending' ? 
                      <span className="govuk-tag govuk-tag--yellow">Pending</span> : 
                      <span className="govuk-tag govuk-tag--blue">Processing</span>
                    }
                  </dd>
                </div>
                <div className="govuk-summary-list__row">
                  <dt className="govuk-summary-list__key">Started</dt>
                  <dd className="govuk-summary-list__value">
                    {activeJob.started_at ? new Date(activeJob.started_at).toLocaleString() : 'Not started yet'}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="govuk-grid-column-one-half">
              <dl className="govuk-summary-list govuk-summary-list--no-border">
                {activeJob.total_items !== null && activeJob.total_items > 0 && (
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Total Items</dt>
                    <dd className="govuk-summary-list__value">{activeJob.total_items.toLocaleString()}</dd>
                  </div>
                )}
                {activeJob.items_processed > 0 && (
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Items Processed</dt>
                    <dd className="govuk-summary-list__value">{activeJob.items_processed.toLocaleString()}</dd>
                  </div>
                )}
                {activeJob.items_failed > 0 && (
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Items Failed</dt>
                    <dd className="govuk-summary-list__value">{activeJob.items_failed.toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
          
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
              <p className="govuk-body-s govuk-!-margin-top-1 govuk-!-text-align-right">
                {activeJob.progress_percentage}% Complete
                {activeJob.items_processed > 0 && ` (${activeJob.items_processed.toLocaleString()} processed)`}
                {activeJob.total_items && ` of ${activeJob.total_items.toLocaleString()} items`}
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Log Controls */}
      <div className="govuk-button-group govuk-!-margin-bottom-6">
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
              className="govuk-button govuk-button--secondary"
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
          className="govuk-button govuk-button--secondary"
          disabled={loading}
        >
          Refresh Stats
        </button>
      </div>
      
      {/* Logs Display */}
      {showLogs && (
        <div className="govuk-!-margin-bottom-6">
          <div className="govuk-panel govuk-panel--light-grey govuk-!-padding-0 govuk-!-margin-bottom-0">
            <div className="govuk-!-padding-4 govuk-!-border-bottom-1">
              <div className="govuk-grid-row">
                <div className="govuk-grid-column-three-quarters">
                  <h3 className="govuk-heading-s govuk-!-margin-bottom-0">Enrichment Process Logs</h3>
                </div>
                <div className="govuk-grid-column-one-quarter govuk-!-text-align-right">
                  {updatingLogs && (
                    <span className="govuk-hint">
                      <span className="inline-block ml-2 h-4 w-4 govuk-!-margin-right-1">
                        <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                      </span>
                      Updating...
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {loading ? (
              <div className="govuk-!-padding-6 govuk-!-text-align-center">
                <div className="govuk-loader"></div>
                <p className="govuk-body govuk-!-margin-top-2">Loading logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="govuk-!-padding-6 govuk-!-text-align-center govuk-hint">
                No logs available. Logs will appear here when an enrichment process is running.
              </div>
            ) : (
              <div className="govuk-!-overflow-y-auto" style={{ maxHeight: '30rem' }}>
                <table className="govuk-table govuk-!-margin-bottom-0">
                  <thead className="govuk-table__head">
                    <tr className="govuk-table__row">
                      <th scope="col" className="govuk-table__header" style={{ width: '15%' }}>Time</th>
                      <th scope="col" className="govuk-table__header" style={{ width: '10%' }}>Level</th>
                      <th scope="col" className="govuk-table__header" style={{ width: '75%' }}>Message</th>
                    </tr>
                  </thead>
                  <tbody className="govuk-table__body">
                    {logs.map((log) => (
                      <tr key={log.id} className="govuk-table__row">
                        <td className="govuk-table__cell">{formatTimestamp(log.timestamp)}</td>
                        <td className="govuk-table__cell">
                          <span className={`govuk-tag ${
                            log.log_level.toLowerCase() === 'error' ? 'govuk-tag--red' : 
                            log.log_level.toLowerCase() === 'warning' ? 'govuk-tag--yellow' : 
                            'govuk-tag--blue'}`}>
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
              <div className="govuk-!-padding-4 govuk-!-text-align-center govuk-!-border-top-1">
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
      <div className="govuk-grid-row govuk-!-margin-bottom-4">
        <div className="govuk-grid-column-two-thirds">
          <h2 className="govuk-heading-m govuk-!-margin-bottom-0">Failed Enrichments</h2>
          <p className="govuk-body govuk-!-margin-top-1">
            Companies that failed during the enrichment process. You can retry these items.
          </p>
        </div>
        <div className="govuk-grid-column-one-third govuk-!-text-align-right">
          <div className="govuk-button-group">
            <button 
              onClick={() => setRefreshCount(prev => prev + 1)} 
              className="govuk-button govuk-button--secondary"
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button 
              onClick={handleProcessFailed}
              disabled={processing || failedItems.length === 0}
              className="govuk-button"
            >
              {processing ? 'Processing...' : 'Process Failed'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats summary cards */}
      {stats && (
        <div className="govuk-grid-row govuk-!-margin-bottom-6">
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center" style={{ backgroundColor: '#d4351c', color: 'white' }}>
              <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">{stats.failed.toLocaleString()}</h3>
              <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Failed Enrichments</p>
            </div>
          </div>
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center">
              <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">{stats.total.toLocaleString()}</h3>
              <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Total Companies</p>
            </div>
          </div>
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center" style={{ backgroundColor: '#505a5f', color: 'white' }}>
              <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">
                {stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0}%
              </h3>
              <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Failed Percentage</p>
            </div>
          </div>
        </div>
      )}

      {activeJob && activeJob.job_type === 'reprocess_failed' && (
        <div className="govuk-inset-text govuk-!-margin-bottom-6 govuk-!-border-color-blue">
          <h3 className="govuk-heading-s govuk-!-margin-bottom-2">Active Reprocessing Job</h3>
          <p className="govuk-body-s govuk-!-margin-bottom-3">
            Reprocessing failed enrichments is currently in progress. The table below will update automatically when the process completes.
          </p>
          
          {activeJob.progress_percentage !== null && (
            <div className="govuk-!-margin-top-3">
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
              <p className="govuk-body-s govuk-!-margin-top-2 govuk-!-text-align-right">
                {activeJob.progress_percentage}% Complete
                {activeJob.items_processed > 0 && ` (${activeJob.items_processed.toLocaleString()} processed)`}
                {activeJob.total_items && ` of ${activeJob.total_items.toLocaleString()} items`}
              </p>
            </div>
          )}
        </div>
      )}

      {message.text && (
        <div className={`govuk-inset-text govuk-!-margin-bottom-6 ${message.type === 'error' ? 'govuk-!-border-color-red' : 'govuk-!-border-color-green'}`}>
          <p className="govuk-body govuk-!-margin-0">
            {message.type === 'error' && <span className="govuk-!-font-weight-bold govuk-!-color-red">Error: </span>}
            {message.type === 'success' && <span className="govuk-!-font-weight-bold govuk-!-color-green">Success: </span>}
            {message.text}
          </p>
        </div>
      )}

      {loading ? (
        <div className="govuk-!-padding-6 govuk-!-text-align-center">
          <div className="govuk-loader"></div>
          <p className="govuk-body govuk-!-margin-top-2">Loading failed enrichments...</p>
        </div>
      ) : failedItems.length === 0 ? (
        <div className="govuk-panel govuk-panel--light-grey govuk-!-padding-6 govuk-!-text-align-center govuk-!-margin-bottom-6">
          <h3 className="govuk-heading-m govuk-!-margin-bottom-1">No failed enrichments found</h3>
          <p className="govuk-body">All companies have been successfully enriched or not yet processed.</p>
        </div>
      ) : (
        <>
          <div className="govuk-!-margin-bottom-6">
            <div className="govuk-panel govuk-panel--light-grey govuk-!-padding-0 govuk-!-margin-bottom-0">
              <table className="govuk-table govuk-!-margin-bottom-0">
                <thead className="govuk-table__head">
                  <tr className="govuk-table__row">
                    <th scope="col" className="govuk-table__header" style={{ width: '40%' }}>Company Name</th>
                    <th scope="col" className="govuk-table__header" style={{ width: '10%' }}>Retry Count</th>
                    <th scope="col" className="govuk-table__header" style={{ width: '30%' }}>Last Error</th>
                    <th scope="col" className="govuk-table__header" style={{ width: '20%' }}>Last Attempt</th>
                  </tr>
                </thead>
                <tbody className="govuk-table__body">
                  {failedItems.map((item) => (
                    <tr key={item.id} className="govuk-table__row">
                      <td className="govuk-table__cell govuk-!-font-weight-bold">{item.company_name}</td>
                      <td className="govuk-table__cell">
                        <span className="govuk-tag govuk-tag--grey">{item.retry_count}</span>
                      </td>
                      <td className="govuk-table__cell govuk-table__cell--truncate govuk-!-color-red">{item.last_error?.substring(0, 50)}...</td>
                      <td className="govuk-table__cell">{new Date(item.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
      <div className="govuk-grid-row govuk-!-margin-bottom-4">
        <div className="govuk-grid-column-two-thirds">
          <h2 className="govuk-heading-m govuk-!-margin-bottom-0">Remaining Items</h2>
          <p className="govuk-body govuk-!-margin-top-1">
            Companies that still need to be processed through the enrichment pipeline.
          </p>
        </div>
        <div className="govuk-grid-column-one-third govuk-!-text-align-right">
          <div className="govuk-button-group">
            <button 
              onClick={() => setRefreshCount(prev => prev + 1)} 
              className="govuk-button govuk-button--secondary"
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button 
              onClick={handleProcessRemaining}
              disabled={processing || remainingItems.length === 0}
              className="govuk-button"
            >
              {processing ? 'Processing...' : 'Process Items'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats summary cards */}
      {stats && (
        <div className="govuk-grid-row govuk-!-margin-bottom-6">
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center" style={{ backgroundColor: '#ffdd00', color: 'black' }}>
              <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">{stats.remaining.toLocaleString()}</h3>
              <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Remaining Items</p>
            </div>
          </div>
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-panel--confirmation govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center">
              <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">{stats.total.toLocaleString()}</h3>
              <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Total Companies</p>
            </div>
          </div>
          <div className="govuk-grid-column-one-third">
            <div className="govuk-panel govuk-!-padding-4 govuk-!-margin-bottom-0 govuk-!-text-align-center" style={{ backgroundColor: '#505a5f', color: 'white' }}>
              <h3 className="govuk-heading-l govuk-!-margin-bottom-1 govuk-!-font-size-36">
                {stats.total > 0 ? Math.round((stats.remaining / stats.total) * 100) : 0}%
              </h3>
              <p className="govuk-body govuk-!-margin-0 govuk-!-font-weight-bold">Remaining Percentage</p>
            </div>
          </div>
        </div>
      )}

      {activeJob && activeJob.job_type === 'enrich_remaining' && (
        <div className="govuk-inset-text govuk-!-margin-bottom-6 govuk-!-border-color-blue">
          <h3 className="govuk-heading-s govuk-!-margin-bottom-2">Active Enrichment Process</h3>
          <p className="govuk-body-s govuk-!-margin-bottom-3">
            The enrichment process is currently running for remaining items. The table below will update automatically when the process completes.
          </p>
          
          {activeJob.progress_percentage !== null && (
            <div className="govuk-!-margin-top-3">
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
              <p className="govuk-body-s govuk-!-margin-top-2 govuk-!-text-align-right">
                {activeJob.progress_percentage}% Complete
                {activeJob.items_processed > 0 && ` (${activeJob.items_processed.toLocaleString()} processed)`}
                {activeJob.total_items && ` of ${activeJob.total_items.toLocaleString()} items`}
              </p>
            </div>
          )}
        </div>
      )}

      {message.text && (
        <div className={`govuk-inset-text govuk-!-margin-bottom-6 ${message.type === 'error' ? 'govuk-!-border-color-red' : 'govuk-!-border-color-green'}`}>
          <p className="govuk-body govuk-!-margin-0">
            {message.type === 'error' && <span className="govuk-!-font-weight-bold govuk-!-color-red">Error: </span>}
            {message.type === 'success' && <span className="govuk-!-font-weight-bold govuk-!-color-green">Success: </span>}
            {message.text}
          </p>
        </div>
      )}

      {loading ? (
        <div className="govuk-!-padding-6 govuk-!-text-align-center">
          <div className="govuk-loader"></div>
          <p className="govuk-body govuk-!-margin-top-2">Loading remaining items...</p>
        </div>
      ) : remainingItems.length === 0 ? (
        <div className="govuk-panel govuk-panel--light-grey govuk-!-padding-6 govuk-!-text-align-center govuk-!-margin-bottom-6">
          <h3 className="govuk-heading-m govuk-!-margin-bottom-1">No remaining items found</h3>
          <p className="govuk-body">All companies have been processed or are currently being enriched.</p>
        </div>
      ) : (
        <>
          <div className="govuk-!-margin-bottom-6">
            <div className="govuk-panel govuk-panel--light-grey govuk-!-padding-0 govuk-!-margin-bottom-0">
              <table className="govuk-table govuk-!-margin-bottom-0">
                <thead className="govuk-table__head">
                  <tr className="govuk-table__row">
                    <th scope="col" className="govuk-table__header" style={{ width: '40%' }}>Company Name</th>
                    <th scope="col" className="govuk-table__header" style={{ width: '20%' }}>Town/City</th>
                    <th scope="col" className="govuk-table__header" style={{ width: '20%' }}>County</th>
                    <th scope="col" className="govuk-table__header" style={{ width: '20%' }}>Type & Rating</th>
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
    <div className="govuk-width-container">
      <div className="govuk-main-wrapper">
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <h1 className="govuk-heading-xl govuk-!-margin-bottom-4">Data Enrichment Status</h1>
            
            <p className="govuk-body-l govuk-!-margin-bottom-6">
              This page allows you to view and manage the data enrichment process. You can view the current status, 
              check failed enrichments, and trigger enrichment processes for both failed items and remaining companies.
            </p>
          
            {/* Control panel with settings */}
            <div className="govuk-panel govuk-panel--light-grey govuk-!-padding-4 govuk-!-margin-bottom-6">
              <div className="govuk-grid-row">
                <div className="govuk-grid-column-full">
                  <h2 className="govuk-heading-m govuk-!-margin-bottom-3">Settings</h2>
                  <div className="govuk-form-group govuk-!-margin-bottom-0">
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
                </div>
              </div>
            </div>
            
            <div className="govuk-tabs" data-module="govuk-tabs">
              <ul className="govuk-tabs__list govuk-!-margin-bottom-0 govuk-!-border-bottom-width-2">
                <li className={`govuk-tabs__list-item ${activeTab === 'overview' ? 'govuk-tabs__list-item--selected' : ''}`}>
                  <a 
                    className="govuk-tabs__tab govuk-!-font-weight-bold" 
                    href="#overview" 
                    onClick={(e) => { e.preventDefault(); setActiveTab('overview'); }}
                    aria-selected={activeTab === 'overview'}
                  >
                    Overview
                  </a>
                </li>
                <li className={`govuk-tabs__list-item ${activeTab === 'remaining' ? 'govuk-tabs__list-item--selected' : ''}`}>
                  <a 
                    className="govuk-tabs__tab govuk-!-font-weight-bold" 
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
                    className="govuk-tabs__tab govuk-!-font-weight-bold" 
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
              
              <div className="govuk-tabs__panel govuk-!-padding-top-6" id={activeTab}>
                <TabContent activeTab={activeTab} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 