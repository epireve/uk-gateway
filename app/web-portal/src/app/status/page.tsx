import { Suspense } from 'react';
import dynamic from 'next/dynamic';

// Loading component
const StatusLoading = () => (
  <div className="flex justify-center items-center p-12">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-govuk-blue"></div>
    <span className="ml-3">Loading status data...</span>
  </div>
);

// Dynamically import the client component
const EnrichmentStatusClient = dynamic(
  () => import('@/components/status/EnrichmentStatus').then(mod => ({ default: mod.EnrichmentStatus })),
  { ssr: true }
);

export default function StatusPage() {
  return (
    <main className="govuk-main-wrapper">
      <div className="govuk-width-container">
        <div className="mb-8">
          <h1 className="govuk-heading-xl">Data Enrichment Status</h1>
          <p className="govuk-body">
            This page allows you to view and manage the data enrichment process.
            You can view the current status, check failed enrichments, and trigger enrichment processes for 
            both failed items and remaining companies.
          </p>
        </div>
        
        <Suspense fallback={<StatusLoading />}>
          <EnrichmentStatusClient />
        </Suspense>
      </div>
    </main>
  );
} 