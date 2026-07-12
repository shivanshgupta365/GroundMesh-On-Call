export type PolicyInput = {
  changedFiles: string[];
  productionBefore: string;
  productionAfter: string;
  diff: string;
  investigationConfidence: number;
};

export type PolicyResult = { passed: boolean; reasons: string[] };

const secretPattern = /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?(?!\[REDACTED\])[A-Za-z0-9_\-/]{12,}/i;
const destructivePattern = /\b(rm\s+-rf|drop\s+(database|table)|terraform\s+destroy|git\s+push\s+--force)\b/i;

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const reasons: string[] = [];
  if (input.changedFiles.length !== 1 || input.changedFiles[0] !== "demo/config.preview.json") reasons.push("Only demo/config.preview.json may change.");
  if (input.productionBefore !== input.productionAfter) reasons.push("Production configuration changed.");
  if (secretPattern.test(input.diff)) reasons.push("Secret-like value detected in remediation diff.");
  if (destructivePattern.test(input.diff)) reasons.push("Destructive command or pattern detected.");
  if (input.investigationConfidence < 0.85) reasons.push("Investigation confidence is below 0.85.");
  return { passed: reasons.length === 0, reasons };
}
