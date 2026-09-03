#!/usr/bin/env node
/**
 * Lamatic Authorization Transport Safety Tests (Issue #4)
 *
 * Verifies the security property that a Lamatic API credential (the
 * Authorization Bearer key) can never be sent to an untrusted remote HTTP
 * endpoint.
 *
 * Production behavior (apps/lib/lamatic-client.ts):
 *   - The Lamatic endpoint is validated at module load via
 *     validateLamaticEndpoint(), which requires HTTPS for remote hosts and
 *     plain HTTP only for localhost/loopback, before any request is made.
 *   - There is exactly ONE fetch() path (executeLamaticFlow) that attaches the
 *     Authorization header, and it always uses the same validated
 *     LAMATIC_API_URL constant.
 *
 * This suite executes the REAL production validateLamaticEndpoint function
 * (extracted from source) and asserts the static ordering / single-fetch
 * property directly on the production file.
 */

const fs = require('fs');
const os = require('os');
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

console.log('🧪 Running Lamatic Authorization Transport Safety Tests...\n');

const clientSource = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'lib', 'lamatic-client.ts'),
  'utf8'
);

// ============================================================================
// STATIC CONTRACT: validation happens before the credential is attached
// ============================================================================

test(
  'Endpoint validation runs at module scope (before any fetch)',
  /validateLamaticEndpoint\(LAMATIC_API_URL\);\s*\n\s*export async function executeLamaticFlow/.test(clientSource)
);

const authHeaderCount = (clientSource.match(/Authorization/g) || []).length;
const fetchCount = (clientSource.match(/\bfetch\(/g) || []).length;

test(
  'Exactly one Authorization header is attached in production',
  authHeaderCount === 1,
  `found ${authHeaderCount}`
);

test(
  'Exactly one fetch() call to the Lamatic API exists in production',
  fetchCount === 1,
  `found ${fetchCount}`
);

test(
  'The fetch uses the same validated LAMATIC_API_URL constant',
  /fetch\(LAMATIC_API_URL,/.test(clientSource)
);

test(
  'The Authorization header is attached only inside the fetch call',
  /headers:\s*\{[\s\S]*?["']Authorization["']:\s*`Bearer \$\{LAMATIC_API_KEY\}`/.test(clientSource)
);

test(
  'No alternate URL branch constructs a request outside executeLamaticFlow',
  (clientSource.match(/fetch\(/g) || []).length === 1
);

// ============================================================================
// BEHAVIORAL: execute the real production endpoint validator
// ============================================================================

function extractFunction(src, name) {
  const sigRegex = new RegExp(`function ${name}\\(url: string\\): void \\{`);
  const sigStart = src.search(sigRegex);
  test(`Extracted ${name} from production source`, sigStart !== -1);
  if (sigStart === -1) return null;

  // Find the brace-matched extent of the function body.
  const bodyStart = src.indexOf('{', sigStart);
  let depth = 0;
  let i = bodyStart;
  do {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  } while (depth > 0 && i < src.length);

  const funcSrc = src.slice(sigStart, i);
  // Strip the small set of TS type annotations in this function.
  const cleaned = funcSrc
    .replace(/\(url: string\): void/, '(url)')
    .replace(/: URL;/g, ';');
  // eslint-disable-next-line no-new-func
  return new Function(`${cleaned}\nreturn ${name};`)();
}

const validateLamaticEndpoint = extractFunction(clientSource, 'validateLamaticEndpoint');

function expectValid(url) {
  try {
    validateLamaticEndpoint(url);
    return true;
  } catch {
    return false;
  }
}

function expectRejected(url) {
  try {
    validateLamaticEndpoint(url);
    return false;
  } catch (e) {
    return typeof e.message === 'string' && e.message.length > 0;
  }
}

test('Remote HTTPS endpoint is accepted', expectValid('https://api.lamatic.ai/graphql'));
test('Remote HTTPS with a path is accepted', expectValid('https://api.lamatic.ai/v1/graphql'));

test('Malformed URL is rejected', expectRejected('not-a-url'));
test('Remote http:// endpoint is rejected', expectRejected('http://api.lamatic.ai/graphql'));
test('Remote http:// with non-loopback hostname is rejected', expectRejected('http://evil.example.com/graphql'));
test('Unsupported protocol (ftp) is rejected', expectRejected('ftp://api.lamatic.ai/graphql'));

test('Localhost http is accepted (local development)', expectValid('http://localhost:4000/graphql'));
test('127.0.0.1 http is accepted (local development)', expectValid('http://127.0.0.1:3000/graphql'));

// Node's URL.hostname for IPv6 is "[::1]" (with brackets), which the production
// validator does not currently recognize. This only makes it MORE restrictive
// (fail-closed) — it can never let credentials reach an unvalidated host — so
// it must remain rejected, never silently accepted.
test('IPv6 loopback http is rejected (fail-closed, not a bypass)', expectRejected('http://[::1]:3000/graphql'));

test('Insecure URL rejection message is explicit', (() => {
  try {
    validateLamaticEndpoint('http://api.lamatic.ai/graphql');
  } catch (e) {
    return /[Ii]nsecure|https/i.test(e.message);
  }
  return false;
})());

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
