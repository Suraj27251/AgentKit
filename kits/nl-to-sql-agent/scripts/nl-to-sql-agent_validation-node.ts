/**
 * SQL Validation and Normalization Script
 *
 * Validates that generated SQL is safe (read-only) and normalizes result limits.
 * - Ensures SQL is a single SELECT statement
 * - Blocks write operations (INSERT, UPDATE, DELETE, etc.)
 * - Blocks DDL operations (CREATE, ALTER, DROP, etc.)
 * - Blocks SELECT ... INTO (table creation, not read-only)
 * - Blocks TOP ... PERCENT (can return the whole table, bypassing row limit)
 * - Blocks TOP ... WITH TIES (can return > MAX_RESULT_ROWS rows)
 * - Enforces maximum result limit of 1000 rows by normalizing TOP clauses
 *
 * Input: LLMNode_sql_gen.output.generatedResponse (generated SQL)
 * Output:
 *   - safeSql: The validated and normalized SQL ready for execution
 *   - isSafe: Boolean indicating if SQL passed all safety checks
 *   - error: Error message if validation failed
 *   - limitCapped: Boolean indicating if TOP value was capped to MAX_RESULT_ROWS
 *   - originalSql: The SQL before normalization (for transparency)
 */

// Configuration
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
 * @param sql - The SQL query to normalize
 * @returns Object with normalized SQL and a flag indicating if limit was capped
 */
function normalizeTopClause(sql: string): { normalizedSql: string; limitCapped: boolean } {
  // Pattern to match TOP clause with optional parentheses and number
  // Matches: TOP 100, TOP (100), TOP 1000, etc.
  // Note: We don't use \b at the end because ) is not a word character,
  // making word boundary detection unreliable after the closing paren
  const topPattern = /\bTOP\s+(\()?(\d+)(\))?(?=\s|$)/i;
  const match = sql.match(topPattern);

  if (!match) {
    // No TOP clause found, add TOP MAX_RESULT_ROWS at the beginning of SELECT
    // Insert after SELECT or SELECT DISTINCT
    const selectDistinctPattern = /^(\s*SELECT\s+DISTINCT\s+)/i;
    const selectPattern = /^(\s*SELECT\s+)/i;

    let normalizedSql: string;
    if (selectDistinctPattern.test(sql)) {
      normalizedSql = sql.replace(selectDistinctPattern, `$1TOP ${MAX_RESULT_ROWS} `);
    } else {
      normalizedSql = sql.replace(selectPattern, `$1TOP ${MAX_RESULT_ROWS} `);
    }

    return {
      normalizedSql,
      limitCapped: false,
    };
  }

  // TOP clause exists, check if it exceeds the maximum
  const topValue = parseInt(match[2], 10);

  if (topValue > MAX_RESULT_ROWS) {
    // Replace the entire TOP clause (including optional parentheses) with normalized value
    const normalizedSql = sql.replace(topPattern, `TOP ${MAX_RESULT_ROWS}`);
    return {
      normalizedSql,
      limitCapped: true,
    };
  }

  // TOP clause is within limits, no change needed
  return {
    normalizedSql: sql,
    limitCapped: false,
  };
}

/**
 * Remove quoted string literals and comments so keyword checks do not match
 * text that lives inside data values or comments.
 */
function stripQuotedStringsAndComments(sql: string): string {
  return sql
    // Remove single- and double-quoted string literals (including '' / "" escapes)
    .replace(/'(?:[^']|'')*'/g, '')
    .replace(/"(?:[^"]|"")*"/g, '')
    // Remove single-line and block comments
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Validate that SQL is safe (read-only, single statement)
 * @param sql - The SQL query to validate
 * @returns Object with validation result and error message if any
 */
function validateSqlSafety(sql: string): { isSafe: boolean; error: string } {
  // Trim and remove leading/trailing whitespace
  const trimmedSql = sql.trim();

  // Check if empty
  if (!trimmedSql) {
    return {
      isSafe: false,
      error: 'SQL query cannot be empty.',
    };
  }

  // Check for unsafe keywords FIRST (before SELECT check) so we catch write/DDL operations
  // Use word boundaries to avoid matching partial words
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

  // Check if starts with SELECT (case-insensitive)
  if (!/^\s*SELECT\b/i.test(trimmedSql)) {
    return {
      isSafe: false,
      error: 'SQL must start with SELECT. Only read-only queries are allowed.',
    };
  }

  // Strip literals and comments so the checks below do not match values/comment text.
  const stripped = stripQuotedStringsAndComments(trimmedSql);

  // Block SELECT ... INTO (creates/populates a table - not read-only)
  if (/\bSELECT\b[\s\S]*?\bINTO\b/i.test(stripped)) {
    return {
      isSafe: false,
      error: 'SQL contains SELECT INTO, which creates or populates a table. Only read-only SELECT queries are allowed.',
    };
  }

  // Block TOP ... PERCENT (can return the entire table, bypassing the row limit)
  if (/\bTOP\s+\(?\d+\)?\s+PERCENT\b/i.test(stripped)) {
    return {
      isSafe: false,
      error: 'TOP PERCENT is not allowed because it can bypass the maximum result limit.',
    };
  }

  // Block TOP ... WITH TIES (can return more than the maximum result limit)
  if (/\bTOP\s+\(?\d+\)?\s+WITH\s+TIES\b/i.test(stripped)) {
    return {
      isSafe: false,
      error: 'TOP WITH TIES is not allowed because it can return more than the maximum result limit.',
    };
  }

  // Check for multiple statements (semicolon separator)
  // Allow trailing semicolon but not semicolons in the middle
  const sqlWithoutTrailingSemicolon = trimmedSql.replace(/;\s*$/, '');
  if (sqlWithoutTrailingSemicolon.includes(';')) {
    return {
      isSafe: false,
      error: 'Multiple SQL statements are not allowed. Only a single SELECT is permitted.',
    };
  }

  // All checks passed
  return {
    isSafe: true,
    error: '',
  };
}

// Main validation logic
function validateAndNormalizeSql(generatedSql: string): {
  safeSql: string;
  isSafe: boolean;
  error: string;
  limitCapped: boolean;
  originalSql: string;
} {
  const originalSql = generatedSql;

  // Step 1: Validate SQL safety
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

  // Step 2: Normalize TOP clause
  const { normalizedSql, limitCapped } = normalizeTopClause(originalSql);

  return {
    safeSql: normalizedSql,
    isSafe: true,
    error: '',
    limitCapped,
    originalSql,
  };
}

// Execute validation and normalization
const result = validateAndNormalizeSql(LLMNode_sql_gen.output.generatedResponse);

// Return the result object for the flow to use
result;
