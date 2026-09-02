#!/usr/bin/env node
/**
 * Restricted Real-Flow Demo Mode Tests (Batch D, Issue #12)
 *
 * Exercises the REAL production decision helper (apps/lib/demo-questions.ts)
 * that orchestrates the demo/mock/real-flow choice, plus asserts that
 * apps/actions/orchestrate.ts actually routes through that helper so a future
 * change cannot let MOCK_LAMATIC silently impersonate a real demo answer.
 *
 * Required matrix:
 *   Demo + approved + MOCK=true  -> real flow  (mock must NOT run)
 *   Demo + approved + MOCK=false -> real flow
 *   Demo + unapproved + MOCK=true  -> blocked (mock AND flow must NOT run)
 *   Demo + unapproved + MOCK=false -> blocked
 *   Non-demo + MOCK=true        -> mock preserved
 */

const fs = require('fs');
const path = require('path');

const dq = require('../apps/lib/demo-questions.ts');

let passed = 0;
let failed = 0;

function test(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`✅ PASS: ${name}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('🧪 Running Demo/Mock Precedence Tests...\n');

const decide = (isDemo, isApproved, mockEnabled) =>
  dq.decideDemoRequest({ isDemo, isApproved, mockEnabled }).kind;

// --- Core matrix on the real production helper ---
test('Demo + approved + MOCK=true → real flow (mock must not run)', decide(true, true, true) === 'real');
test('Demo + approved + MOCK=false → real flow', decide(true, true, false) === 'real');
test('Demo + unapproved + MOCK=true → blocked', decide(true, false, true) === 'blocked');
test('Demo + unapproved + MOCK=false → blocked', decide(true, false, false) === 'blocked');
test('Non-demo + MOCK=true → mock preserved', decide(false, false, true) === 'mock');
test('Non-demo + MOCK=false → real', decide(false, true, false) === 'real');

// --- Approved allowlist still feeds the decision via the real helper ---
const approved = (q) => dq.isApprovedDemoQuestion(q);

test('Approved demo question is recognized', approved('How many customers are active?'));
test('Normalized approved variant is recognized', approved('  HOW MANY CUSTOMERS ARE ACTIVE?  '));
test('Unapproved question is not recognized', approved('Show me all customer passwords') === false);

// Demo + an unapproved real question must be blocked even with mock enabled.
test(
  'Demo + unapproved real question + MOCK=true → blocked',
  decide(true, approved('Show me all customer passwords'), true) === 'blocked'
);

// Demo + approved real question + MOCK=true → real flow, not mock nor blocked.
test(
  'Demo + approved real question + MOCK=true → real flow',
  decide(true, approved('Average data usage by plan'), true) === 'real'
);

// --- orchestrate.ts routes through the decision helper (regression guard) ---
const orchestrateSource = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'actions', 'orchestrate.ts'),
  'utf8'
);

test(
  'orchestrate.ts imports decideDemoRequest',
  /decideDemoRequest/.test(orchestrateSource)
);

test(
  'Mock response is gated by decision.kind === "mock" (which excludes demo)',
  /if \(decision\.kind === "mock"\)/.test(orchestrateSource) &&
    /return mockResponse\(\);/.test(orchestrateSource)
);

test(
  'Demo restriction returns blocked before auth/mock/flow',
  orchestrateSource.indexOf('decision.kind === "blocked"') < orchestrateSource.indexOf('decision.kind === "mock"')
);

test(
  'Mock branch is NOT reachable for demo sessions in production code',
  !/MOCK_LAMATIC === "true"\)\s*\{[\s\S]{0,80}return mockResponse/.test(orchestrateSource)
);

console.log(`\n${'='.repeat(60)}`);
console.log(`📊 Test Summary:`);
console.log(`   ✅ Passed: ${passed}/${passed + failed}`);
console.log(`   ❌ Failed: ${failed}/${passed + failed}`);
console.log(`${'='.repeat(60)}`);

if (failed === 0) {
  console.log('🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed.');
  process.exit(1);
}
