"use client";

import dynamic from 'next/dynamic';

// Dynamically import the CompanySearch component with ssr disabled
// This is allowed in client components but not in server components
const CompanySearch = dynamic(
  () => import('@/components/CompanySearch').then(mod => ({ default: mod.CompanySearch })),
  { ssr: false }
);

export default function ClientCompanySearch() {
  return <CompanySearch />;
} 