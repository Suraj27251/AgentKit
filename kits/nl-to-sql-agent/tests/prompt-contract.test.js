#!/usr/bin/env node
/**
 * SQL Generation Output Contract Tests
 *
 * Verifies that the SQL-generation prompts enforce a single, unambiguous
 * SQL-only output contract:
 * 1. The prompts no longer instruct the model to emit an `intent` field.
 * 2. The prompts require exactly one executable SQL query and no other text.
 * 3. The prompts forbid explanations, assumptions, JSON, Markdown, comments,
 *    and code fences in the output.
 * 4. Representative generated SQL (ambiguous and clear requests) still passes
 *    the validation pipeline and TOP 1000 normalization.
 * 5. Non-SQL artifacts (intent prefixes, Markdown fences, JSON) are rejected
 *    by the SQL validator, which is why the prompt must be SQL-only.
 */

// Test configuration
const MAX_RESULT_ROWS = 1000;

// Unsafe keywords that indicate write or DDL operations
const UNSAFE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'MERGE',
  'CALL',
  'EXEC',
  'EXECUTE',
];

/**
 * Normalize TOP clause to enforce maximum result limit
 */
function normalizeTopClause(sql) {
  const topPattern = /\bTOP\s+(\()?(\d+)(\))?(?=\s|$)/i;
  const match = sql.match(topPattern);

  if (!match) {
    const selectDistinctPattern = /^(\s*SELECT\s+DISTINCT\s+)/i;
    const selectPattern = /^(\s*SELECT\s+)/i;

    let normalizedSql;
    if (selectDistinctPattern.test(sql)) {
      normalizedSql = sql.replace(selectDistinctPattern, `$1TOP ${MAX_RESULT_ROWS} `);
    } else {
      normalizedSql = sql.replace(selectPattern, `$1TOP ${MAX_RESULT_ROWS} `);
    }

    return { normalizedSql, limitCapped: false };
  }

  const topValue = parseInt(match[2], 10);
  if (topValue > MAX_RESULT_ROWS) {
    const normalizedSql = sql.replace(topPattern, `TOP ${MAX_RESULT_ROWS}`);
    return { normalizedSql, limitCapped: true };
  }

  return { normalizedSql: sql, limitCapped: false };
}

/**
 * Validate that SQL is safe (mirrors scripts/nl-to-sql-agent_validation-node.ts)
 */
function validateSqlSafety(sql) {
  const trimmedSql = sql.trim();

  if (!trimmedSql) {
    return { isSafe: false, error: 'SQL query cannot be empty.' };
  }

  const unsafeKeywordPattern = new RegExp(
    `\\b(${UNSAFE_KEYWORDS.join('|')})\\b`,
    'i'
  );

  if (unsafeKeywordPattern.test(trimmedSql)) {
    return {
      isSafe: false,
      error: 'SQL contains write or DDL operations. Only read-only SELECT queries are allowed.',
    };
  }

  if (!/^\s*SELECT\b/i.test(trimmedSql)) {
    return {
      isSafe: false,
      error: 'SQL must start with SELECT. Only read-only queries are allowed.',
    };
  }

  const sqlWithoutTrailingSemicolon = trimmedSql.replace(/;\s*$/, '');
  if (sqlWithoutTrailingSemicolon.includes(';')) {
    return {
      isSafe: false,
      error: 'Multiple SQL statements are not allowed. Only a single SELECT is permitted.',
    };
  }

  return { isSafe: true, error: '' };
}

/**
 * Main validation function
 */
function validateAndNormalizeSql(generatedSql) {
  const originalSql = generatedSql;
  const safetyCheck = validateSqlSafety(originalSql);

  if (!safetyCheck.isSafe) {
    return {
      safeSql: '',
      isSafe: false,
      error: safetyCheck.error,
      limitCapped: false,
      originalSql,
    };
  }

  const { normalizedSql, limitCapped } = normalizeTopClause(originalSql);

  return {
    safeSql: normalizedSql,
    isSafe: true,
    error: '',
    limitCapped,
    originalSql,
  };
}

// ============================================================================
// PROMPT CONTRACT CHECKS
// ============================================================================

const fs = require('fs');
const path = require('path');

const promptsDir = path.join(__dirname, '..', 'prompts');
const systemPrompt = fs.readFileSync(
  path.join(promptsDir, 'nl-to-sql-agent_intent-node_system.md'),
  'utf8'
);
const userPrompt = fs.readFileSync(
  path.join(promptsDir, 'nl-to-sql-agent_intent-node_user.md'),
  'utf8'
);
const combinedPrompt = `${systemPrompt}\n${userPrompt}`;

