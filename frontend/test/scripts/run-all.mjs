#!/usr/bin/env node
/**
 * Anta AI - Full Test Automation Runner
 * 
 * Usage: node test/scripts/run-all.mjs
 * Env:   TEST_URL=http://localhost:3000 (default)
 */

import { runOrbTests } from './suites/orb.test.mjs';
import { runChatTests } from './suites/chat.test.mjs';
import { runVoiceTests } from './suites/voice.test.mjs';
import { runSearchTests } from './suites/search.test.mjs';
import { runFeatureTests } from './suites/features.test.mjs';
import { saveJsonReport, saveExcelReport, printSummary } from './utils/reporter.mjs';

console.log('🚀 Anta AI Test Suite Starting...');
console.log(`   URL: ${process.env.TEST_URL || 'http://localhost:3000'}`);
console.log('');

const allResults = [];

async function runSuite(name, fn) {
  console.log(`▶ Running: ${name}...`);
  try {
    const results = await fn();
    allResults.push(...results);
    const pass = results.filter(r => r.status === 'PASS').length;
    const fail = results.filter(r => r.status === 'FAIL').length;
    const skip = results.filter(r => r.status === 'SKIP').length;
    console.log(`  ✅ ${pass} pass, ❌ ${fail} fail, ⏭ ${skip} skip`);
  } catch (err) {
    console.error(`  💥 Suite crashed: ${err.message}`);
    allResults.push({ id: 'CRASH', scenario: name, name: `Suite ${name} crash`, expected: 'No crash', actual: err.message, status: 'FAIL', duration: 0, notes: err.stack?.slice(0, 200) });
  }
}

await runSuite('Orb Tests', runOrbTests);
await runSuite('Chat Tests', runChatTests);
await runSuite('Voice Tests', runVoiceTests);
await runSuite('Search Tests', runSearchTests);
await runSuite('Feature Tests', runFeatureTests);

// Sort by ID
allResults.sort((a, b) => a.id.localeCompare(b.id));

// Generate reports
const report = saveJsonReport(allResults);
saveExcelReport(allResults);
printSummary(report);

process.exit(report.summary.failed > 0 ? 1 : 0);
