import { CompanySearch } from '@/components/CompanySearch';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-blue-700 text-white py-6 mb-8">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-3xl font-bold">UK Company Portal</h1>
          <p className="mt-2">Search and explore UK companies with data from Companies House</p>
        </div>
      </div>
      
      <CompanySearch />
      
      <footer className="mt-16 py-6 bg-gray-100">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600 text-sm">
          <p>Data sourced from Companies House API under the Open Government License.</p>
          <p className="mt-2">
            &copy; {new Date().getFullYear()} UK Company Portal - This site is not affiliated with Companies House
          </p>
        </div>
      </footer>
    </main>
  );
}
