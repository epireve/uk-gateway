"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { searchCompanies, getCompanies } from '@/lib/supabase-api';
import { EnrichedCompany } from '@/lib/models';
import { CompanyCard } from './CompanyCard';

const PAGE_SIZE = 10;

export const CompanySearch: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [companies, setCompanies] = useState<EnrichedCompany[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  
  // Function to load companies (either search or all)
  const loadCompanies = useCallback(async (page: number, term?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      let result;
      if (term && term.trim() !== '') {
        result = await searchCompanies(term, page, PAGE_SIZE);
      } else {
        result = await getCompanies(page, PAGE_SIZE);
      }
      
      setCompanies(result.companies);
      setCurrentPage(result.currentPage);
      setTotalPages(result.totalPages);
      setTotalResults(result.count);
    } catch (err) {
      setError('Error loading companies. Please try again.');
      console.error('Error loading companies:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Load initial data
  useEffect(() => {
    loadCompanies(1);
  }, [loadCompanies]);
  
  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadCompanies(1, searchTerm);
  };
  
  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadCompanies(page, searchTerm);
  };
  
  return (
    <div className="max-w-7xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">UK Company Search</h1>
      
      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by company name or number..."
            className="w-full sm:w-2/3 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>
      
      {/* Results count */}
      {!isLoading && !error && (
        <div className="mb-4">
          <p className="text-gray-600">
            {searchTerm.trim() !== ''
              ? `Found ${totalResults} results for "${searchTerm}"`
              : `Showing ${totalResults} companies`}
          </p>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center items-center p-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {/* Results */}
      {!isLoading && !error && companies.length === 0 && (
        <div className="text-center p-12">
          <p className="text-lg text-gray-600">No companies found.</p>
        </div>
      )}
      
      {!isLoading && !error && companies.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-8">
          <nav className="flex items-center">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="mr-2 px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
            >
              Previous
            </button>
            
            <div className="flex space-x-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  // Show first, last, current, and 1 page on either side of current
                  return (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  );
                })
                .map((page, index, arr) => {
                  // Add ellipsis between non-consecutive pages
                  const showEllipsis = index > 0 && arr[index - 1] !== page - 1;
                  
                  return (
                    <React.Fragment key={page}>
                      {showEllipsis && (
                        <span className="px-3 py-1">...</span>
                      )}
                      <button
                        onClick={() => handlePageChange(page)}
                        className={`px-3 py-1 rounded ${
                          currentPage === page
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300'
                        }`}
                      >
                        {page}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>
            
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="ml-2 px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}; 