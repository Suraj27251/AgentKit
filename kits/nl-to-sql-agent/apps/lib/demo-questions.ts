/**
 * Approved demo questions and their normalization.
 *
 * The public demo restricts demo sessions to a small set of predefined
 * questions so that every answer demonstrates the real NL-to-SQL flow.
 * Anything outside this allowlist is blocked before the Lamatic flow is
 * invoked, so unsupported questions never receive fake or unrelated results.
 */

export const APPROVED_DEMO_QUESTIONS = [
  "How many customers are active?",
  "Average data usage by plan",
  "Recent failed transactions",
] as const;

/**
 * Conservative, exact-match normalization.
 *
 * Only cosmetic differences are reconciled: leading/trailing whitespace,
 * repeated internal whitespace, case, and optional terminal punctuation.
 * This is not semantic matching, so unrelated or expanded requests still
 * fail the allowlist check and are blocked.
 */
export function normalizeDemoQuestion(question: string): string {
  return question
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!\s]+$/, "")
    .toLowerCase();
}

/**
 * Whether a question is one of the approved demo questions.
 * Comparison is a normalized exact match against the allowlist.
 */
export function isApprovedDemoQuestion(question: string): boolean {
  const normalized = normalizeDemoQuestion(question);
  return APPROVED_DEMO_QUESTIONS.some(
    (approved) => normalizeDemoQuestion(approved) === normalized
  );
}
