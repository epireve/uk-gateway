"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchCompanies, getCompanies, getTownCityOptions, getRouteOptions, getTypeRatingOptions } from '@/lib/supabase-api';
import { EnrichedCompany } from '@/lib/models';
import { CompanyCard } from './CompanyCard';

const PAGE_SIZE = 10;

// Add these predefined lists of options
const PREDEFINED_ROUTES = [
  'Charity Worker',
  'Creative Worker',
  'Global Business Mobility: Graduate Trainee',
  'Global Business Mobility: Secondment Worker',
  'Global Business Mobility: Senior or Specialist Worker',
  'Global Business Mobility: Service Supplier',
  'Global Business Mobility: UK Expansion Worker',
  'Government Authorised Exchange',
  'International Agreement',
  'International Sportsperson',
  'Intra Company Transfers (ICT)',
  'Intra-company Routes',
  'Religious Worker',
  'Scale-up',
  'Seasonal Worker',
  'Skilled Worker',
  'Tier 2 Ministers of Religion'
];

const PREDEFINED_TYPE_RATINGS = [
  'Temporary Worker (A (Premium))',
  'Temporary Worker (A (SME+))',
  'Temporary Worker (A rating)',
  'Worker (A (Premium))',
  'Worker (A (SME+))',
  'Worker (A rating)',
  'Worker (B rating)',
  'Worker (UK Expansion Worker: Provisional)'
];

