import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(import.meta.dirname, '..', '..', 'output');

export function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

export function saveJsonReport(results) {
  ensureOutputDir();
  const report = {
    project: "Anta AI Assistant",
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      skipped: results.filter(r => r.status === 'SKIP').length,
    },
    results
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.json'), JSON.stringify(report, null, 2));
  console.log(`\n📄 JSON report: test/output/results.json`);
  return report;
}

export function saveExcelReport(results) {
  ensureOutputDir();
  // CSV format (Excel compatible)
  const header = 'Test ID,Scenario,Test Case,Expected,Actual Result,Status,Duration (ms),Notes';
  const rows = results.map(r =>
    `"${r.id}","${r.scenario}","${r.name}","${esc(r.expected)}","${esc(r.actual)}","${r.status}","${r.duration}","${esc(r.notes || '')}"`
  );
  const csv = [header, ...rows].join('\n');
  // Write as .xlsx (actually CSV but Excel opens it)
  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.csv'), '\uFEFF' + csv, 'utf8');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.xlsx'), '\uFEFF' + csv, 'utf8');
  console.log(`📊 Excel report: test/output/results.xlsx`);
}

function esc(s) { return String(s || '').replace(/"/g, '""').replace(/\n/g, ' '); }

export function printSummary(report) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ANTA AI TEST RESULTS`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Total:   ${report.summary.total}`);
  console.log(`  ✅ Pass:  ${report.summary.passed}`);
  console.log(`  ❌ Fail:  ${report.summary.failed}`);
  console.log(`  ⏭ Skip:  ${report.summary.skipped}`);
  console.log(`${'='.repeat(50)}\n`);

  const failures = report.results.filter(r => r.status === 'FAIL');
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach(f => console.log(`  ${f.id} ${f.name}: ${f.notes}`));
  }
}
