import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const logDir = path.join(process.cwd(), 'logs');

// Get command line arguments
const args = process.argv.slice(2);
let date = new Date().toISOString().split('T')[0]; // Default to today

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && i + 1 < args.length) {
    date = args[i + 1];
    i++; // Skip the next argument
  }
}

// Validate date format
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Invalid date format. Please use YYYY-MM-DD');
  process.exit(1);
}

// Try to read the enrichment report
const enrichmentReportPath = path.join(logDir, `enrichment-report-${date}.json`);
const reprocessingReportPath = path.join(logDir, `reprocessing-report-${date}.json`);

let enrichmentReport: any = null;
let reprocessingReport: any = null;

if (fs.existsSync(enrichmentReportPath)) {
  try {
    enrichmentReport = JSON.parse(fs.readFileSync(enrichmentReportPath, 'utf8'));
  } catch (error) {
    console.error(`Error reading enrichment report: ${error}`);
  }
}

if (fs.existsSync(reprocessingReportPath)) {
  try {
    reprocessingReport = JSON.parse(fs.readFileSync(reprocessingReportPath, 'utf8'));
  } catch (error) {
    console.error(`Error reading reprocessing report: ${error}`);
  }
}

if (!enrichmentReport && !reprocessingReport) {
  console.error(`No reports found for date: ${date}`);
  console.log(`Available report dates:`);
  
  // List available reports
  const files = fs.readdirSync(logDir);
  const reportDates = new Set<string>();
  
  for (const file of files) {
    if (file.startsWith('enrichment-report-') || file.startsWith('reprocessing-report-')) {
      const dateMatch = file.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        reportDates.add(dateMatch[0]);
      }
    }
  }
  
  if (reportDates.size === 0) {
    console.log('No reports found');
  } else {
    reportDates.forEach(date => console.log(`- ${date}`));
  }
  
  process.exit(1);
}

// Display the report(s)
console.log(`\n=== REPORTS FOR ${date} ===\n`);

if (enrichmentReport) {
  console.log('ENRICHMENT REPORT:');
  console.log('-----------------');
  console.log(`Total records processed: ${enrichmentReport.stats.total}`);
  console.log(`Successfully enriched: ${enrichmentReport.stats.successful}`);
  console.log(`Failed: ${enrichmentReport.stats.failed}`);
  console.log(`Success rate: ${(enrichmentReport.stats.successful / enrichmentReport.stats.total * 100).toFixed(2)}%`);
  console.log(`API calls made: ${enrichmentReport.stats.apiCallsMade}`);
  console.log(`Duration: ${enrichmentReport.stats.durationMinutes.toFixed(2)} minutes`);
  console.log(`Average processing time per record: ${(enrichmentReport.stats.durationMs / enrichmentReport.stats.total).toFixed(2)} ms`);
  console.log();
}

if (reprocessingReport) {
  console.log('REPROCESSING REPORT:');
  console.log('------------------');
  console.log(`Total records reprocessed: ${reprocessingReport.stats.total}`);
  console.log(`Successfully reprocessed: ${reprocessingReport.stats.successful}`);
  console.log(`Failed: ${reprocessingReport.stats.failed}`);
  console.log(`Success rate: ${(reprocessingReport.stats.successful / reprocessingReport.stats.total * 100).toFixed(2)}%`);
  console.log(`API calls made: ${reprocessingReport.stats.apiCallsMade}`);
  console.log(`Duration: ${reprocessingReport.stats.durationMinutes.toFixed(2)} minutes`);
  console.log(`Average processing time per record: ${(reprocessingReport.stats.durationMs / reprocessingReport.stats.total).toFixed(2)} ms`);
  console.log();
}

// Check for associated log files
console.log('ASSOCIATED LOG FILES:');
console.log('-------------------');

const logFiles = [
  { name: 'Process log', path: path.join(logDir, `enrichment-process-${date}.log`) },
  { name: 'Success log', path: path.join(logDir, `successful-enrichment-${date}.log`) },
  { name: 'Failed log', path: path.join(logDir, `failed-enrichment-${date}.log`) },
  { name: 'Reprocess log', path: path.join(logDir, `reprocess-failed-${date}.log`) },
  { name: 'Reprocess success log', path: path.join(logDir, `reprocess-success-${date}.log`) }
];

for (const logFile of logFiles) {
  if (fs.existsSync(logFile.path)) {
    const stats = fs.statSync(logFile.path);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const lineCount = fs.readFileSync(logFile.path, 'utf8').split('\n').length;
    console.log(`${logFile.name}: ${logFile.path} (${sizeMB} MB, ${lineCount} lines)`);
  }
}

console.log('\nTo view a specific log file, use:');
console.log(`cat ${path.join(logDir, `enrichment-process-${date}.log`)}`); 