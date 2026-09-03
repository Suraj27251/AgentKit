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
 * Scan the SQL and locate a TOP clause that belongs to the OUTER executable
 * SELECT. A TOP inside a nested query (scalar subquery, derived table, CTE
 * body) or inside a string literal or comment does NOT satisfy the row-limit
 * requirement for the outer query, so it must not be treated as an existing
 * TOP.
 *
 * Parenthesis depth is tracked while skipping string literals, quoted
 * identifiers, and comments (so their parens/keywords are ignored). Only a TOP
 * encountered at depth 0 is returned.
 *
 * @returns { value, clauseStart, clauseEnd } where `value` is the outer TOP's
 *          numeric value and `clauseStart`/`clauseEnd` span the whole TOP
 *          clause (keyword through optional parenthesized value) so it can be
 *          replaced when capped. Returns null when the outer query has no TOP.
 */
function findOuterTop(sql: string): { value: number; clauseStart: number; clauseEnd: number } | null {
  let depth = 0;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    // Skip single-quoted string literals with '' escaping.
    if (ch === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Skip double-quoted strings/identifiers with "" escaping.
    if (ch === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Skip line comments (-- to end of line).
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }

    // Skip block comments (/* ... */).
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Track parenthesis depth.
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { if (depth > 0) depth--; i++; continue; }

    // Only consider TOP at the outer depth.
    if (
      depth === 0 &&
      i + 3 <= n &&
      sql.slice(i, i + 3).toUpperCase() === 'TOP' &&
      (i === 0 || !/[a-zA-Z0-9_]/.test(sql[i - 1])) &&
      (i + 3 >= n || !/[a-zA-Z0-9_]/.test(sql[i + 3]))
    ) {
      const clauseStart = i;
      let j = i + 3;
      while (j < n && /\s/.test(sql[j])) j++;
      let hasParens = false;
      if (j < n && sql[j] === '(') {
        hasParens = true;
        j++;
        while (j < n && /\s/.test(sql[j])) j++;
      }
      const numStart = j;
      while (j < n && /\d/.test(sql[j])) j++;
      const numStr = sql.slice(numStart, j);
      if (numStr.length === 0) return null;
      let clauseEnd = j;
      if (hasParens) {
        while (clauseEnd < n && /\s/.test(sql[clauseEnd])) clauseEnd++;
        if (clauseEnd < n && sql[clauseEnd] === ')') clauseEnd++;
      }
      return { value: parseInt(numStr, 10), clauseStart, clauseEnd };
    }

    i++;
  }

  return null;
}

/**
 * Normalize TOP clause to enforce maximum result limit
 * @param sql - The SQL query to normalize
 * @returns Object with normalized SQL and a flag indicating if limit was capped
 */
function normalizeTopClause(sql: string): { normalizedSql: string; limitCapped: boolean } {
  const outerTop = findOuterTop(sql);

  if (outerTop === null) {
    // No outer TOP clause found, add TOP MAX_RESULT_ROWS at the beginning of
    // the outer SELECT. Handles SELECT or SELECT DISTINCT.
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

  if (outerTop.value > MAX_RESULT_ROWS) {
    // Replace the whole outer TOP clause (keyword and optional parens) with
    // the normalized bare form, matching the previous `TOP 1000` output.
    const normalizedSql =
      sql.slice(0, outerTop.clauseStart) + `TOP ${MAX_RESULT_ROWS}` + sql.slice(outerTop.clauseEnd);
    return {
      normalizedSql,
      limitCapped: true,
    };
  }

  // Outer TOP is within limits, no change needed.
  return {
    normalizedSql: sql,
    limitCapped: false,
  };
}

/**
 * Remove quoted string literals and comments so keyword checks do not match
 * text that lives inside data values or comments.
 *
 * Stripped text is replaced with a single space (not an empty string) so that
 * two surrounding SQL tokens cannot be concatenated into one. For example,
 * `SELECT CustomerId blockComment INTO Audit` must not collapse `CustomerId`
 * and `INTO` into one token, which would otherwise evade the SELECT INTO
 * check. Whitespace replacement is always safe: it can never forge a keyword.
 */
function stripQuotedStringsAndComments(sql: string): string {
  return sql
    // Remove single- and double-quoted string literals (including '' / "" escapes)
    .replace(/'(?:[^']|'')*'/g, ' ')
    .replace(/"(?:[^"]|"")*"/g, ' ')
    // Remove single-line and block comments, preserving token boundaries
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
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

  // Strip literals and comments first (replacing with whitespace to preserve
  // token boundaries) so that keywords appearing only inside string values or
  // comments are never treated as operations, while real write/DDL keywords
  // outside literals/comments are still caught below.
  const stripped = stripQuotedStringsAndComments(trimmedSql);

  // Check for unsafe keywords FIRST (before SELECT check) so we catch write/DDL operations
  // Use word boundaries to avoid matching partial words
  const unsafeKeywordPattern = new RegExp(
    `\\b(${UNSAFE_KEYWORDS.join('|')})\\b`,
    'i'
  );

  if (unsafeKeywordPattern.test(stripped)) {
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
