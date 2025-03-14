import { Suspense } from 'react';

// Loading component
const CompanySearchLoading = () => (
  <div className="flex justify-center items-center p-12">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-govuk-blue"></div>
    <span className="ml-3">Loading search...</span>
  </div>
);

// Import the client component wrapper
import dynamic from 'next/dynamic';

// Use dynamic import for ClientCompanySearch
const ClientCompanySearch = dynamic(() => import('../components/ClientCompanySearch'), { ssr: true });

export default function Home() {
  return (
    <main className="govuk-main-wrapper">
      <div className="govuk-width-container">
        <div className="mb-8">
          <h1 className="govuk-heading-xl">Find a UK Company</h1>
          <p className="govuk-body">
            Search for information about companies registered in the United Kingdom. 
            This service provides access to company details from the official Companies House register.
          </p>
        </div>
        
        <Suspense fallback={<CompanySearchLoading />}>
          <ClientCompanySearch />
        </Suspense>
      </div>
    </main>
  );
}
