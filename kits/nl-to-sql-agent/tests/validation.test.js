#!/usr/bin/env node
/**
 * SQL Validation and Normalization Tests
 *
 * Tests for the validateAndNormalizeSql function to ensure:
 * 1. Queries without TOP receive TOP 1000
 * 2. Queries with safe TOP (<=1000) remain unchanged
 * 3. Queries with TOP >1000 are normalized to TOP 1000
 * 4. Unsafe SQL is properly rejected
 * 5. Multiple statements are rejected
 * 6. Write/DDL operations are rejected
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
  // Pattern to match TOP clause with optional parentheses and number
  // Note: We don't use \b at the end because ) is not a word character,
  // making word boundary detection unreliable after the closing paren
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
 * Validate that SQL is safe
 */
function validateSqlSafety(sql) {
  const trimmedSql = sql.trim();

  if (!trimmedSql) {
    return { isSafe: false, error: 'SQL query cannot be empty.' };
  }

  // Check for unsafe keywords FIRST (before SELECT check) so we catch write/DDL operations
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
// TEST CASES
// ============================================================================

const testCases = [
  // Case A: No TOP clause
  {
    name: 'No TOP clause',
    input: 'SELECT * FROM Customers',
    expectedSql: 'SELECT TOP 1000 * FROM Customers',
    expectedSafe: true,
    expectedCapped: false,
  },
  // Case B: Safe TOP (below maximum)
  {
    name: 'Safe TOP (100)',
    input: 'SELECT TOP 100 * FROM Customers',
    expectedSql: 'SELECT TOP 100 * FROM Customers',
    expectedSafe: true,
    expectedCapped: false,
  },
  // Case C: TOP equals maximum
  {
    name: 'TOP equals maximum (1000)',
    input: 'SELECT TOP 1000 * FROM Customers',
    expectedSql: 'SELECT TOP 1000 * FROM Customers',
    expectedSafe: true,
    expectedCapped: false,
  },
  // Case D: Oversized TOP
  {
    name: 'Oversized TOP (5000)',
    input: 'SELECT TOP 5000 * FROM Customers',
    expectedSql: 'SELECT TOP 1000 * FROM Customers',
    expectedSafe: true,
    expectedCapped: true,
  },
  // Case E: Very large TOP
  {
    name: 'Very large TOP (999999)',
    input: 'SELECT TOP 999999 * FROM Customers',
    expectedSql: 'SELECT TOP 1000 * FROM Customers',
    expectedSafe: true,
    expectedCapped: true,
  },
  // Case F: SELECT DISTINCT no TOP
  {
    name: 'SELECT DISTINCT without TOP',
    input: 'SELECT DISTINCT Name FROM Customers',
    expectedSql: 'SELECT DISTINCT TOP 1000 Name FROM Customers',
    expectedSafe: true,
    expectedCapped: false,
  },
  // Case G: Complex query with columns and WHERE
  {
    name: 'Complex query with WHERE',
    input: 'SELECT TOP 5000 CustomerId, Name FROM Customers WHERE Status = "Active"',
    expectedSql: 'SELECT TOP 1000 CustomerId, Name FROM Customers WHERE Status = "Active"',
    expectedSafe: true,
    expectedCapped: true,
  },
  // Case H: TOP with parentheses
  {
    name: 'TOP with parentheses',
    input: 'SELECT TOP (2000) * FROM Customers',
    expectedSql: 'SELECT TOP 1000 * FROM Customers',
    expectedSafe: true,
    expectedCapped: true,
  },

  // Unsafe cases
  {
    name: 'DELETE statement',
    input: 'DELETE FROM Customers',
    expectedSafe: false,
    expectedErrorPattern: /write or DDL/i,
  },
  {
    name: 'UPDATE statement',
    input: 'UPDATE Customers SET Status = "Inactive"',
    expectedSafe: false,
    expectedErrorPattern: /write or DDL/i,
  },
  {
    name: 'DROP statement',
    input: 'DROP TABLE Customers',
    expectedSafe: false,
    expectedErrorPattern: /write or DDL/i,
  },
  {
    name: 'Multiple SELECT statements',
    input: 'SELECT * FROM Customers; SELECT * FROM Orders',
    expectedSafe: false,
    expectedErrorPattern: /Multiple SQL statements/i,
  },
  {
    name: 'INSERT statement',
    input: 'INSERT INTO Customers VALUES (1, "John")',
    expectedSafe: false,
    expectedErrorPattern: /write or DDL/i,
  },
  {
    name: 'ALTER statement',
    input: 'ALTER TABLE Customers ADD COLUMN NewField INT',
    expectedSafe: false,
    expectedErrorPattern: /write or DDL/i,
  },
  {
    name: 'CREATE statement',
    input: 'CREATE TABLE Customers (id INT, name NVARCHAR(100))',
    expectedSafe: false,
    expectedErrorPattern: /write or DDL/i,
  },
  {
    name: 'Empty SQL',
    input: '',
    expectedSafe: false,
    expectedErrorPattern: /empty/i,
  },
];

// ============================================================================
// RUN TESTS
// ============================================================================

let passedTests = 0;
let failedTests = 0;

console.log('🧪 Running SQL Validation and Normalization Tests...\n');

testCases.forEach((testCase, index) => {
  const result = validateAndNormalizeSql(testCase.input);

  let passed = true;
  let failureReason = '';

  // Check if test is safe or unsafe
  if (testCase.expectedErrorPattern) {
    // Unsafe SQL test
    if (result.isSafe !== false) {
      passed = false;
      failureReason = 'Expected unsafe SQL but got safe result';
    } else if (!testCase.expectedErrorPattern.test(result.error)) {
      passed = false;
      failureReason = `Error message mismatch. Expected pattern: ${testCase.expectedErrorPattern}, Got: "${result.error}"`;
    }
  } else {
    // Safe SQL test
    if (result.isSafe !== testCase.expectedSafe) {
      passed = false;
      failureReason = `Expected isSafe=${testCase.expectedSafe}, got ${result.isSafe}`;
    }

    if (result.safeSql !== testCase.expectedSql) {
      passed = false;
      failureReason = `SQL mismatch.\nExpected: ${testCase.expectedSql}\nGot:      ${result.safeSql}`;
    }

    if (result.limitCapped !== testCase.expectedCapped) {
      passed = false;
      failureReason = `Expected limitCapped=${testCase.expectedCapped}, got ${result.limitCapped}`;
    }
  }

  if (passed) {
    passedTests++;
    console.log(`✅ PASS: ${testCase.name}`);
  } else {
    failedTests++;
    console.log(`❌ FAIL: ${testCase.name}`);
    console.log(`   Reason: ${failureReason}\n`);
  }
});

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log(`📊 Test Summary:`);
console.log(`   ✅ Passed: ${passedTests}/${testCases.length}`);
console.log(`   ❌ Failed: ${failedTests}/${testCases.length}`);
console.log(`${'='.repeat(60)}`);

if (failedTests === 0) {
  console.log('🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed.');
  process.exit(1);
}
