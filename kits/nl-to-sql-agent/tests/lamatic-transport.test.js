#!/usr/bin/env node
/**
 * Lamatic Authorization Transport Safety Tests
 *
 * Verifies the security property that a Lamatic API credential (the
 * Authorization Bearer key) can never be transmitted to an untrusted or
 * insecure endpoint - including plain-HTTP loopback.
 *
 * Production behavior (apps/lib/lamatic-client.ts):
 *   - validateLamaticEndpoint() requires the https: protocol and rejects every
 *     plain-HTTP endpoint (remote AND localhost/loopback).
 *   - LAMATIC_API_URL is defined as the return value of that validation, so the
 *     module's only fetch target is the validated https:// endpoint and the
 *     Authorization header is never attached to an HTTP URL.
 *   - There is exactly ONE fetch() path (executeLamaticFlow), and it always
 *     uses the validated LAMATIC_API_URL constant.
 *
 * This suite executes the REAL production validateLamaticEndpoint function
 * (extracted from source) and asserts the static ordering / single-fetch /
 * no-key-logging properties directly on the production file.
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

console.log('🧪 Running Lamatic Authorization Transport Safety Tests...\n');

const clientSource = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'lib', 'lamatic-client.ts'),
  'utf8'
);

// ============================================================================
// STATIC CONTRACT: the fetch target is the validated HTTPS endpoint
// ============================================================================

test(
  'LAMATIC_API_URL is the return value of endpoint validation (no raw env URL)',
  /\nconst LAMATIC_API_URL = validateLamaticEndpoint\(process\.env\.LAMATIC_API_URL\);/.test(clientSource)
);

test(
  'Only the https: protocol is accepted by validation',
  /parsed\.protocol !== "https:"\)\s*\{/.test(clientSource)
);

// Count the actual header attachment (the key with a colon), not bare word
// mentions that appear in documentation comments.
const authHeaderCount = (clientSource.match(/["']Authorization["']\s*:/g) || []).length;
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
  'The fetch uses the validated LAMATIC_API_URL constant',
  /fetch\(LAMATIC_API_URL,/.test(clientSource)
);

test(
  'The Authorization header is attached only inside the fetch call',
  /headers:\s*\{[\s\S]*?["']Authorization["']:\s*`Bearer \$\{LAMATIC_API_KEY\}`/.test(clientSource)
);

test(
  'No alternate URL branch constructs a request outside executeLamaticFlow',
  fetchCount === 1
);

// No raw API key may ever be logged or otherwise emitted.
test(
  'No API key is logged or written to console',
  !/console\.(log|error|warn|info)\([^)]*LAMATIC_API_KEY/.test(clientSource) &&
    !/console\.(log|error|warn|info)\([^)]*Authorization/.test(clientSource)
);

// ============================================================================
// BEHAVIORAL: execute the real production endpoint validator
// ============================================================================

function extractFunction(src, name) {
  const sigRegex = new RegExp(`function ${name}\\(url: string\\): string \\{`);
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
    .replace(/\(url: string\): string/, '(url)')
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
test('Validated HTTPS URL is returned unchanged', (() => {
  const result = validateLamaticEndpoint('https://api.lamatic.ai/graphql');
  return result === 'https://api.lamatic.ai/graphql';
})());

test('Malformed URL is rejected', expectRejected('not-a-url'));
test('Remote http:// endpoint is rejected', expectRejected('http://api.lamatic.ai/graphql'));
test('Remote http:// with non-loopback hostname is rejected', expectRejected('http://evil.example.com/graphql'));
test('Unsupported protocol (ftp) is rejected', expectRejected('ftp://api.lamatic.ai/graphql'));

// The Lamatic API key must never be sent in cleartext, even to loopback.
test('Localhost http is rejected (credentials must not traverse HTTP)', expectRejected('http://localhost:4000/graphql'));
test('127.0.0.1 http is rejected (credentials must not traverse HTTP)', expectRejected('http://127.0.0.1:3000/graphql'));
test('IPv6 loopback http is rejected (fail-closed, not a bypass)', expectRejected('http://[::1]:3000/graphql'));

test('Insecure URL rejection message is explicit', (() => {
  try {
    validateLamaticEndpoint('http://localhost:4000/graphql');
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
