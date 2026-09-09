# CodeRabbit Issue Audit - PR #384

**Date**: September 9, 2026  
**Current Commit**: `0a1b85f8`  
**Total Actionable Comments**: 15

---

## ✅ FIXED (in commit 0a1b85f8)

### 1. agent.md:115 - Quickstart Demo Auth Requirements
- **Status**: ✅ **FIXED**
- **Issue**: Demo auth appeared optional but is required
- **Fix**: Rewrote step 2 to explicitly require all env vars with clear descriptions
- **File**: `agent.md`

### 2. orchestrate.ts:286-301 - Error Message Exposure  
- **Status**: ✅ **FIXED**
- **Issue**: Raw error.message exposed to clients
- **Fix**: Generic safe messages + full server-side logging with stack traces
- **File**: `apps/actions/orchestrate.ts`

### 3. TopNav.tsx:59-60 - Mobile Menu Aria-Label
- **Status**: ✅ **FIXED**
- **Issue**: Static aria-label didn't reflect menu state
- **Fix**: Dynamic: `{menuOpen ? "Close navigation" : "Open navigation"}`
- **File**: `apps/app/(protected)/components/TopNav.tsx`

### 4. LoginForm.tsx:16 - Password Trimming
- **Status**: ✅ **FIXED**
- **Issue**: Password validation trimmed whitespace
- **Fix**: Removed `.trim()` from password schema (kept for username)
- **File**: `apps/app/login/LoginForm.tsx`

### 5. package.json:24 - Next.js Version
- **Status**: ✅ **FIXED** 
- **Issue**: Next.js 14.2.35 has vulnerabilities
- **Fix**: Upgraded to `^15.1.6` + regenerated lockfile
- **File**: `apps/package.json`, `apps/package-lock.json`

### 6. lamatic.config.ts:14 - Deploy Env Vars
- **Status**: ✅ **FIXED**
- **Issue**: Deploy button missing SESSION_PASSWORD and demo auth
- **Fix**: Updated envDescription to list all required variables
- **File**: `lamatic.config.ts`

---

## ❌ NOT FIXED (Still Open)

### 7. demo-questions.ts:53-55 - resolveDemoRestriction Logic
- **Status**: ❌ **NOT FIXED**
- **Issue**: Should return `true` for `null`/`undefined`, only `false` for explicit `false`
- **Current Code**: `return rawIsDemo === undefined ? true : rawIsDemo;`
- **Problem**: Returns `null` when `rawIsDemo` is `null`, should return `true`
- **Fix Needed**: `return rawIsDemo === false ? false : true;`
- **File**: `apps/lib/demo-questions.ts`

### 8. lamatic-client.ts:21 - Flow Lookup Assumes steps[0]
- **Status**: ❌ **NOT FIXED**
- **Issue**: `config.steps[0]` assumes first step is the flow
- **Current Code**: `const sqlFlowEnvKey = config.steps[0].envKey;`
- **Fix Needed**: `config.steps.find(s => s.id === 'nl-to-sql-flow')?.envKey`
- **File**: `apps/lib/lamatic-client.ts`

### 9. nl-to-sql-flow.ts:27-51 - Missing Schema Input
- **Status**: ❌ **NOT FIXED**
- **Issue**: SQL generation doesn't receive database schema
- **Fix Needed**: Add schema to flow input or create schema-producing node
- **File**: `flows/nl-to-sql-flow.ts`

### 10. intent-node_system.md:3-10 - Prompt Missing Unsafe Constructs
- **Status**: ❌ **NOT FIXED**
- **Issue**: Prompt doesn't explicitly prohibit constructs the validator blocks
- **Current**: Only says "single SQL SELECT statement"
- **Fix Needed**: Add explicit list: "Do not use SELECT INTO, TOP PERCENT, TOP WITH TIES, UNION/EXCEPT/INTERSECT, OPENROWSET, OPENQUERY, OPENDATASOURCE, OPENXML"
- **File**: `prompts/nl-to-sql-agent_intent-node_system.md`

### 11. page.tsx:498-510 - Table Body Iteration
- **Status**: ❌ **NOT FIXED**
- **Issue**: Table body uses `Object.values()` instead of iterating header keys
- **Fix Needed**: Replace `Object.values(row)` with `headers.map(h => row[h])`
- **File**: `apps/app/(protected)/page.tsx`

### 12. logout/route.ts:7 - HTTP Status Code
- **Status**: ❌ **NOT FIXED**
- **Issue**: Should use 303 status for redirect (not default 302)
- **Fix Needed**: `redirect('/login', 303)`
- **File**: `apps/app/logout/route.ts`

### 13. history.ts:79-82 - Storage Key Change Write
- **Status**: ❌ **NOT FIXED**
- **Issue**: Should skip first write after storageKey changes
- **Fix Needed**: Track storageKey changes and skip persistence on first render
- **File**: `apps/lib/history.ts`

### 14. playwright.config.ts:28-29 - Credential Fallback Assignment
- **Status**: ❌ **NOT FIXED**
- **Issue**: Fallback credentials should be assigned to `process.env`
- **Fix Needed**: Assign resolved values to `process.env.DEMO_USERNAME` and `process.env.DEMO_PASSWORD`
- **File**: `apps/playwright.config.ts`

### 15. validation-node.ts:117-118 - Bracket-Quoted Identifiers
- **Status**: ✅ **ALREADY CORRECT** (but CodeRabbit may not recognize)
- **Issue**: Scanner should handle T-SQL bracket identifiers
- **Current**: ALREADY IMPLEMENTED (lines 118-129 in findOuterTop, 335-348 in hasTopLevelSetOperator)
- **File**: `scripts/nl-to-sql-agent_validation-node.ts`

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Fixed in commit 0a1b85f8 | 6 |
| ✅ Already correct (verified) | 1 |
| ❌ Still open (need fixing) | 8 |
| **Total** | **15** |

---

## Next Steps

Need to fix the remaining 8 open issues:
1. demo-questions.ts - resolveDemoRestriction null handling
2. lamatic-client.ts - flow lookup robustness
3. nl-to-sql-flow.ts - schema input
4. intent-node_system.md - explicit unsafe construct list
5. page.tsx - table body iteration order
6. logout/route.ts - HTTP 303 status
7. history.ts - skip first write after storageKey change
8. playwright.config.ts - assign fallback credentials to process.env
