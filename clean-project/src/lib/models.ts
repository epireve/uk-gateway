import { z } from 'zod';

// Original CSV data model
export const CompanyCsvSchema = z.object({
  'Organisation Name': z.string(),
  'Town/City': z.string().nullable(),
  'County': z.string().nullable(),
  'Type & Rating': z.string().nullable(),
  'Route': z.string().nullable(),
});

export type CompanyCsv = z.infer<typeof CompanyCsvSchema>;

// Companies House search result model
export const CompanySearchItemSchema = z.object({
  company_number: z.string(),
  company_name: z.string(),
  company_status: z.string().nullable(),
  company_type: z.string().nullable(),
  address: z.object({
    address_line_1: z.string().nullable().optional(),
    address_line_2: z.string().nullable().optional(),
    locality: z.string().nullable().optional(),
    postal_code: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
  }).optional(),
  date_of_creation: z.string().nullable().optional(),
  sic_codes: z.array(z.string()).nullable().optional(),
});

export type CompanySearchItem = z.infer<typeof CompanySearchItemSchema>;

// Companies House company profile model with enhanced schema
// Using a more flexible approach to allow for different structures
export const CompanyProfileSchema = z.object({
  company_number: z.string(),
  company_name: z.string(),
  company_status: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  date_of_creation: z.string().nullable().optional(),
  registered_office_address: z.record(z.string(), z.any()).optional(),
  service_address: z.record(z.string(), z.any()).optional(),
  sic_codes: z.array(z.string()).nullable().optional(),
  can_file: z.boolean().optional(),
  has_been_liquidated: z.boolean().optional(),
  has_charges: z.boolean().optional(),
  has_insolvency_history: z.boolean().optional(),
  registered_office_is_in_dispute: z.boolean().optional(),
  undeliverable_registered_office_address: z.boolean().optional(),
  has_super_secure_pscs: z.boolean().optional(),
  jurisdiction: z.string().optional(),
  etag: z.string().optional(),
  last_full_members_list_date: z.string().nullable().optional(),
  accounts: z.record(z.string(), z.any()).optional(),
  confirmation_statement: z.record(z.string(), z.any()).optional(),
  foreign_company_details: z.record(z.string(), z.any()).optional(),
  external_registration_number: z.string().optional(),
  links: z.record(z.string(), z.any()).optional(),
  // Using z.any() to allow for unknown or varying fields in different company structures
  // This will capture fields we don't explicitly model but will be included in raw_json
}).passthrough(); // Allow unknown fields

export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

// Enriched company data to be stored in Supabase
export const EnrichedCompanySchema = z.object({
  id: z.string().uuid(),
  original_name: z.string(),
  company_name: z.string().nullable().optional(),
  company_number: z.string().nullable().optional(),
  company_status: z.string().nullable().optional(),
  company_type: z.string().nullable().optional(),
  date_of_creation: z.string().nullable().optional(),
  address: z.object({
    address_line_1: z.string().nullable().optional(),
    address_line_2: z.string().nullable().optional(),
    locality: z.string().nullable().optional(),
    postal_code: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
  }).optional(),
  sic_codes: z.array(z.string()).nullable().optional(),
  town_city: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  type_rating: z.string().nullable().optional(),
  route: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  // Add fields to capture the complete API response
  raw_json: z.record(z.string(), z.any()).optional(), // Store the entire raw JSON response
  jurisdiction: z.string().nullable().optional(),
  accounts_info: z.record(z.string(), z.any()).nullable().optional(),
  confirmation_statement_info: z.record(z.string(), z.any()).nullable().optional(),
  foreign_company_details_info: z.record(z.string(), z.any()).nullable().optional(),
  links_info: z.record(z.string(), z.any()).nullable().optional(),
  service_address_info: z.record(z.string(), z.any()).nullable().optional(),
  has_been_liquidated: z.boolean().nullable().optional(),
  has_charges: z.boolean().nullable().optional(),
  has_insolvency_history: z.boolean().nullable().optional(),
  registered_office_is_in_dispute: z.boolean().nullable().optional(),
  undeliverable_registered_office_address: z.boolean().nullable().optional(),
  has_super_secure_pscs: z.boolean().nullable().optional(),
  etag: z.string().nullable().optional(),
  external_registration_number: z.string().nullable().optional(),
  last_full_members_list_date: z.string().nullable().optional(),
  enrichment_date: z.string().optional(), // The date/time when the data was enriched
  // Add a field to store any additional fields not captured by our schema
  additional_fields: z.record(z.string(), z.any()).optional(),
});

export type EnrichedCompany = z.infer<typeof EnrichedCompanySchema>; 