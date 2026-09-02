#!/usr/bin/env node
/**
 * Export Object-URL Lifecycle Tests (Batch E1, Issue #15)
 *
 * Both the CSV and JSON download handlers create a temporary object URL
 * (URL.createObjectURL), trigger a download via a hidden anchor, remove the
 * anchor, and must release the URL with URL.revokeObjectURL afterwards.
 *
 * These tests execute the REAL handler bodies from apps/app/(protected)/page.tsx
 * against a mocked browser API and assert that:
 *   - createObjectURL was called,
 *   - the anchor download was triggered and removed,
 *   - revokeObjectURL was eventually called with the exact created URL.
 *
 * This is a behavioral check, not a source-string match, so a future refactor
 * cannot silently drop cleanup on one export path.
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

console.log('🧪 Running Export Object-URL Lifecycle Tests...\n');

const pageSource = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'app', '(protected)', 'page.tsx'),
  'utf8'
);

// ---- Mock browser environment ----
function buildEnvironment() {
  const events = { created: [], revoked: [], downloaded: [], anchors: [] };

  const document = {
    createElement(tag) {
      const anchor = {
        tag,
        attrs: {},
        style: {},
        click() {
          events.downloaded.push(this.attrs.href);
        },
        setAttribute(name, value) {
          this.attrs[name] = value;
        },
      };
      events.anchors.push(anchor);
      return anchor;
    },
    body: {
      appended: [],
      removed: [],
      appendChild(el) { this.appended.push(el); },
      removeChild(el) { this.removed.push(el); },
    },
  };

  const URL = {
    createObjectURL(blob) {
      const url = `blob:mock/${events.created.length + 1}`;
      events.created.push(url);
      return url;
    },
    revokeObjectURL(url) {
      events.revoked.push(url);
    },
  };

  // Invoke the deferred cleanup immediately so revocation is deterministic.
  const setTimeout = (fn) => { fn(); };

  return { events, document, URL, setTimeout };
}

// ---- Extract and run the CSV handler ----
// Strip the TS inline type annotation(s) so the body compiles as plain JS in
// the `new Function` harness (Node's type strip runs at module load, not here).
const csvHandlerMatch = pageSource.match(/const handleDownloadCSV = \(\) => \{[\s\S]*?\n  \};/);
test('Extracted CSV download handler from page.tsx', csvHandlerMatch !== null);
if (csvHandlerMatch) {
  const csv = require('../apps/lib/csv.ts');
  const env = buildEnvironment();
  const csvBody = csvHandlerMatch[0].replace(/: Record<string, unknown>/g, '');
  // eslint-disable-next-line no-new-func
  const handleDownloadCSV = new Function(
    'result', 'alert', 'Blob', 'URL', 'document', 'setTimeout', 'csvEscapeCell',
    csvBody + '\nreturn handleDownloadCSV;'
  )(  { results: [{ name: '=1+1', active: 'true' }] },
      () => {},
      Blob,
      env.URL,
      env.document,
      env.setTimeout,
      csv.csvEscapeCell);

  handleDownloadCSV();

  test('CSV created an object URL', env.events.created.length === 1);
  test(
    'CSV revoked the created object URL',
    env.events.revoked.length === 1 && env.events.revoked[0] === env.events.created[0],
    `created=${JSON.stringify(env.events.created)} revoked=${JSON.stringify(env.events.revoked)}`
  );
  test('CSV download was triggered', env.events.downloaded.length === 1 && env.events.downloaded[0] === env.events.created[0]);
  test('CSV anchor was appended then removed', env.document.body.appended.length === 1 && env.document.body.removed.length === 1);
}

// ---- Extract and run the JSON handler ----
const jsonHandlerMatch = pageSource.match(/const handleDownloadJSON = \(\) => \{[\s\S]*?\n  \};/);
test('Extracted JSON download handler from page.tsx', jsonHandlerMatch !== null);
if (jsonHandlerMatch) {
  const env = buildEnvironment();
  // eslint-disable-next-line no-new-func
  const handleDownloadJSON = new Function(
    'result', 'alert', 'Blob', 'URL', 'document', 'setTimeout',
    jsonHandlerMatch[0] + '\nreturn handleDownloadJSON;'
  )(  { results: [{ id: 1, note: 'Café 🎉' }] },
      () => {},
      Blob,
      env.URL,
      env.document,
      env.setTimeout);

  handleDownloadJSON();

  test('JSON created an object URL', env.events.created.length === 1);
  test(
    'JSON revoked the created object URL',
    env.events.revoked.length === 1 && env.events.revoked[0] === env.events.created[0],
    `created=${JSON.stringify(env.events.created)} revoked=${JSON.stringify(env.events.revoked)}`
  );
  test('JSON download was triggered', env.events.downloaded.length === 1 && env.events.downloaded[0] === env.events.created[0]);
  test('JSON anchor was appended then removed', env.document.body.appended.length === 1 && env.document.body.removed.length === 1);
}

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