const promptChecks = [
  {
    name: 'System prompt no longer instructs emitting an intent field',
    check: () => !/note .*intent\s*field/i.test(systemPrompt)
      && !/make reasonable assumptions and note/i.test(systemPrompt),
  },
  {
    name: 'System prompt explicitly forbids intent fields in output',
    check: () => /do not include .*intent\s*fields/i.test(systemPrompt),
  },
  {
    name: 'System prompt requires SQL-only output',
    check: () => /output only the executable sql query/i.test(systemPrompt),
  },
  {
    name: 'System prompt forbids explanations, assumptions, JSON and Markdown',
    check: () => /do not include .*explanations.*assumptions.*json.*markdown.*code fences/i.test(systemPrompt),
  },
  {
    name: 'User prompt requires raw executable SQL only',
    check: () => /output only the raw executable sql query/i.test(userPrompt),
  },
  {
    name: 'User prompt forbids intent fields, assumptions and code fences',
    check: () => /do not include an intent field, assumptions, explanations, json, markdown code fences/i.test(userPrompt),
  },
  {
    name: 'Combined prompt contains no JSON-output instruction',
    check: () => !/\boutput\b[^\n]*\{/i.test(combinedPrompt),
  },
];

// ============================================================================
// EXPLANATION PROMPT MUST REMAIN INTACT
// ============================================================================

const explanationPrompt = fs.readFileSync(
  path.join(promptsDir, 'nl-to-sql-agent_explanation-node_system.md'),
  'utf8'
);

const explanationCheck = {
  name: 'Explanation prompt still documents the user-facing intent focus',
  check: () => /focus on the intent/i.test(explanationPrompt),
};

// ============================================================================
// REPRESENTATIVE VALIDATION CASES
// ============================================================================

const validationCases = [
  // Ambiguous but interpretable request - the model may interpret internally
  {
    name: 'Ambiguous request (recent customers) yields acceptable SQL',
    input: 'SELECT TOP 1000 * FROM Customers WHERE CreatedAt >= DATEADD(DAY, -30, GETDATE()) ORDER BY CreatedAt DESC',
    expectedSafe: true,
    expectedSql: 'SELECT TOP 1000 * FROM Customers WHERE CreatedAt >= DATEADD(DAY, -30, GETDATE()) ORDER BY CreatedAt DESC',
  },
  // Clear request
  {
    name: 'Clear request (top 10 by revenue) yields acceptable SQL',
    input: 'SELECT TOP 10 CustomerId, SUM(TotalAmount) AS TotalSales FROM Orders GROUP BY CustomerId ORDER BY TotalSales DESC',
    expectedSafe: true,
    expectedSql: 'SELECT TOP 10 CustomerId, SUM(TotalAmount) AS TotalSales FROM Orders GROUP BY CustomerId ORDER BY TotalSales DESC',
  },
  // No TOP clause receives TOP 1000 normalization
  {
    name: 'No TOP clause is normalized to TOP 1000',
    input: 'SELECT * FROM Customers WHERE CreatedAt >= DATEADD(DAY, -30, GETDATE())',
    expectedSafe: true,
    expectedSql: 'SELECT TOP 1000 * FROM Customers WHERE CreatedAt >= DATEADD(DAY, -30, GETDATE())',
  },
  // Non-SQL artifacts that the prompt forbids are rejected by the validator
  {
    name: 'intent-prefixed output is rejected by SQL validation',
    input: 'intent: Assuming "recent" means the last 30 days.\n\nSELECT * FROM Customers WHERE CreatedAt >= DATEADD(DAY, -30, GETDATE())',
    expectedSafe: false,
  },
  {
    name: 'Markdown-fenced SQL is rejected by SQL validation',
    input: '```sql\nSELECT * FROM Customers\n```',
    expectedSafe: false,
  },
  {
    name: 'JSON output is rejected by SQL validation',
    input: '{"intent": "Find recent customers", "sql": "SELECT * FROM Customers"}',
    expectedSafe: false,
  },
  {
    name: 'Write operations remain rejected',
    input: 'UPDATE Customers SET Status = "Inactive"',
    expectedSafe: false,
  },
];

// ============================================================================
// RUN TESTS
// ============================================================================

let passedTests = 0;
let failedTests = 0;
const allChecks = [
  ...promptChecks,
  explanationCheck,
];

console.log('Running SQL Generation Output Contract Tests...\n');

allChecks.forEach((testCase) => {
  let passed = true;
  let failureReason = '';

  try {
    passed = testCase.check() === true;
  } catch (error) {
    passed = false;
    failureReason = error.message;
  }

  if (!passed && !failureReason) {
    failureReason = 'Contract assertion returned false';
  }

  if (passed) {
    passedTests++;
    console.log(`PASS: ${testCase.name}`);
  } else {
    failedTests++;
    console.log(`FAIL: ${testCase.name}`);
    console.log(`   Reason: ${failureReason}\n`);
  }
});

console.log('');

validationCases.forEach((testCase) => {
  const result = validateAndNormalizeSql(testCase.input);

  let passed = true;
  let failureReason = '';

  if (testCase.expectedSafe !== result.isSafe) {
    passed = false;
    failureReason = `Expected isSafe=${testCase.expectedSafe}, got ${result.isSafe}`;
  }

  if (passed && testCase.expectedSql !== undefined && result.safeSql !== testCase.expectedSql) {
    passed = false;
    failureReason = `SQL mismatch.\nExpected: ${testCase.expectedSql}\nGot:      ${result.safeSql}`;
  }

  if (passed) {
    passedTests++;
    console.log(`PASS: ${testCase.name}`);
  } else {
    failedTests++;
    console.log(`FAIL: ${testCase.name}`);
    if (failureReason) {
      console.log(`   Reason: ${failureReason}\n`);
    }
  }
});

// Summary
const totalTests = allChecks.length + validationCases.length;
console.log('\n' + '='.repeat(60));
console.log('Test Summary:');
console.log(`   Passed: ${passedTests}/${totalTests}`);
console.log(`   Failed: ${failedTests}/${totalTests}`);
console.log('='.repeat(60));

if (failedTests === 0) {
  console.log('All tests passed!');
  process.exit(0);
} else {
  console.log('Some tests failed.');
  process.exit(1);
}