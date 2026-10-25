export type ImprovementMode = "off" | "observe" | "propose" | "auto-update";
export type FolderMode = ImprovementMode | "inherit";
export type ImprovementSettings = {
  enabled: boolean;
  defaultMode: ImprovementMode;
  threshold: number;
  dailyLimit: number;
  timeoutMs: number;
  model: string;
};
export const DEFAULT_SETTINGS: ImprovementSettings = {
  enabled: false,
  defaultMode: "propose",
  threshold: 5,
  dailyLimit: 10,
  timeoutMs: 120_000,
  model: "gpt-6.1-sol",
};
export type SkillIdentity = {
  folder: string;
  sourcePath: string;
  sourceKind: "personal";
};
export type UseReport = SkillIdentity & {
  version: 1;
  id: string;
  revision: string;
  taskId: string;
  kind: "task" | "maintenance" | "validation";
  observation: string;
  evidenceRefs: string[];
  suggestedImprovement?: string;
  reportedAt: string;
};
export type Observation = SkillIdentity & {
  id: string;
  revision: string;
  taskId: string;
  kind: UseReport["kind"];
  observations: string[];
  suggestedImprovements: string[];
  evidenceRefs: string[];
  reportIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type ReviewSnapshot = {
  skill: SkillIdentity;
  content: string;
  revision: string;
  evidence: Observation[];
  fingerprint: string;
};
export type ReviewDecision = {
  decision: "proposal" | "no-change" | "insufficient-evidence";
  rationale: string;
  proposedContent: string | null;
  evidenceIds: string[];
};
export type ValidationResult = {
  syntax: boolean;
  scope: boolean;
  behavioral: "passed" | "failed" | "unavailable";
  procedure: string | null;
  checks: { name: string; passed: boolean; detail: string }[];
};
export type ReviewStatus =
  | "reviewing"
  | "proposal"
  | "no-change"
  | "insufficient-evidence"
  | "failed"
  | "cancelled"
  | "rejected"
  | "publishing"
  | "published"
  | "unpublished"
  | "recovery-required"
  | "restoring"
  | "restored";
export type PublicationJournal = {
  /** Optional for v1 journals written before durable operation intent existed. */
  operation?: "publish" | "restore";
  previousContent: string;
  proposedContent: string;
  recoveryPath: string | null;
  startedAt: string;
  completedAt: string | null;
};
export type ImprovementReview = {
  id: string;
  mode: ImprovementMode;
  status: ReviewStatus;
  snapshot: ReviewSnapshot;
  createdAt: string;
  completedAt: string | null;
  result: ReviewDecision | null;
  validation: ValidationResult | null;
  error: string | null;
  usage: Record<string, unknown> | null;
  publication: PublicationJournal | null;
};
export type ReportReceipt = {
  id: string;
  status: "imported" | "rejected";
  error: string | null;
};
export type ImprovementStore = {
  version: 1;
  settings: ImprovementSettings;
  skillModes: Record<string, FolderMode>;
  observations: Observation[];
  reviews: ImprovementReview[];
  receipts: ReportReceipt[];
};
export type LifecycleProfile = {
  id: string;
  root: string;
  dataDir: string;
  test: boolean;
};
export type PersistenceRead = {
  raw: string | null;
  revision: string | null;
  reports: { id: string; raw: string }[];
  profile: LifecycleProfile;
  diagnostics?: string[];
};
export interface LifecyclePersistence {
  read(): Promise<PersistenceRead>;
  write(
    expectedRevision: string | null,
    raw: string,
  ): Promise<{ revision: string }>;
}
export interface SkillBoundary {
  readSkill(folder: string): Promise<{ content: string; path: string }>;
  saveSkill(
    folder: string,
    expectedContent: string,
    content: string,
  ): Promise<{ recoveryPath: string | null }>;
}
export interface Reviewer {
  review(
    request: {
      id: string;
      prompt: string;
      schema: string;
      timeoutMs: number;
      model: string;
    },
    signal: AbortSignal,
  ): Promise<{ output: string; usage?: Record<string, unknown> }>;
  cancel?(id: string): Promise<void>;
}
export type ImprovementSnapshot = {
  store: ImprovementStore;
  profile: LifecycleProfile | null;
  loading: boolean;
  error: string | null;
  diagnostics: string[];
  activeReviewId: string | null;
};
export function effectiveMode(
  settings: ImprovementSettings,
  skillModes: Record<string, FolderMode>,
  folder: string,
): ImprovementMode {
  if (!settings.enabled) return "off";
  const key = Object.keys(skillModes).find(
    (name) => name.toLowerCase() === folder.toLowerCase(),
  );
  const override = key === undefined ? undefined : skillModes[key];
  return !override || override === "inherit" ? settings.defaultMode : override;
}
export function emptyStore(): ImprovementStore {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    skillModes: {},
    observations: [],
    reviews: [],
    receipts: [],
  };
}
