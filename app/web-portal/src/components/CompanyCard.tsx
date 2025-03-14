"use client";

import React, { useState } from 'react';
import { EnrichedCompany } from '@/lib/models';

interface CompanyCardProps {
  company: EnrichedCompany;
}

export const CompanyCard: React.FC<CompanyCardProps> = ({ company }) => {
  const [showDetails, setShowDetails] = useState(false);
  
  // Format address if available
  const formatAddress = () => {
    if (!company.address) return 'No address available';
    
    const parts = [
      company.address.address_line_1,
      company.address.address_line_2,
      company.address.locality,
      company.address.region,
      company.address.postal_code,
      company.address.country,
    ].filter(Boolean);
    
    return parts.join(', ');
  };
  
  // Format creation date
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Unknown';
    
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };
  
  // Format JSON data for display
  const formatJson = (data: Record<string, unknown> | null | undefined) => {
    if (!data) return 'No data available';
    return JSON.stringify(data, null, 2);
  };
  
  // Get boolean value with null/undefined safety
  const getBooleanValue = (value: boolean | null | undefined) => {
    return value === true;
  };
  
  // Get raw data value safely
  const getRawValue = (key: string) => {
    if (!company.raw_json) return false;
    return (company.raw_json as Record<string, unknown>)[key] === true;
  };
  
  // Get status tag class
  const getStatusTagClass = (status: string | null | undefined) => {
    if (!status) return 'govuk-status-tag--inactive';
    
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('active') || lowerStatus.includes('open')) {
      return 'govuk-status-tag--active';
    } else {
      return 'govuk-status-tag--inactive';
    }
  };
  
  return (
    <div className="govuk-card">
      <div className="border-b border-govuk-mid-grey pb-4 mb-4">
        <h2 className="govuk-heading-m">
          {company.company_name || company.original_name}
        </h2>
        {company.company_name !== company.original_name && company.original_name && (
          <p className="text-govuk-dark-grey text-sm mt-1">Original name: {company.original_name}</p>
        )}
        {company.company_number && (
          <p className="font-bold text-govuk-dark-grey mt-2">Company number: {company.company_number}</p>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <h3 className="font-bold mb-1">Status</h3>
          <p>
            {company.company_status ? (
              <span className={`govuk-status-tag ${getStatusTagClass(company.company_status)}`}>
                {company.company_status}
              </span>
            ) : (
              <span className="text-govuk-dark-grey">Unknown</span>
            )}
          </p>
        </div>
        
        <div>
          <h3 className="font-bold mb-1">Type</h3>
          <p className="text-govuk-dark-grey">{company.company_type || 'Unknown'}</p>
        </div>
        
        <div>
          <h3 className="font-bold mb-1">Incorporated</h3>
          <p className="text-govuk-dark-grey">{formatDate(company.date_of_creation)}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <h3 className="font-bold mb-1">Location</h3>
          <p className="text-govuk-dark-grey">
            {company.town_city && company.county 
              ? `${company.town_city}, ${company.county}` 
              : company.town_city || company.county || 'Unknown'}
          </p>
        </div>
        
        <div>
          <h3 className="font-bold mb-1">Address</h3>
          <p className="text-govuk-dark-grey">{formatAddress()}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {company.type_rating && (
          <div>
            <h3 className="font-bold mb-1">Type & Rating</h3>
            <p className="text-govuk-dark-grey">{company.type_rating}</p>
          </div>
        )}
        
        {company.route && (
          <div>
            <h3 className="font-bold mb-1">Route</h3>
            <p className="text-govuk-dark-grey">{company.route}</p>
          </div>
        )}
      </div>
      
      {/* Display SIC Codes more prominently */}
      {company.sic_codes && company.sic_codes.length > 0 && (
        <div className="mb-4">
          <h3 className="font-bold mb-1">SIC Codes</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {company.sic_codes.map((code, index) => (
              <span 
                key={index}
                className="inline-block bg-govuk-light-grey text-govuk-black text-sm px-3 py-1 rounded"
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}
      
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-govuk-blue hover:underline font-bold mt-4 focus:outline-none focus:ring-2 focus:ring-govuk-focus-colour"
        aria-expanded={showDetails}
      >
        {showDetails ? 'Hide additional details' : 'Show additional details'}
      </button>
      
      {showDetails && (
        <div className="mt-4 border-t border-govuk-mid-grey pt-4">
          {/* Status flags section */}
          <div className="mb-6">
            <h3 className="font-bold mb-3">Status Flags</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center">
                <span className={`h-3 w-3 rounded-full mr-2 ${getRawValue('can_file') ? 'bg-govuk-success-colour' : 'bg-govuk-error-colour'}`}></span>
                <span className="text-govuk-dark-grey">Can File: {getRawValue('can_file') ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center">
                <span className={`h-3 w-3 rounded-full mr-2 ${getBooleanValue(company.has_been_liquidated) ? 'bg-govuk-error-colour' : 'bg-govuk-success-colour'}`}></span>
                <span className="text-govuk-dark-grey">Liquidated: {getBooleanValue(company.has_been_liquidated) ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center">
                <span className={`h-3 w-3 rounded-full mr-2 ${getBooleanValue(company.has_charges) ? 'bg-govuk-dark-grey' : 'bg-govuk-success-colour'}`}></span>
                <span className="text-govuk-dark-grey">Has Charges: {getBooleanValue(company.has_charges) ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center">
                <span className={`h-3 w-3 rounded-full mr-2 ${getBooleanValue(company.has_insolvency_history) ? 'bg-govuk-error-colour' : 'bg-govuk-success-colour'}`}></span>
                <span className="text-govuk-dark-grey">Insolvency History: {getBooleanValue(company.has_insolvency_history) ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
          
          {/* Accounts Section */}
          {company.accounts_info && (
            <div className="mb-6">
              <h3 className="font-bold mb-3">Accounts Information</h3>
              <div className="bg-govuk-light-grey p-4 overflow-auto max-h-60">
                <pre className="text-xs whitespace-pre-wrap">
                  {formatJson(company.accounts_info)}
                </pre>
              </div>
            </div>
          )}
          
          {/* Confirmation Statement */}
          {company.confirmation_statement_info && (
            <div className="mb-6">
              <h3 className="font-bold mb-3">Confirmation Statement</h3>
              <div className="bg-govuk-light-grey p-4 overflow-auto max-h-60">
                <pre className="text-xs whitespace-pre-wrap">
                  {formatJson(company.confirmation_statement_info)}
                </pre>
              </div>
            </div>
          )}
          
          {/* Foreign Company Details */}
          {company.foreign_company_details_info && (
            <div className="mb-6">
              <h3 className="font-bold mb-3">Foreign Company Details</h3>
              <div className="bg-govuk-light-grey p-4 overflow-auto max-h-60">
                <pre className="text-xs whitespace-pre-wrap">
                  {formatJson(company.foreign_company_details_info)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 