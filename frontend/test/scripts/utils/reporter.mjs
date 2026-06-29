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
  // XML Spreadsheet 2003 format (opens in all Excel versions)
  const rows = results.map(r => `      <Row>
        <Cell><Data ss:Type="String">${esc(r.id)}</Data></Cell>
        <Cell><Data ss:Type="String">${esc(r.scenario)}</Data></Cell>
        <Cell><Data ss:Type="String">${esc(r.name)}</Data></Cell>
        <Cell><Data ss:Type="String">${esc(r.expected)}</Data></Cell>
        <Cell><Data ss:Type="String">${esc(r.actual)}</Data></Cell>
        <Cell><Data ss:Type="String">${r.status}</Data></Cell>
        <Cell><Data ss:Type="Number">${r.duration}</Data></Cell>
        <Cell><Data ss:Type="String">${esc(r.notes || '')}</Data></Cell>
      </Row>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#22d3ee" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Pass"><Interior ss:Color="#d1fae5" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Fail"><Interior ss:Color="#fee2e2" ss:Pattern="Solid"/></Style>
  </Styles>
  <Worksheet ss:Name="Test Results">
    <Table>
      <Column ss:Width="60"/>
      <Column ss:Width="60"/>
      <Column ss:Width="200"/>
      <Column ss:Width="200"/>
      <Column ss:Width="200"/>
      <Column ss:Width="50"/>
      <Column ss:Width="70"/>
      <Column ss:Width="200"/>
      <Row ss:StyleID="Header">
        <Cell><Data ss:Type="String">Test ID</Data></Cell>
        <Cell><Data ss:Type="String">Scenario</Data></Cell>
        <Cell><Data ss:Type="String">Test Case</Data></Cell>
        <Cell><Data ss:Type="String">Expected</Data></Cell>
        <Cell><Data ss:Type="String">Actual Result</Data></Cell>
        <Cell><Data ss:Type="String">Status</Data></Cell>
        <Cell><Data ss:Type="String">Duration (ms)</Data></Cell>
        <Cell><Data ss:Type="String">Notes</Data></Cell>
      </Row>
${rows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Summary">
    <Table>
      <Row><Cell><Data ss:Type="String">Project</Data></Cell><Cell><Data ss:Type="String">Anta AI Assistant</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Date</Data></Cell><Cell><Data ss:Type="String">${new Date().toISOString()}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Total</Data></Cell><Cell><Data ss:Type="Number">${results.length}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Passed</Data></Cell><Cell><Data ss:Type="Number">${results.filter(r=>r.status==='PASS').length}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Failed</Data></Cell><Cell><Data ss:Type="Number">${results.filter(r=>r.status==='FAIL').length}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Skipped</Data></Cell><Cell><Data ss:Type="Number">${results.filter(r=>r.status==='SKIP').length}</Data></Cell></Row>
    </Table>
  </Worksheet>
</Workbook>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.xls'), xml, 'utf8');
  console.log(`📊 Excel report: test/output/results.xls`);
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, ' '); }

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
