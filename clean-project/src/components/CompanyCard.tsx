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
  
  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-4 hover:shadow-lg transition-shadow">
      <div className="flex flex-col">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {company.company_name || company.original_name}
          </h2>
          {company.company_name !== company.original_name && company.original_name && (
            <p className="text-sm text-gray-500">Original name: {company.original_name}</p>
          )}
          {company.company_number && (
            <p className="text-sm font-semibold text-gray-600">Company #: {company.company_number}</p>
          )}
          {company.jurisdiction && (
            <p className="text-sm text-gray-500">Jurisdiction: {company.jurisdiction}</p>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-md font-semibold text-gray-700">Status</h3>
            <p className="text-gray-600">
              {company.company_status ? (
                <span className={`inline-block px-2 py-1 rounded-full text-xs ${
                  company.company_status.toLowerCase().includes('active') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {company.company_status}
                </span>
              ) : 'Unknown'}
            </p>
          </div>
          
          <div>
            <h3 className="text-md font-semibold text-gray-700">Type</h3>
            <p className="text-gray-600">{company.company_type || 'Unknown'}</p>
          </div>
          
          <div>
            <h3 className="text-md font-semibold text-gray-700">Incorporated</h3>
            <p className="text-gray-600">{formatDate(company.date_of_creation)}</p>
          </div>
          
          <div>
            <h3 className="text-md font-semibold text-gray-700">Location</h3>
            <p className="text-gray-600">
              {company.town_city && company.county 
                ? `${company.town_city}, ${company.county}` 
                : company.town_city || company.county || 'Unknown'}
            </p>
          </div>
          
          {company.external_registration_number && (
            <div>
              <h3 className="text-md font-semibold text-gray-700">External Registration</h3>
              <p className="text-gray-600">{company.external_registration_number}</p>
            </div>
          )}
          
          {company.enrichment_date && (
            <div>
              <h3 className="text-md font-semibold text-gray-700">Data Current As Of</h3>
              <p className="text-gray-600">{formatDate(company.enrichment_date)}</p>
            </div>
          )}
        </div>
        
        <div className="mt-4">
          <h3 className="text-md font-semibold text-gray-700">Address</h3>
          <p className="text-gray-600">{formatAddress()}</p>
        </div>
        
        {company.service_address_info && (
          <div className="mt-4">
            <h3 className="text-md font-semibold text-gray-700">Service Address</h3>
            <p className="text-gray-600">{JSON.stringify(company.service_address_info)}</p>
          </div>
        )}
        
        {company.sic_codes && company.sic_codes.length > 0 && (
          <div className="mt-4">
            <h3 className="text-md font-semibold text-gray-700">SIC Codes</h3>
            <div className="flex flex-wrap gap-1 mt-1">
              {company.sic_codes.map((code, index) => (
                <span 
                  key={index}
                  className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {company.type_rating && (
          <div className="mt-4">
            <h3 className="text-md font-semibold text-gray-700">Type & Rating</h3>
            <p className="text-gray-600">{company.type_rating}</p>
          </div>
        )}
        
        {company.route && (
          <div className="mt-4">
            <h3 className="text-md font-semibold text-gray-700">Route</h3>
            <p className="text-gray-600">{company.route}</p>
          </div>
        )}
        
        <div className="mt-6 border-t pt-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {showDetails ? 'Hide Additional Details' : 'Show Additional Details'}
          </button>
          
          {showDetails && (
            <div className="mt-4 space-y-4">
              {/* Status flags section */}
              <div>
                <h3 className="text-md font-semibold text-gray-700 mb-2">Status Flags</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center">
                    <span className={`h-3 w-3 rounded-full mr-2 ${getRawValue('can_file') ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span>Can File: {getRawValue('can_file') ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center">
                    <span className={`h-3 w-3 rounded-full mr-2 ${getBooleanValue(company.has_been_liquidated) ? 'bg-red-500' : 'bg-green-500'}`}></span>
                    <span>Liquidated: {getBooleanValue(company.has_been_liquidated) ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center">
                    <span className={`h-3 w-3 rounded-full mr-2 ${getBooleanValue(company.has_charges) ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                    <span>Has Charges: {getBooleanValue(company.has_charges) ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center">
                    <span className={`h-3 w-3 rounded-full mr-2 ${getBooleanValue(company.has_insolvency_history) ? 'bg-red-500' : 'bg-green-500'}`}></span>
                    <span>Insolvency History: {getBooleanValue(company.has_insolvency_history) ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
              
              {/* Accounts Section */}
              {company.accounts_info && (
                <div>
                  <h3 className="text-md font-semibold text-gray-700 mb-2">Accounts Information</h3>
                  <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-40">
                    {formatJson(company.accounts_info)}
                  </pre>
                </div>
              )}
              
              {/* Confirmation Statement */}
              {company.confirmation_statement_info && (
                <div>
                  <h3 className="text-md font-semibold text-gray-700 mb-2">Confirmation Statement</h3>
                  <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-40">
                    {formatJson(company.confirmation_statement_info)}
                  </pre>
                </div>
              )}
              
              {/* Foreign Company Details */}
              {company.foreign_company_details_info && (
                <div>
                  <h3 className="text-md font-semibold text-gray-700 mb-2">Foreign Company Details</h3>
                  <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-40">
                    {formatJson(company.foreign_company_details_info)}
                  </pre>
                </div>
              )}
              
              {/* Raw JSON Data */}
              {company.raw_json && (
                <div>
                  <h3 className="text-md font-semibold text-gray-700 mb-2">Complete Company Data (Raw JSON)</h3>
                  <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-60">
                    {formatJson(company.raw_json)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 