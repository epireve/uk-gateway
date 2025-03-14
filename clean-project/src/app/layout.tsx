import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "UK Company Portal | Official Government Service",
  description: "Search and explore UK registered companies with data from Companies House",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="govuk-header">
          <div className="govuk-width-container">
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="govuk-header__logotype">GOV.UK</span>
                <span className="govuk-header__service-name ml-2 md:ml-6 p-2 border-l border-white">
                  Company Portal
                </span>
              </div>
              <nav className="hidden md:block">
                <ul className="flex space-x-6 text-white">
                  <li><Link href="/" className="text-white hover:underline">Home</Link></li>
                  <li><Link href="#" className="text-white hover:underline">About</Link></li>
                  <li><Link href="#" className="text-white hover:underline">Help</Link></li>
                </ul>
              </nav>
            </div>
          </div>
        </header>
        
        <div className="govuk-phase-banner">
          <div className="govuk-width-container">
            <p className="text-sm flex items-center">
              <strong className="font-bold bg-white text-black px-2 py-1 mr-2">BETA</strong>
              This is a new service – your <Link href="#" className="text-white underline ml-1">feedback</Link> will help us improve it.
            </p>
          </div>
        </div>
        
        {children}
        
        <footer className="govuk-footer mt-12">
          <div className="govuk-width-container">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-lg font-bold mb-4">Support</h3>
                <ul className="space-y-2">
                  <li><Link href="#" className="text-govuk-blue hover:underline">Help</Link></li>
                  <li><Link href="#" className="text-govuk-blue hover:underline">Cookies</Link></li>
                  <li><Link href="#" className="text-govuk-blue hover:underline">Contact</Link></li>
                  <li><Link href="#" className="text-govuk-blue hover:underline">Terms and conditions</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-bold mb-4">Related services</h3>
                <ul className="space-y-2">
                  <li><a href="https://www.gov.uk/government/organisations/companies-house" className="text-govuk-blue hover:underline" target="_blank" rel="noopener noreferrer">Companies House</a></li>
                  <li><a href="https://www.gov.uk/browse/business" className="text-govuk-blue hover:underline" target="_blank" rel="noopener noreferrer">Business and self-employed</a></li>
                  <li><a href="https://www.gov.uk/set-up-business" className="text-govuk-blue hover:underline" target="_blank" rel="noopener noreferrer">Setting up a business</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-bold mb-4">About this service</h3>
                <p className="mb-2">This service provides access to the UK register of companies and corporate entities.</p>
                <p className="text-sm">Built and maintained by the Government Digital Service.</p>
              </div>
            </div>
            <div className="mt-8 pt-4 border-t border-govuk-mid-grey">
              <p className="text-sm">&copy; Crown copyright {new Date().getFullYear()}</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
