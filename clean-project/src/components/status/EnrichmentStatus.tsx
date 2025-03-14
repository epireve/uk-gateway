"use client";

import React, { useState, useEffect } from 'react';
import { getEnrichmentStats, getFailedEnrichments, getRemainingCompanies, triggerEnrichment, FailedEnrichmentItem } from '@/lib/supabase-api';
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

const EnrichmentOverview: React.FC<{ stats: StatsData }> = ({ stats }) => {
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

  const handleProcessFailed = async () => {
    setProcessing(true);
    setMessage({ text: '', type: '' });
    try {
      const result = await triggerEnrichment('failed');
      setMessage({ 
        text: result.message, 
        type: result.success ? 'success' : 'error' 
      });
    } catch (error) {
      console.error('Error processing failed items:', error);
      setMessage({ text: 'Failed to start processing', type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    loadFailedItems();
  }, [page]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="govuk-heading-m">Failed Enrichments</h2>
        <button 
          onClick={handleProcessFailed}
          disabled={processing || failedItems.length === 0}
          className="govuk-button"
        >
          {processing ? 'Processing...' : 'Process Failed Items'}
        </button>
      </div>

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

  useEffect(() => {
    loadRemainingItems();
  }, [page]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="govuk-heading-m">Remaining Items</h2>
        <button 
          onClick={handleProcessRemaining}
          disabled={processing || remainingItems.length === 0}
          className="govuk-button"
        >
          {processing ? 'Processing...' : 'Process Remaining Items'}
        </button>
      </div>

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

  if (loading) {
    return (
      <div className="flex justify-center my-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-govuk-blue"></div>
      </div>
    );
  }

  return (
    <div>
      {activeTab === 'overview' && <EnrichmentOverview stats={stats} />}
      {activeTab === 'failed' && <FailedEnrichmentsTab />}
      {activeTab === 'remaining' && <RemainingItemsTab />}
    </div>
  );
};

export const EnrichmentStatus: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

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
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'failed'
                ? 'border-govuk-blue text-govuk-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Failed Enrichments
          </button>
          <button
            onClick={() => setActiveTab('remaining')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'remaining'
                ? 'border-govuk-blue text-govuk-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Remaining Items
          </button>
        </nav>
      </div>

      <TabContent activeTab={activeTab} />
    </div>
  );
}; 