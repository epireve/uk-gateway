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
  children: React.ReactNode;
  isLoading: boolean;
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
  const [autoRefreshLogs, setAutoRefreshLogs] = useState<boolean>(false);
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
      {/* Simple Stats Display - Plain GOV.UK Style */}
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <h2 className="govuk-heading-l">{stats.total.toLocaleString()}</h2>
          <p className="govuk-body">Total Companies</p>
        </div>
      </div>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div style={{ backgroundColor: '#00703c', color: 'white', padding: '15px' }}>
            <h2 className="govuk-heading-l">{stats.enriched.toLocaleString()}</h2>
            <p className="govuk-body">Enriched ({Math.round(stats.enriched / stats.total * 100)}%)</p>
          </div>
        </div>
      </div>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div style={{ backgroundColor: '#ffdd00', color: 'black', padding: '15px' }}>
            <h2 className="govuk-heading-l">{stats.remaining.toLocaleString()}</h2>
            <p className="govuk-body">Remaining ({Math.round(stats.remaining / stats.total * 100)}%)</p>
          </div>
        </div>
      </div>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div style={{ backgroundColor: '#d4351c', color: 'white', padding: '15px' }}>
            <h2 className="govuk-heading-l">{stats.failed.toLocaleString()}</h2>
            <p className="govuk-body">Failed</p>
          </div>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div className="govuk-progress-bar">
            <div 
              className="govuk-progress-bar__fill" 
              style={{ width: `${Math.round(stats.enriched / stats.total * 100)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(stats.enriched / stats.total * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            ></div>
          </div>
        </div>
      </div>
      
      {/* Active Job Status */}
      {activeJob && (
        <div className="govuk-grid-row govuk-!-margin-top-6">
          <div className="govuk-grid-column-full">
            <div className="govuk-inset-text" style={{ backgroundColor: '#f3f2f1' }}>
              <h3 className="govuk-heading-m">Active Enrichment Process</h3>
              
              <p className="govuk-body">
                <strong>Type:</strong> {activeJob.job_type === 'reprocess_failed' ? 'Reprocessing Failed Items' : 'Processing Remaining Items'}
              </p>
              <p className="govuk-body">
                <strong>Status:</strong> {activeJob.status === 'pending' ? 'Pending' : 'Processing'}
              </p>
              <p className="govuk-body">
                <strong>Started:</strong> {activeJob.started_at ? new Date(activeJob.started_at).toLocaleString() : 'Not started yet'}
              </p>
              
              {activeJob.total_items !== null && activeJob.total_items > 0 && (
                <p className="govuk-body">
                  <strong>Total Items:</strong> {activeJob.total_items.toLocaleString()}
                </p>
              )}
              
              {activeJob.items_processed > 0 && (
                <p className="govuk-body">
                  <strong>Items Processed:</strong> {activeJob.items_processed.toLocaleString()}
                </p>
              )}
              
              {activeJob.items_failed > 0 && (
                <p className="govuk-body">
                  <strong>Items Failed:</strong> {activeJob.items_failed.toLocaleString()}
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
                  <p className="govuk-body-s govuk-!-margin-top-1 govuk-!-text-align-right">
                    {activeJob.progress_percentage}% Complete
                    {activeJob.items_processed > 0 && ` (${activeJob.items_processed.toLocaleString()} processed)`}
                    {activeJob.total_items && ` of ${activeJob.total_items.toLocaleString()} items`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Log Controls */}
      <div className="govuk-grid-row govuk-!-margin-top-6">
        <div className="govuk-grid-column-full">
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
              
              <div className="govuk-checkboxes govuk-checkboxes--small" style={{ display: 'inline-block', marginLeft: '15px' }}>
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
      </div>
      
      {/* Logs Display */}
      {showLogs && (
        <div className="govuk-grid-row govuk-!-margin-top-2">
          <div className="govuk-grid-column-full">
            <div className="govuk-table-container">
              <div style={{ padding: '10px', backgroundColor: '#f3f2f1', borderBottom: '1px solid #b1b4b6' }}>
                <h3 className="govuk-heading-s govuk-!-margin-bottom-0">Enrichment Process Logs</h3>
                {updatingLogs && (
                  <span className="govuk-hint govuk-!-margin-bottom-0">
                    Updating...
                  </span>
                )}
              </div>
              
              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <div className="govuk-loader"></div>
                  <p className="govuk-body govuk-!-margin-top-2">Loading logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <p className="govuk-body govuk-hint">No logs available. Logs will appear here when an enrichment process is running.</p>
                </div>
              ) : (
                <div style={{ maxHeight: '24rem', overflowY: 'auto' }}>
                  <table className="govuk-table">
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
                          <td className="govuk-table__cell" style={{ whiteSpace: 'pre-wrap' }}>{log.message}</td>
                        </tr>
                      ))}
                      <tr><td colSpan={3} ref={logsEndRef} className="govuk-table__cell"></td></tr>
                    </tbody>
                  </table>
                </div>
              )}
              
              {hasMoreLogs && (
                <div style={{ padding: '10px', textAlign: 'center', borderTop: '1px solid #b1b4b6' }}>
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
        </div>
      )}
    </div>
  );
};

const FailedEnrichmentsTab: React.FC = () => {
  const [failedItems, setFailedItems] = useState<FailedEnrichmentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [jobRunning, setJobRunning] = useState<boolean>(false);
  const [showStartJobModal, setShowStartJobModal] = useState<boolean>(false);
  const [startingJob, setStartingJob] = useState<boolean>(false);
  
  const loadFailedItems = async () => {
    setLoading(true);
    try {
      const response = await getFailedEnrichments();
      setFailedItems(response.items);
    } catch (error) {
      console.error('Error loading failed items:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const checkActiveJob = async () => {
    try {
      const job = await getActiveEnrichmentJob();
      setJobRunning(!!job);
    } catch (error) {
      console.error('Error checking for active job:', error);
    }
  };
  
  const handleStartReprocessJob = async () => {
    setStartingJob(true);
    try {
      await triggerEnrichment('failed');
      setShowStartJobModal(false);
      // Refresh data
      await checkActiveJob();
    } catch (error) {
      console.error('Error starting reprocess job:', error);
    } finally {
      setStartingJob(false);
    }
  };
  
  useEffect(() => {
    loadFailedItems();
    checkActiveJob();
  }, []);
  
  if (loading) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div className="govuk-!-padding-6 govuk-!-text-align-center">
            <div className="govuk-loader"></div>
            <p className="govuk-body govuk-!-margin-top-2">Loading failed enrichment items...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (failedItems.length === 0) {
    return (
      <div className="govuk-panel govuk-panel--confirmation">
        <h2 className="govuk-panel__title">No Failed Enrichments</h2>
        <div className="govuk-panel__body">
          All companies were successfully enriched.
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div className="govuk-!-margin-bottom-6">
            <h2 className="govuk-heading-m">Failed Enrichments</h2>
            <p className="govuk-body">
              The following companies failed during the enrichment process:
            </p>
            
            <button 
              className="govuk-button govuk-button--warning" 
              disabled={jobRunning}
              onClick={() => setShowStartJobModal(true)}
            >
              Reprocess Failed Items
            </button>
            
            {jobRunning && (
              <div className="govuk-inset-text">
                <p className="govuk-body">
                  <strong>An enrichment job is currently running.</strong> Please wait for it to complete before starting a new job.
                </p>
              </div>
            )}
          </div>
          
          <div className="govuk-table-container">
            <table className="govuk-table">
              <caption className="govuk-table__caption govuk-visually-hidden">Failed Enrichment Items</caption>
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th scope="col" className="govuk-table__header">Company Number</th>
                  <th scope="col" className="govuk-table__header">Name</th>
                  <th scope="col" className="govuk-table__header">Error</th>
                  <th scope="col" className="govuk-table__header">Failed At</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {failedItems.map((item) => (
                  <tr key={item.id} className="govuk-table__row">
                    <td className="govuk-table__cell">{item.company_number || 'N/A'}</td>
                    <td className="govuk-table__cell">{item.company_name}</td>
                    <td className="govuk-table__cell">{item.last_error || 'Unknown error'}</td>
                    <td className="govuk-table__cell">{new Date(item.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {showStartJobModal && (
        <div className="govuk-modal" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="govuk-modal__overlay" onClick={() => !startingJob && setShowStartJobModal(false)}></div>
          <div className="govuk-modal__dialog">
            <div className="govuk-modal__header">
              <h2 className="govuk-heading-m" id="modal-title">Start Reprocess Job</h2>
              <button 
                className="govuk-modal__close" 
                aria-label="Close modal" 
                onClick={() => !startingJob && setShowStartJobModal(false)}
              >
                ×
              </button>
            </div>
            <div className="govuk-modal__content">
              <p className="govuk-body">
                Are you sure you want to reprocess all failed enrichment items? This will start a background job.
              </p>
            </div>
            <div className="govuk-modal__footer">
              <button 
                className="govuk-button govuk-button--secondary" 
                onClick={() => !startingJob && setShowStartJobModal(false)}
                disabled={startingJob}
              >
                Cancel
              </button>
              <button 
                className="govuk-button govuk-button--warning" 
                onClick={handleStartReprocessJob}
                disabled={startingJob}
              >
                {startingJob ? 'Starting Job...' : 'Start Reprocess Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const RemainingItemsTab: React.FC = () => {
  const [remainingItems, setRemainingItems] = useState<EnrichedCompany[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [jobRunning, setJobRunning] = useState<boolean>(false);
  const [showStartJobModal, setShowStartJobModal] = useState<boolean>(false);
  const [startingJob, setStartingJob] = useState<boolean>(false);
  
  const loadRemainingItems = async (page: number) => {
    setLoading(true);
    try {
      const { items, total_pages } = await getRemainingCompanies(page);
      setRemainingItems(items);
      setTotalPages(total_pages);
    } catch (error) {
      console.error('Error loading remaining items:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const checkActiveJob = async () => {
    try {
      const job = await getActiveEnrichmentJob();
      setJobRunning(!!job);
    } catch (error) {
      console.error('Error checking for active job:', error);
    }
  };
  
  const handleStartEnrichmentJob = async () => {
    setStartingJob(true);
    try {
      await triggerEnrichment('remaining');
      setShowStartJobModal(false);
      // Refresh data
      await checkActiveJob();
    } catch (error) {
      console.error('Error starting enrichment job:', error);
    } finally {
      setStartingJob(false);
    }
  };
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadRemainingItems(page);
  };
  
  useEffect(() => {
    loadRemainingItems(currentPage);
    checkActiveJob();
  }, []);
  
  if (loading) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div className="govuk-!-padding-6 govuk-!-text-align-center">
            <div className="govuk-loader"></div>
            <p className="govuk-body govuk-!-margin-top-2">Loading remaining items...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (remainingItems.length === 0) {
    return (
      <div className="govuk-panel govuk-panel--confirmation">
        <h2 className="govuk-panel__title">No Remaining Items</h2>
        <div className="govuk-panel__body">
          All companies have been processed or are currently being enriched.
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div className="govuk-!-margin-bottom-6">
            <h2 className="govuk-heading-m">Remaining Items</h2>
            <p className="govuk-body">
              The following companies are waiting to be enriched:
            </p>
            
            <button 
              className="govuk-button" 
              disabled={jobRunning}
              onClick={() => setShowStartJobModal(true)}
            >
              Start Enrichment Job
            </button>
            
            {jobRunning && (
              <div className="govuk-inset-text">
                <p className="govuk-body">
                  <strong>An enrichment job is currently running.</strong> Please wait for it to complete before starting a new job.
                </p>
              </div>
            )}
          </div>
          
          <div className="govuk-table-container">
            <table className="govuk-table">
              <caption className="govuk-table__caption govuk-visually-hidden">Remaining Items</caption>
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th scope="col" className="govuk-table__header">Company Number</th>
                  <th scope="col" className="govuk-table__header">Name</th>
                  <th scope="col" className="govuk-table__header">Status</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {remainingItems.map((item) => (
                  <tr key={item.id} className="govuk-table__row">
                    <td className="govuk-table__cell">{item.company_number || 'N/A'}</td>
                    <td className="govuk-table__cell">{item.original_name || item.company_name || 'Unknown'}</td>
                    <td className="govuk-table__cell">Pending</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="govuk-pagination" role="navigation" aria-label="Pagination">
              <div className="govuk-pagination__prev">
                {currentPage > 1 && (
                  <a 
                    className="govuk-link govuk-pagination__link" 
                    href="#prev" 
                    rel="prev" 
                    onClick={(e) => { e.preventDefault(); handlePageChange(currentPage - 1); }}
                  >
                    <span className="govuk-pagination__link-title">Previous</span>
                  </a>
                )}
              </div>
              
              <ul className="govuk-pagination__list">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Show first page, last page, current page, and pages around current
                  let pageToShow = i + 1;
                  if (totalPages > 5) {
                    if (currentPage <= 3) {
                      // Near start, show first 5 pages
                      pageToShow = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      // Near end, show last 5 pages
                      pageToShow = totalPages - 4 + i;
                    } else {
                      // In middle, show current page and 2 on each side
                      pageToShow = currentPage - 2 + i;
                    }
                  }
                  
                  return (
                    <li key={pageToShow} className={`govuk-pagination__item ${pageToShow === currentPage ? 'govuk-pagination__item--current' : ''}`}>
                      <a 
                        className="govuk-link govuk-pagination__link" 
                        href={`#page-${pageToShow}`} 
                        aria-current={pageToShow === currentPage ? 'page' : undefined}
                        onClick={(e) => { e.preventDefault(); handlePageChange(pageToShow); }}
                      >
                        {pageToShow}
                      </a>
                    </li>
                  );
                })}
              </ul>
              
              <div className="govuk-pagination__next">
                {currentPage < totalPages && (
                  <a 
                    className="govuk-link govuk-pagination__link" 
                    href="#next" 
                    rel="next" 
                    onClick={(e) => { e.preventDefault(); handlePageChange(currentPage + 1); }}
                  >
                    <span className="govuk-pagination__link-title">Next</span>
                  </a>
                )}
              </div>
            </nav>
          )}
        </div>
      </div>
      
      {showStartJobModal && (
        <div className="govuk-modal" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="govuk-modal__overlay" onClick={() => !startingJob && setShowStartJobModal(false)}></div>
          <div className="govuk-modal__dialog">
            <div className="govuk-modal__header">
              <h2 className="govuk-heading-m" id="modal-title">Start Enrichment Job</h2>
              <button 
                className="govuk-modal__close" 
                aria-label="Close modal" 
                onClick={() => !startingJob && setShowStartJobModal(false)}
              >
                ×
              </button>
            </div>
            <div className="govuk-modal__content">
              <p className="govuk-body">
                Are you sure you want to start an enrichment job for remaining companies? This will start a background job.
              </p>
            </div>
            <div className="govuk-modal__footer">
              <button 
                className="govuk-button govuk-button--secondary" 
                onClick={() => !startingJob && setShowStartJobModal(false)}
                disabled={startingJob}
              >
                Cancel
              </button>
              <button 
                className="govuk-button" 
                onClick={handleStartEnrichmentJob}
                disabled={startingJob}
              >
                {startingJob ? 'Starting Job...' : 'Start Enrichment Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TabContent: React.FC<TabContentProps> = ({ children, isLoading }) => {
  if (isLoading) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <div className="govuk-!-padding-6 govuk-!-text-align-center">
            <div className="govuk-loader"></div>
            <p className="govuk-body govuk-!-margin-top-2">Loading...</p>
          </div>
        </div>
      </div>
    );
  }
  return <div>{children}</div>;
};

