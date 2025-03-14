import { CompanySearch } from '@/components/CompanySearch';

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
        
        <CompanySearch />
      </div>
    </main>
  );
}
