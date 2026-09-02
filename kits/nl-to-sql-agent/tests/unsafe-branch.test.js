#!/usr/bin/env node
/**
 * Unsafe Branch Response Tests (Batch C, Issue #8)
 *
 * Validates that when the generated SQL is rejected as unsafe, the flow:
 *   1. Never routes the unsafe validation result to the MSSQL execution node.
 *   2. Routes the unsafe result through the aggregation node to produce a
 *      structured blocked response.
 *
 * Two layers are asserted:
 *   A. The actual flow graph (flows/nl-to-sql-flow.ts) is inspected so a
 *      future change cannot silently delete the unsafe edge or reintroduce a
 *      path from the unsafe condition to the MySQL/MSSQL execution node.
 *   B. The aggregation fallback logic (mirroring
 *      scripts/nl-to-sql-agent_aggregation-node.ts) produces the documented
 *      blocked response contract when execution/explanation outputs are absent.
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

console.log('🧪 Running Unsafe Branch Response Tests...\n');

// ============================================================================
// A. FLOW GRAPH CONTRACT
// ============================================================================

const flowSource = fs.readFileSync(
  path.join(__dirname, '..', 'flows', 'nl-to-sql-flow.ts'),
  'utf8'
);

// Extract the edges array literal so we can assert on real graph structure.
const extractEdges = (src) => {
  const start = src.indexOf('export const edges = [');
  const end = src.indexOf('];', start);
  const literal = src.slice(start + 'export const edges = ['.length, end);
  // The file uses JSON-style object literals, so we can require it by wrapping.
  // eslint-disable-next-line no-new-func
  return new Function(`return [${literal}];`)();
};

let edges = [];
try {
  edges = extractEdges(flowSource);
} catch (e) {
  test('Flow edges array is parseable', false, e.message);
  // Cannot proceed with graph assertions.
  console.log(`\n${'='.repeat(60)}\n`);
  console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

const conditionEdges = edges.filter(
  (e) => e.source === 'conditionNode_safe' && e.type === 'conditionEdge'
);

const findConditionTarget = (conditionLabel) => {
  const edge = conditionEdges.find((e) => e.data && e.data.condition === conditionLabel);
  return edge ? edge.target : null;
};

test(
  'Flow declares both Safe and Unsafe conditions',
  /"label": "Safe"/.test(flowSource) && /"label": "Unsafe"/.test(flowSource)
);

test(
  'Safe condition edge routes to MSSQL execution node',
  findConditionTarget('Safe') === 'mssqlNode_execute'
);

test(
  'Unsafe condition edge routes to the aggregation node',
  findConditionTarget('Unsafe') === 'codeNode_aggregate'
);

test(
  'Unsafe condition does NOT route to the MSSQL execution node',
  conditionEdges.every(
    (e) => !(e.data && e.data.condition === 'Unsafe' && e.target === 'mssqlNode_execute')
  )
);

test(
  'Aggregation node still routes to the API response node',
  edges.some(
    (e) => e.source === 'codeNode_aggregate' && e.target === 'graphqlResponseNode_1'
  )
);

// ============================================================================
// B. AGGREGATION FALLBACK CONTRACT (mirrors scripts/..._aggregation-node.ts)
// ============================================================================

/**
 * Mirrors the unsafe-path branch of scripts/nl-to-sql-agent_aggregation-node.ts:
 * accepts validation output and returns the exact blocked response shape.
 */
function aggregateUnsafe(validationOutput) {
  const originalSql = validationOutput.originalSql || '';
  const error = validationOutput.error || '';
  if (!validationOutput.isSafe) {
    return {
      sql: '',
      originalSql: originalSql,
      explanation: '',
      isSafe: 'false',
      results: [],
      rowCount: 0,
      error:
        error ||
        'The query was blocked because it was not a safe, read-only SQL query.',
      warnings: [],
      limitCapped: false,
    };
  }
  return null;
}

// Mirror of the relevant validator rejections (SELECT-only, write/DDL, SELECT INTO).
const UNSAFE_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
  'TRUNCATE', 'MERGE', 'CALL', 'EXEC', 'EXECUTE',
];

function stripQuotedStringsAndComments(sql) {
  return sql
    .replace(/'(?:[^']|'')*'/g, '')
    .replace(/"(?:[^"]|"")*"/g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function validateUnsafe(sql) {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { isSafe: false, error: 'SQL query cannot be empty.', safeSql: '', limitCapped: false, originalSql: sql };
  }
  const kw = new RegExp(`\\b(${UNSAFE_KEYWORDS.join('|')})\\b`, 'i');
  if (kw.test(trimmed)) {
    return { isSafe: false, error: 'SQL contains write or DDL operations. Only read-only SELECT queries are allowed.', safeSql: '', limitCapped: false, originalSql: sql };
  }
  if (!/^\s*SELECT\b/i.test(trimmed)) {
    return { isSafe: false, error: 'SQL must start with SELECT. Only read-only queries are allowed.', safeSql: '', limitCapped: false, originalSql: sql };
  }
  const stripped = stripQuotedStringsAndComments(trimmed);
  if (/\bSELECT\b[\s\S]*?\bINTO\b/i.test(stripped)) {
    return { isSafe: false, error: 'SQL contains SELECT INTO, which creates or populates a table. Only read-only SELECT queries are allowed.', safeSql: '', limitCapped: false, originalSql: sql };
  }
  const withoutTrailing = trimmed.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return { isSafe: false, error: 'Multiple SQL statements are not allowed. Only a single SELECT is permitted.', safeSql: '', limitCapped: false, originalSql: sql };
  }
  return { isSafe: true, safeSql: sql, error: '', limitCapped: false, originalSql: sql };
}

const blockedCases = [
  { name: 'DELETE statement', input: 'DELETE FROM Customers;' },
  { name: 'SELECT INTO statement', input: 'SELECT * INTO BackupCustomers FROM Customers;' },
  { name: 'UPDATE statement', input: 'UPDATE Customers SET Status = "Inactive";' },
  { name: 'Multi-statement input', input: 'SELECT * FROM Customers; SELECT * FROM Orders' },
];

blockedCases.forEach(({ name, input }) => {
  const validation = validateUnsafe(input);
  const aggregated = aggregateUnsafe(validation);

  test(`${name} is rejected`, validation.isSafe === false);
  test(`${name} blocked response has no executable SQL`, aggregated && aggregated.sql === '');
  test(`${name} blocked response marks isSafe=false`, aggregated && aggregated.isSafe === 'false');
  test(`${name} blocked response has empty results and zero row count`, aggregated && aggregated.results.length === 0 && aggregated.rowCount === 0);
  test(`${name} blocked response carries a safe error message`, aggregated && typeof aggregated.error === 'string' && aggregated.error.length > 0 && !/stack|throw|at \//i.test(aggregated.error));
});

// ============================================================================
// SAFE PATH REGRESSION (aggregation must still be reachable from execution)
// ============================================================================

test(
  'Safe path still connects execution -> explanation -> aggregation',
  edges.some((e) => e.source === 'mssqlNode_execute' && e.target === 'LLMNode_explain') &&
    edges.some((e) => e.source === 'LLMNode_explain' && e.target === 'codeNode_aggregate')
);

// ============================================================================
// SUMMARY
// ============================================================================

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
