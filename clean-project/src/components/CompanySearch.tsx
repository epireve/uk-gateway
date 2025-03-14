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
    <div>
      {/* Search form */}
      <div className="govuk-card mb-8">
        <h2 className="govuk-heading-m mb-4">Search the register</h2>
        <form onSubmit={handleSearch}>
          <div className="mb-4">
            <label htmlFor="company-search" className="govuk-body block mb-2 font-bold">
              Company name or number
            </label>
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                id="company-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Enter a company name or number"
                className="govuk-input w-full sm:w-2/3"
                aria-label="Enter a company name or number"
              />
              <button
                type="submit"
                className="govuk-button w-full sm:w-auto"
                disabled={isLoading}
              >
                {isLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
        </form>
      </div>
      
      {/* Results count */}
      {!isLoading && !error && (
        <div className="mb-6">
          <p className="govuk-body">
            {searchTerm.trim() !== ''
              ? `Found ${totalResults} results for "${searchTerm}"`
              : `Showing ${totalResults} companies`}
          </p>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 border-l-4 border-govuk-error-colour bg-red-50">
          <p className="govuk-body text-govuk-error-colour">{error}</p>
        </div>
      )}
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center items-center p-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-govuk-blue"></div>
        </div>
      )}
      
      {/* Results */}
      {!isLoading && !error && companies.length === 0 && (
        <div className="govuk-card text-center p-12">
          <p className="govuk-body">No companies found.</p>
          <p className="govuk-body mt-2">Try a different search term or check the spelling.</p>
        </div>
      )}
      
      {!isLoading && !error && companies.length > 0 && (
        <div className="space-y-6">
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
      
      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="govuk-pagination" role="navigation" aria-label="Pagination">
          <div className="flex items-center justify-center">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`govuk-pagination__link mx-1 ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Previous page"
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
                        <span className="mx-1 govuk-pagination__link">...</span>
                      )}
                      <button
                        onClick={() => handlePageChange(page)}
                        className={`govuk-pagination__link mx-1 ${
                          currentPage === page
                            ? 'govuk-pagination__link--current'
                            : ''
                        }`}
                        aria-label={`Page ${page}`}
                        aria-current={currentPage === page ? 'page' : undefined}
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
              className={`govuk-pagination__link mx-1 ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}; 