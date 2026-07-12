import { z } from "zod";

export const ContextSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["runtime", "diagnostic", "code", "config", "runbook", "git"]),
  observedAt: z.string(),
  freshness: z.enum(["current", "stale", "unknown"]),
  authority: z.number().min(0).max(1),
  fingerprint: z.string(),
  excerpt: z.string(),
});

export const EvidenceClaimSchema = z.object({
  id: z.string(),
  claim: z.string(),
  sourceIds: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

export const ContextConflictSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceIds: z.array(z.string()).min(2),
  currentValue: z.string(),
  staleValue: z.string(),
  resolution: z.string(),
});

export const IncidentContextPackSchema = z.object({
  incidentId: z.string(),
  createdAt: z.string(),
  sources: z.array(ContextSourceSchema).min(5),
  claims: z.array(EvidenceClaimSchema),
  conflicts: z.array(ContextConflictSchema),
});

export const AgentResultSchema = z.object({
  role: z.enum(["investigator", "remediator", "verifier"]),
  runId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

export const IncidentEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.enum(["alert", "context", "agent", "policy", "verification", "release", "error"]),
  label: z.string(),
  detail: z.string(),
  role: z.enum(["investigator", "remediator", "verifier"]).optional(),
});

export const FinalResultSchema = z.object({
  status: z.enum(["READY_FOR_APPROVAL", "BLOCKED", "FAILED", "RUNNING"]),
  productionStatus: z.number().optional(),
  previewStatus: z.number().optional(),
  checksPassed: z.number().int().min(0),
  checksFailed: z.number().int().min(0),
  changedFiles: z.array(z.string()),
  pullRequestUrl: z.string().url().optional(),
  productionChanged: z.boolean(),
  reason: z.string().optional(),
});

export type ContextSource = z.infer<typeof ContextSourceSchema>;
export type IncidentContextPack = z.infer<typeof IncidentContextPackSchema>;
export type AgentResult = z.infer<typeof AgentResultSchema>;
export type IncidentEvent = z.infer<typeof IncidentEventSchema>;
export type FinalResult = z.infer<typeof FinalResultSchema>;
