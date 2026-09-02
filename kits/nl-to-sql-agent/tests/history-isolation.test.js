#!/usr/bin/env node
/**
 * History Isolation Tests (Batch D, Issue #10)
 *
 * The NL-to-SQL history is stored in localStorage under the single key
 * 'nl-to-sql-history'. On logout only this key must be removed, destroying the
 * server session while leaving unrelated browser storage (e.g. the theme
 * preference 'nl-to-sql-theme') untouched, and a later login must not restore
 * the previous session's history.
 *
 * history.ts also imports React (server-side concern), so the kit-level test
 * cannot `require` the module. Instead it extracts the REAL clearStoredHistory
 * function (plus the HISTORY_STORAGE_KEY constant) from the production source
 * and executes it against a localStorage polyfill, proving the actual
 * production logic rather than a re-implementation.
 */

const fs = require('fs');
const path = require('path');

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

console.log('🧪 Running History Isolation Tests...\n');

const historySource = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'lib', 'history.ts'),
  'utf8'
);

// --- Constant is defined and correct ---
const keyMatch = historySource.match(/export const HISTORY_STORAGE_KEY = '([^']+)'/);
const HISTORY_STORAGE_KEY = keyMatch ? keyMatch[1] : null;

test(
  "HISTORY_STORAGE_KEY is defined as 'nl-to-sql-history'",
  HISTORY_STORAGE_KEY === 'nl-to-sql-history'
);

// --- clearStoredHistory must remove only that single key (never clear all) ---
test(
  'clearStoredHistory removes via localStorage.removeItem (not clear)',
  /localStorage\.removeItem\(HISTORY_STORAGE_KEY\)/.test(historySource) &&
    !/localStorage\.clear\(\)/.test(
      historySource.slice(historySource.indexOf('clearStoredHistory'))
    )
);

test(
  'clearStoredHistory is exported for use by the logout flow',
  /export function clearStoredHistory/.test(historySource)
);

// --- The real production logic runs against a localStorage polyfill ---
const fnMatch = historySource.match(/export function clearStoredHistory\(\): void \{[\s\S]*?\n\}/);
let clearStoredHistory = null;
let extractionOk = false;
if (fnMatch) {
  const body = fnMatch[0]
    .replace(/^export /, '')
    .replace(/: void/, '')
    .replace(/HISTORY_STORAGE_KEY/g, JSON.stringify(HISTORY_STORAGE_KEY));
  // eslint-disable-next-line no-new-func
  clearStoredHistory = new Function(body + '\nreturn clearStoredHistory;')();
  extractionOk = typeof clearStoredHistory === 'function';
}
test('Extracted clearStoredHistory is executable', extractionOk);

// Polyfilled browser storage
function createStorage(initial) {
  const store = Object.assign({}, initial);
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _keys: () => Object.keys(store),
  };
}

function runLogout(initial) {
  const ls = createStorage(initial);
  const prevWindow = global.window;
  const prevLocalStorage = global.localStorage;
  global.window = {};
  global.localStorage = ls;
  try {
    clearStoredHistory();
  } finally {
    if (prevWindow === undefined) delete global.window; else global.window = prevWindow;
    if (prevLocalStorage === undefined) delete global.localStorage; else global.localStorage = prevLocalStorage;
  }
  return ls;
}

const sampleEntry = [
  { id: 'a1', question: 'How many customers are active?', sql: 'SELECT 1', explanation: 'x', isSafe: 'true', timestamp: '2026-01-01T00:00:00.000Z', favorite: false },
].map((e) => JSON.stringify(e)).join(',');

const preLoad = {
  'nl-to-sql-history': `[${sampleEntry}]`,
  'nl-to-sql-theme': 'dark',
  'some-other-key': 'untouched',
};

const afterLogout = runLogout(preLoad);

test('Logout removes the nl-to-sql-history key', !('nl-to-sql-history' in afterLogout._keys() || afterLogout.getItem('nl-to-sql-history') !== null));

test('Logout leaves the theme preference intact', afterLogout.getItem('nl-to-sql-theme') === 'dark');

test('Logout leaves unrelated browser keys intact', afterLogout.getItem('some-other-key') === 'untouched');

test('No previous-session history is restored after logout', afterLogout.getItem('nl-to-sql-history') === null);

// --- History initializer (mirrors lib/history.ts) returns [] once the key is removed ---
const initializer = (storage) => {
  const saved = storage.getItem('nl-to-sql-history');
  return saved ? JSON.parse(saved) : [];
};

test(
  'Next session initializer yields empty history after logout',
  Array.isArray(initializer(afterLogout)) && initializer(afterLogout).length === 0
);

// --- TopNav invokes the logout clear client-side before the POST to /logout ---
const topNavSource = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'app', '(protected)', 'components', 'TopNav.tsx'),
  'utf8'
);
test(
  'TopNav logout form clears stored history via clearStoredHistory',
  /clearStoredHistory/.test(topNavSource) &&
    /action="\/logout"\s+method="post"\s+onSubmit=\{clearStoredHistory\}/.test(topNavSource)
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
