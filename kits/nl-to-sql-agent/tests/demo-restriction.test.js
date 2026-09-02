#!/usr/bin/env node
/**
 * Demo Question Restriction Tests
 *
 * Verifies the server-side allowlist that restricts restricted demo sessions
 * to the approved example questions (mirrors apps/lib/demo-questions.ts):
 *
 * 1. Approved questions are accepted.
 * 2. Normalized variants (case, whitespace, trailing punctuation) are accepted.
 * 3. Unsupported / near-but-different questions are rejected.
 * 4. Normalization is an exact match, not semantic matching.
 */

const { APPROVED_DEMO_QUESTIONS } = (() => {
  return {
    APPROVED_DEMO_QUESTIONS: [
      "How many customers are active?",
      "Average data usage by plan",
      "Recent failed transactions",
    ],
  };
})();

function normalizeDemoQuestion(question) {
  return question
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!\s]+$/, "")
    .toLowerCase();
}

function isApprovedDemoQuestion(question) {
  const normalized = normalizeDemoQuestion(question);
  return APPROVED_DEMO_QUESTIONS.some(
    (approved) => normalizeDemoQuestion(approved) === normalized
  );
}

let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    passed++;
    console.log(`✅ PASS: ${name}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${name}`);
  }
}

console.log("🧪 Running Demo Question Restriction Tests...\n");

// --- Approved questions (exact) ---
test("Approved: 'How many customers are active?'", isApprovedDemoQuestion("How many customers are active?"));
test("Approved: 'Average data usage by plan'", isApprovedDemoQuestion("Average data usage by plan"));
test("Approved: 'Recent failed transactions'", isApprovedDemoQuestion("Recent failed transactions"));

// --- Normalization variants ---
test("Approved: lowercase 'how many customers are active?'", isApprovedDemoQuestion("how many customers are active?"));
test("Approved: leading/trailing whitespace", isApprovedDemoQuestion("   How many customers are active?   "));
test("Approved: repeated internal whitespace", isApprovedDemoQuestion("How  many   customers are  active?"));
test("Approved: missing terminal punctuation", isApprovedDemoQuestion("How many customers are active"));
test("Approved: mixed case + no punctuation", isApprovedDemoQuestion("  AVERAGE DATA USAGE BY PLAN"));
test("Approved: trailing newline/tab", isApprovedDemoQuestion("Recent failed transactions\t\n"));

// --- Rejected: unsupported ---
test("Rejected: 'Show me all users'", !isApprovedDemoQuestion("Show me all users"));
test("Rejected: 'What is the weather today?'", !isApprovedDemoQuestion("What is the weather today?"));
test("Rejected: 'How many customers are active today?'", !isApprovedDemoQuestion("How many customers are active today?"));
test("Rejected: 'Show me every active customer's personal information'", !isApprovedDemoQuestion("Show me every active customer's personal information"));

// --- Rejected: near-but-different (ensure exact match, not semantic) ---
test("Rejected: 'How many inactive customers are there?'", !isApprovedDemoQuestion("How many inactive customers are there?"));
test("Rejected: 'Average data usage' (missing 'by plan')", !isApprovedDemoQuestion("Average data usage"));
test("Rejected: 'data usage by plan' (missing 'average')", !isApprovedDemoQuestion("data usage by plan"));
test("Rejected: 'Recent successful transactions'", !isApprovedDemoQuestion("Recent successful transactions"));
test("Rejected: 'transactions failed recently'", !isApprovedDemoQuestion("transactions failed recently"));
test("Rejected: empty string", !isApprovedDemoQuestion(""));

console.log("\n============================================================");
console.log(`📊 Test Summary:`);
console.log(`   ✅ Passed: ${passed}/${passed + failed}`);
console.log(`   ❌ Failed: ${failed}/${passed + failed}`);
console.log("============================================================\n");

if (failed > 0) {
  process.exit(1);
}
console.log("🎉 All tests passed!");