const EnrichmentStatus: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [autoSwitchToActiveJobTab, setAutoSwitchToActiveJobTab] = useState<boolean>(
    localStorage.getItem('autoSwitchToActiveJobTab') === 'true'
  );
  const [activeJobPolling, setActiveJobPolling] = useState<NodeJS.Timeout | null>(null);

  // Effect to handle switching to active job tab
  useEffect(() => {
    if (autoSwitchToActiveJobTab) {
      // Poll for active job
      const checkForActiveJob = async () => {
        try {
          const job = await getActiveEnrichmentJob();
          if (job) {
            setActiveTab('overview'); // Switch to overview tab if there's an active job
          }
        } catch (error) {
          console.error('Error checking for active job:', error);
        }
      };

      // Check immediately
      checkForActiveJob();

      // Set up polling
      const interval = setInterval(checkForActiveJob, 10000); // Every 10 seconds
      setActiveJobPolling(interval);

      // Clean up on unmount
      return () => {
        if (activeJobPolling) {
          clearInterval(activeJobPolling);
        }
      };
    } else if (activeJobPolling) {
      // If auto-switch is disabled but we have an active interval, clear it
      clearInterval(activeJobPolling);
      setActiveJobPolling(null);
    }
  }, [autoSwitchToActiveJobTab, activeJobPolling]);

  // Effect to persist auto-switch setting
  useEffect(() => {
    localStorage.setItem('autoSwitchToActiveJobTab', autoSwitchToActiveJobTab.toString());
  }, [autoSwitchToActiveJobTab]);

  // Effect to fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const statsData = await getEnrichmentStats();
        setStats(statsData);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  return (
    <div className="govuk-width-container">
      <div className="govuk-main-wrapper">
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <h1 className="govuk-heading-xl govuk-!-margin-bottom-6">Data Enrichment Status</h1>
          
            {/* Settings */}
            <div className="govuk-form-group">
              <div className="govuk-checkboxes">
                <div className="govuk-checkboxes__item">
                  <input
                    id="auto-switch-tab"
                    name="auto-switch-tab"
                    type="checkbox"
                    className="govuk-checkboxes__input"
                    checked={autoSwitchToActiveJobTab}
                    onChange={() => setAutoSwitchToActiveJobTab(!autoSwitchToActiveJobTab)}
                  />
                  <label className="govuk-label govuk-checkboxes__label" htmlFor="auto-switch-tab">
                    Auto-switch to active job tab
                  </label>
                </div>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="govuk-tabs" data-module="govuk-tabs">
              <ul className="govuk-tabs__list">
                <li className={`govuk-tabs__list-item ${activeTab === 'overview' ? 'govuk-tabs__list-item--selected' : ''}`}>
                  <a className="govuk-tabs__tab" href="#overview" onClick={(e) => { e.preventDefault(); setActiveTab('overview'); }}>
                    Overview
                  </a>
                </li>
                <li className={`govuk-tabs__list-item ${activeTab === 'remaining' ? 'govuk-tabs__list-item--selected' : ''}`}>
                  <a className="govuk-tabs__tab" href="#remaining-items" onClick={(e) => { e.preventDefault(); setActiveTab('remaining'); }}>
                    Remaining Items
                  </a>
                </li>
                <li className={`govuk-tabs__list-item ${activeTab === 'failed' ? 'govuk-tabs__list-item--selected' : ''}`}>
                  <a className="govuk-tabs__tab" href="#failed-items" onClick={(e) => { e.preventDefault(); setActiveTab('failed'); }}>
                    Failed Enrichments
                  </a>
                </li>
              </ul>
              
              <div className="govuk-tabs__panel">
                {activeTab === 'overview' && (
                  <TabContent isLoading={loading}>
                    {stats && <EnrichmentOverview stats={stats} />}
                  </TabContent>
                )}
                {activeTab === 'remaining' && (
                  <TabContent isLoading={loading}>
                    <RemainingItemsTab />
                  </TabContent>
                )}
                {activeTab === 'failed' && (
                  <TabContent isLoading={loading}>
                    <FailedEnrichmentsTab />
                  </TabContent>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnrichmentStatus; 