/**
 * Response Aggregation Script
 *
 * Aggregates the flow execution results into a structured response.
 * Includes handling for query limit warnings when TOP values were normalized.
 *
 * Inputs: Results from various flow nodes
 * Output: Structured response object with SQL, explanation, results, warnings, etc.
 */

function aggregateResponse() {
  // Extract outputs from previous nodes
  const sqlResults = mssqlNode_execute?.output || [];
  const explanation = LLMNode_explain?.output?.generatedResponse || '';
  const validationOutput = codeNode_validate?.output || {};
  const originalSql = validationOutput.originalSql || '';
  const safeSql = validationOutput.safeSql || '';
  const isSafe = validationOutput.isSafe || false;
  const limitCapped = validationOutput.limitCapped || false;
  const error = validationOutput.error || '';

  // Unsafe path: the query was rejected, so the MSSQL execution node and the
  // explanation node never ran. Return a structured blocked response using the
  // validator's message. No results, no executable SQL, and no post-execution
  // warnings (which only make sense for safe queries that ran).
  if (!isSafe) {
    return {
      sql: '',
      originalSql: originalSql,
      explanation: '',
      isSafe: 'false',
      results: [],
      rowCount: 0,
      error: error || 'The query was blocked because it was not a safe, read-only SQL query.',
      warnings: [],
      limitCapped: false,
    };
  }

  // Parse results
  let results = [];
  let rowCount = 0;

  if (Array.isArray(sqlResults)) {
    results = sqlResults;
    rowCount = results.length;
  }

  // Build warnings array
  const warnings = [];

  // Add warning if limit was capped
  if (limitCapped && isSafe) {
    warnings.push(
      'Queryline limited the result set to 1000 rows for safety and performance.'
    );
  }

  // Add warning if no results were returned
  if (isSafe && results.length === 0) {
    warnings.push(
      'The query executed successfully but returned no results.'
    );
  }

  // Return aggregated response
  return {
    sql: safeSql,
    originalSql: originalSql,
    explanation: explanation,
    isSafe: isSafe ? 'true' : 'false',
    results: results,
    rowCount: rowCount,
    error: error,
    warnings: warnings,
    limitCapped: limitCapped,
  };
}

// Execute aggregation
aggregateResponse();