export const CompanySearch: React.FC = () => {
  const searchParams = useSearchParams();
  
  // Initialize state from URL parameters
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [companies, setCompanies] = useState<EnrichedCompany[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  
  // Filter states initialized from URL parameters
  const [enrichedOnly, setEnrichedOnly] = useState(searchParams.get('enriched') === 'true');
  const [selectedTownCity, setSelectedTownCity] = useState<string>(searchParams.get('location') || 'all');
  const [selectedRoute, setSelectedRoute] = useState<string>(searchParams.get('route') || 'all');
  const [selectedTypeRating, setSelectedTypeRating] = useState<string>(searchParams.get('type') || 'all');
  const [townCityOptions, setTownCityOptions] = useState<string[]>([]);
  const [routeOptions, setRouteOptions] = useState<string[]>([]);
  const [typeRatingOptions, setTypeRatingOptions] = useState<string[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  
  // Function to update URL parameters
  const updateUrlParams = useCallback((params: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    
    // Update existing parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === '' || value === 'all' || value === 'false') {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });
    
    // Replace the URL without triggering a navigation
    window.history.replaceState({}, '', url.toString());
  }, []);
  
  // Load filter options when component mounts
  useEffect(() => {
    const loadFilterOptions = async () => {
      setIsLoadingOptions(true);
      try {
        // We'll still load these for future use, but not actively filter with location for now
        const townCities = await getTownCityOptions();
        setTownCityOptions(townCities);
        
        // Load options from the database
        const dbRoutes = await getRouteOptions();
        const dbTypeRatings = await getTypeRatingOptions();
        
        // Combine predefined lists with database values and remove duplicates
        const combinedRoutes = [...new Set([...PREDEFINED_ROUTES, ...dbRoutes])].sort();
        const combinedTypeRatings = [...new Set([...PREDEFINED_TYPE_RATINGS, ...dbTypeRatings])].sort();
        
        setRouteOptions(combinedRoutes);
        setTypeRatingOptions(combinedTypeRatings);
      } catch (err) {
        console.error('Error loading filter options:', err);
        // If there's an error fetching from the database, use the predefined lists
        setRouteOptions(PREDEFINED_ROUTES);
        setTypeRatingOptions(PREDEFINED_TYPE_RATINGS);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    
    loadFilterOptions();
  }, []);
  
  // Function to load companies (either search or all)
  const loadCompanies = useCallback(async (page: number, term?: string) => {
    setIsLoading(true);
    setError(null);
    
    // Prepare filters
    const filters = {
      enrichedOnly,
      // We'll keep the filter structure, but not actively use townCity for now
      // townCity: selectedTownCity,
      route: selectedRoute !== 'all' ? selectedRoute : undefined,
      typeRating: selectedTypeRating !== 'all' ? selectedTypeRating : undefined
    };
    
    try {
      let result;
      if (term && term.trim() !== '') {
        result = await searchCompanies(term, page, PAGE_SIZE, filters);
      } else {
        result = await getCompanies(page, PAGE_SIZE, filters);
      }
      
      setCompanies(result.companies);
      setCurrentPage(result.currentPage);
      setTotalPages(result.totalPages);
      setTotalResults(result.count);
      
      // Update URL parameters
      updateUrlParams({
        q: term?.trim() || null,
        page: page > 1 ? page.toString() : null,
        enriched: enrichedOnly ? 'true' : null,
        route: selectedRoute !== 'all' ? selectedRoute : null,
        type: selectedTypeRating !== 'all' ? selectedTypeRating : null,
        // Explicitly set these to null to ensure they're removed if not active
        location: selectedTownCity !== 'all' ? selectedTownCity : null,
      });
    } catch (err) {
      setError('Error loading companies. Please try again.');
      console.error('Error loading companies:', err);
    } finally {
      setIsLoading(false);
    }
  }, [enrichedOnly, selectedRoute, selectedTypeRating, updateUrlParams]);
  
  // Load initial data
  useEffect(() => {
    loadCompanies(currentPage, searchTerm);
  }, [loadCompanies, currentPage, searchTerm]);
  
  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadCompanies(1, searchTerm);
  };
  
  // Handle filter changes
  const handleEnrichedOnlyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setEnrichedOnly(newValue);
    setCurrentPage(1);
    
    // Immediately update URL for this specific filter
    updateUrlParams({
      enriched: newValue ? 'true' : null
    });
    
    loadCompanies(1, searchTerm);
  };
  
  const handleTownCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSelectedTownCity(newValue);
    
    // Immediately update URL for this specific filter
    updateUrlParams({
      location: newValue !== 'all' ? newValue : null
    });
    
    // We won't trigger a reload for town/city changes for now
    // setCurrentPage(1);
    // loadCompanies(1, searchTerm);
  };
  
  const handleRouteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSelectedRoute(newValue);
    
    // Immediately update URL for this specific filter
    updateUrlParams({
      route: newValue !== 'all' ? newValue : null
    });
    
    setCurrentPage(1);
    loadCompanies(1, searchTerm);
  };
  
  const handleTypeRatingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSelectedTypeRating(newValue);
    
    // Immediately update URL for this specific filter
    updateUrlParams({
      type: newValue !== 'all' ? newValue : null
    });
    
    setCurrentPage(1);
    loadCompanies(1, searchTerm);
  };
  
  // Function to handle clearing all filters
  const handleClearAllFilters = () => {
    // Reset all filter states to defaults
    setEnrichedOnly(false);
    setSelectedTownCity('all');
    setSelectedRoute('all');
    setSelectedTypeRating('all');
    setCurrentPage(1);
    
    // Clear all filter parameters from URL
    // Using window.location directly to ensure URL is fully cleared
    const url = new URL(window.location.href);
    url.search = '';
    
    // If there was a search term, preserve it
    if (searchTerm?.trim()) {
      url.searchParams.set('q', searchTerm.trim());
    }
    
    // Replace the URL without triggering a navigation
    window.history.replaceState({}, '', url.toString());
    
    // Reload companies with no filters
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
      <div className="govuk-card p-6 mb-8">
        <h2 className="govuk-heading-m mb-4">Search the register</h2>
        <form onSubmit={handleSearch}>
          <div className="mb-6">
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
          
          {/* Filters section */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="govuk-heading-s mb-0">Filters</h3>
              
              {/* Clear all filters button */}
              {(enrichedOnly || selectedRoute !== 'all' || selectedTypeRating !== 'all') && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="text-govuk-blue hover:text-govuk-blue-dark text-sm underline focus:outline-none focus:ring-2 focus:ring-govuk-blue p-1"
                  aria-label="Clear all filters"
                >
                  Clear all filters
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Enriched data only checkbox - updated styling */}
              <div className="flex flex-col">
                <label htmlFor="enriched-only" className="govuk-body mb-2 font-medium">
                  Show enriched data
                </label>
                <div className="relative flex items-center h-[42px]">
                  <div className="flex items-center bg-gray-100 px-4 py-2 rounded w-full h-full">
                    <input
                      id="enriched-only"
                      type="checkbox"
                      className="govuk-checkbox w-5 h-5"
                      checked={enrichedOnly}
                      onChange={handleEnrichedOnlyChange}
                      aria-label="Show enriched data only"
                    />
                    <span className="ml-2 text-gray-800 font-medium">
                      {enrichedOnly ? 'Only' : 'All records'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Town/City dropdown (disabled) - updated styling */}
              <div className="flex flex-col">
                <label htmlFor="town-city" className="govuk-body mb-2 font-medium">
                  Filter by location
                </label>
                <div className="relative">
                  <select
                    id="town-city"
                    className="govuk-select w-full appearance-none bg-gray-200 text-gray-600 py-2 px-4 pr-8 rounded cursor-not-allowed opacity-75"
                    value={selectedTownCity}
                    onChange={handleTownCityChange}
                    disabled={true}
                    aria-label="Filter by location"
                  >
                    <option value="all">All locations</option>
                    {townCityOptions.map(city => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* Route dropdown */}
              <div className="flex flex-col">
                <label htmlFor="route" className="govuk-body mb-2 font-medium">
                  Filter by route
                </label>
                <div className="select-wrapper">
                  <select
                    id="route"
                    className="filter-select"
                    style={{ backgroundColor: '#1d70b8' }}
                    value={selectedRoute}
                    onChange={handleRouteChange}
                    disabled={isLoadingOptions}
                    aria-label="Filter by route"
                  >
                    <option value="all">All routes</option>
                    {routeOptions.map(route => (
                      <option key={route} value={route}>
                        {route}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Type & Rating dropdown */}
              <div className="flex flex-col">
                <label htmlFor="type-rating" className="govuk-body mb-2 font-medium">
                  Filter by type & rating
                </label>
                <div className="select-wrapper">
                  <select
                    id="type-rating"
                    className="dark-select"
                    value={selectedTypeRating}
                    onChange={handleTypeRatingChange}
                    disabled={isLoadingOptions}
                    aria-label="Filter by type and rating"
                  >
                    <option value="all">All types & ratings</option>
                    {typeRatingOptions.map(type => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
            {(enrichedOnly || selectedRoute !== 'all' || selectedTypeRating !== 'all') && (
              <span className="ml-1">with filters applied</span>
            )}
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
          {(enrichedOnly || selectedRoute !== 'all' || selectedTypeRating !== 'all') && (
            <p className="govuk-body mt-2">
              You could also try adjusting the filters to broaden your search.
            </p>
          )}
        </div>
      )}
      
      {!isLoading && !error && companies.length > 0 && (
        <div className="space-y-6">
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
      
      {/* Pagination with URL parameters */}
      {totalPages > 1 && (
        <nav className="govuk-pagination mt-8" role="navigation" aria-label="Pagination">
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