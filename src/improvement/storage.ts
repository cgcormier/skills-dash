import {
  emptyStore,
  type ImprovementStore,
  type UseReport,
  type Observation,
  type ImprovementReview,
  type ImprovementSettings,
} from "./types";
import { MAX_CONTENT_BYTES, MAX_REVIEW_EVIDENCE, utf8Size } from "./reviewer";

type Row = Record<string, unknown>;
const modes = ["off", "observe", "propose", "auto-update"];
const statuses = [
  "reviewing",
  "proposal",
  "no-change",
  "insufficient-evidence",
  "failed",
  "cancelled",
  "rejected",
  "publishing",
  "published",
  "unpublished",
  "recovery-required",
  "restoring",
  "restored",
];
function fail(path: string): never {
  throw new Error(
    `Invalid lifecycle data at ${path}. Original storage was not replaced.`,
  );
}
function object(value: unknown, path: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path);
  return value as Row;
}
function keys(row: Row, required: string[], optional: string[], path: string) {
  if (
    required.some((key) => !(key in row)) ||
    Object.keys(row).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    fail(path + ".fields");
}
function string(
  value: unknown,
  path: string,
  max = 8192,
): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(path);
}
function nullableString(value: unknown, path: string, max = 8192) {
  if (value !== null) string(value, path, max);
}
function date(value: unknown, path: string) {
  string(value, path, 64);
  if (!Number.isFinite(Date.parse(value))) fail(path);
}
function nullableDate(value: unknown, path: string) {
  if (value !== null) date(value, path);
}
function enumeration(value: unknown, values: readonly string[], path: string) {
  if (typeof value !== "string" || !values.includes(value)) fail(path);
}
function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(path);
  return value;
}
function strings(
  value: unknown,
  path: string,
  maxItems = 100,
  maxLength = 8192,
): string[] {
  const items = array(value, path, maxItems);
  items.forEach((item) => string(item, path, maxLength));
  if (new Set(items).size !== items.length) fail(path + ".duplicates");
  return items as string[];
}
function revision(value: unknown, path: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(path);
}
function folder(value: unknown, path: string) {
  string(value, path, 255);
  if (
    /[\\/:]/.test(value) ||
    value === "." ||
    value === ".." ||
    /[. ]$/.test(value)
  )
    fail(path);
}
function identity(row: Row, path: string) {
  folder(row.folder, path + ".folder");
  string(row.sourcePath, path + ".sourcePath", 4096);
  if (
    !/^(?:[A-Za-z]:[\\/]|\/)/.test(row.sourcePath as string) ||
    !/[\\/]SKILL\.md$/i.test(row.sourcePath as string)
  )
    fail(path + ".sourcePath");
  if (row.sourceKind !== "personal") fail(path + ".sourceKind");
}
export function validateSettings(value: unknown): ImprovementSettings {
  const row = object(value, "settings");
  keys(
    row,
    ["enabled", "defaultMode", "threshold", "dailyLimit", "timeoutMs", "model"],
    [],
    "settings",
  );
  if (typeof row.enabled !== "boolean") fail("settings.enabled");
  enumeration(row.defaultMode, modes, "settings.defaultMode");
  for (const [key, min, max] of [
    ["threshold", 1, 50],
    ["dailyLimit", 1, 100],
    ["timeoutMs", 1000, 600_000],
  ] as const)
    if (
      !Number.isInteger(row[key]) ||
      (row[key] as number) < min ||
      (row[key] as number) > max
    )
      fail("settings." + key);
  string(row.model, "settings.model", 120);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(row.model)) fail("settings.model");
  return row as ImprovementSettings;
}
export function parseReport(raw: string): UseReport {
  if (utf8Size(raw) > 65_536) fail("report.size");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("report.JSON");
  }
  const row = object(value, "report");
  keys(
    row,
    [
      "version",
      "id",
      "folder",
      "sourcePath",
      "sourceKind",
      "revision",
      "taskId",
      "kind",
      "observation",
      "evidenceRefs",
      "reportedAt",
    ],
    ["suggestedImprovement"],
    "report",
  );
  if (row.version !== 1) fail("report.version");
  identity(row, "report");
  string(row.id, "report.id", 256);
  revision(row.revision, "report.revision");
  string(row.taskId, "report.taskId", 256);
  enumeration(row.kind, ["task", "maintenance", "validation"], "report.kind");
  string(row.observation, "report.observation", 8000);
  strings(row.evidenceRefs, "report.evidenceRefs", 30, 2048);
  date(row.reportedAt, "report.reportedAt");
  if (row.suggestedImprovement !== undefined)
    string(row.suggestedImprovement, "report.suggestedImprovement", 8000);
  return row as UseReport;
}
export function validateObservation(
  value: unknown,
  path = "observation",
): Observation {
  const row = object(value, path);
  keys(
    row,
    [
      "id",
      "folder",
      "sourcePath",
      "sourceKind",
      "revision",
      "taskId",
      "kind",
      "observations",
      "suggestedImprovements",
      "evidenceRefs",
      "reportIds",
      "createdAt",
      "updatedAt",
    ],
    [],
    path,
  );
  identity(row, path);
  string(row.id, path + ".id", 256);
  revision(row.revision, path + ".revision");
  string(row.taskId, path + ".taskId", 256);
  enumeration(row.kind, ["task", "maintenance", "validation"], path + ".kind");
  if (
    !strings(row.observations, path + ".observations", 100, 8000).length ||
    !strings(row.reportIds, path + ".reportIds", 100, 256).length
  )
    fail(path + ".empty");
  strings(
    row.suggestedImprovements,
    path + ".suggestedImprovements",
    100,
    8000,
  );
  strings(row.evidenceRefs, path + ".evidenceRefs", 300, 2048);
  date(row.createdAt, path + ".createdAt");
  date(row.updatedAt, path + ".updatedAt");
  return row as Observation;
}
function review(value: unknown, path: string): ImprovementReview {
  const row = object(value, path);
  keys(
    row,
    [
      "id",
      "mode",
      "status",
      "snapshot",
      "createdAt",
      "completedAt",
      "result",
      "validation",
      "error",
      "usage",
      "publication",
    ],
    [],
    path,
  );
  string(row.id, path + ".id", 256);
  enumeration(row.mode, modes, path + ".mode");
  enumeration(row.status, statuses, path + ".status");
  date(row.createdAt, path + ".createdAt");
  nullableDate(row.completedAt, path + ".completedAt");
  nullableString(row.error, path + ".error", 16_000);
  const snapshot = object(row.snapshot, path + ".snapshot");
  keys(
    snapshot,
    ["skill", "content", "revision", "evidence", "fingerprint"],
    [],
    path + ".snapshot",
  );
  const skill = object(snapshot.skill, path + ".snapshot.skill");
  keys(
    skill,
    ["folder", "sourcePath", "sourceKind"],
    [],
    path + ".snapshot.skill",
  );
  identity(skill, path + ".snapshot.skill");
  string(snapshot.content, path + ".snapshot.content", MAX_CONTENT_BYTES);
  if (utf8Size(snapshot.content as string) > MAX_CONTENT_BYTES)
    fail(path + ".snapshot.content.size");
  revision(snapshot.revision, path + ".snapshot.revision");
  revision(snapshot.fingerprint, path + ".snapshot.fingerprint");
  const evidence = array(
    snapshot.evidence,
    path + ".snapshot.evidence",
    MAX_REVIEW_EVIDENCE,
  ).map((item, i) =>
    validateObservation(item, `${path}.snapshot.evidence.${i}`),
  );
  if (
    !evidence.length ||
    new Set(evidence.map((item) => item.id)).size !== evidence.length ||
    evidence.some(
      (item) =>
        item.kind !== "task" ||
        item.folder !== skill.folder ||
        normalizePath(item.sourcePath) !==
          normalizePath(skill.sourcePath as string),
    )
  )
    fail(path + ".snapshot.evidence.scope");
  if (row.result !== null) {
    const result = object(row.result, path + ".result");
    keys(
      result,
      ["decision", "rationale", "proposedContent", "evidenceIds"],
      [],
      path + ".result",
    );
    enumeration(
      result.decision,
      ["proposal", "no-change", "insufficient-evidence"],
      path + ".result.decision",
    );
    string(result.rationale, path + ".result.rationale", 8000);
    const ids = strings(
      result.evidenceIds,
      path + ".result.evidenceIds",
      MAX_REVIEW_EVIDENCE,
      256,
    ).sort();
    const expected = evidence.map((item) => item.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(expected))
      fail(path + ".result.evidenceIds.scope");
    if (result.decision === "proposal") {
      string(
        result.proposedContent,
        path + ".result.proposedContent",
        MAX_CONTENT_BYTES,
      );
      if (
        utf8Size(result.proposedContent as string) > MAX_CONTENT_BYTES ||
        result.proposedContent === snapshot.content
      )
        fail(path + ".result.proposedContent");
    } else if (result.proposedContent !== null)
      fail(path + ".result.proposedContent");
  }
  if (row.validation !== null) {
    const validation = object(row.validation, path + ".validation");
    keys(
      validation,
      ["syntax", "scope", "behavioral", "procedure", "checks"],
      [],
      path + ".validation",
    );
    if (
      typeof validation.syntax !== "boolean" ||
      typeof validation.scope !== "boolean"
    )
      fail(path + ".validation.flags");
    enumeration(
      validation.behavioral,
      ["passed", "failed", "unavailable"],
      path + ".validation.behavioral",
    );
    nullableString(validation.procedure, path + ".validation.procedure", 256);
    array(validation.checks, path + ".validation.checks", 100).forEach(
      (item) => {
        const check = object(item, path + ".validation.check");
        keys(
          check,
          ["name", "passed", "detail"],
          [],
          path + ".validation.check",
        );
        string(check.name, path + ".validation.check.name", 256);
        if (typeof check.passed !== "boolean")
          fail(path + ".validation.check.passed");
        string(check.detail, path + ".validation.check.detail", 4000);
      },
    );
  }
  if (row.usage !== null) object(row.usage, path + ".usage");
  if (row.publication !== null) {
    const publication = object(row.publication, path + ".publication");
    keys(
      publication,
      [
        "previousContent",
        "proposedContent",
        "recoveryPath",
        "startedAt",
        "completedAt",
      ],
      ["operation"],
      path + ".publication",
    );
    if (publication.operation !== undefined)
      enumeration(
        publication.operation,
        ["publish", "restore"],
        path + ".publication.operation",
      );
    string(
      publication.previousContent,
      path + ".publication.previousContent",
      MAX_CONTENT_BYTES,
    );
    string(
      publication.proposedContent,
      path + ".publication.proposedContent",
      MAX_CONTENT_BYTES,
    );
    nullableString(
      publication.recoveryPath,
      path + ".publication.recoveryPath",
      4096,
    );
    date(publication.startedAt, path + ".publication.startedAt");
    nullableDate(publication.completedAt, path + ".publication.completedAt");
    const result = row.result as Row | null;
    if (
      !result ||
      result.decision !== "proposal" ||
      publication.previousContent !== snapshot.content ||
      publication.proposedContent !== result.proposedContent
    )
      fail(path + ".publication.content");
  }
  if (
    [
      "publishing",
      "published",
      "unpublished",
      "recovery-required",
      "restoring",
      "restored",
    ].includes(row.status as string) &&
    row.publication === null
  )
    fail(path + ".publication.required");
  if (
    [
      "proposal",
      "rejected",
      "publishing",
      "published",
      "unpublished",
      "recovery-required",
      "restoring",
      "restored",
    ].includes(row.status as string) &&
    (row.result as Row | null)?.decision !== "proposal"
  )
    fail(path + ".result.required");
  if (
    ["no-change", "insufficient-evidence"].includes(row.status as string) &&
    (row.result as Row | null)?.decision !== row.status
  )
    fail(path + ".result.status");
  return row as ImprovementReview;
}
export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}
export function observationKey(
  value: Pick<UseReport, "folder" | "sourcePath" | "taskId">,
): string {
  return JSON.stringify([
    value.folder.toLowerCase(),
    normalizePath(value.sourcePath),
    value.taskId,
  ]);
}
export function parseStore(raw: string | null): ImprovementStore {
  if (raw === null) return emptyStore();
  if (utf8Size(raw) > 16 * 1024 * 1024) fail("store.size");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("store.JSON");
  }
  const row = object(value, "store");
  keys(
    row,
    [
      "version",
      "settings",
      "skillModes",
      "observations",
      "reviews",
      "receipts",
    ],
    [],
    "store",
  );
  if (row.version !== 1) fail("store.version");
  validateSettings(row.settings);
  const overrides = object(row.skillModes, "store.skillModes");
  if (
    new Set(Object.keys(overrides).map((name) => name.toLowerCase())).size !==
    Object.keys(overrides).length
  )
    fail("store.skillModes.duplicates");
  Object.entries(overrides).forEach(([name, mode]) => {
    folder(name, "store.skillModes.folder");
    enumeration(mode, [...modes, "inherit"], "store.skillModes.mode");
  });
  const observations = array(
    row.observations,
    "store.observations",
    10_000,
  ).map((item, i) => validateObservation(item, `store.observations.${i}`));
  if (
    new Set(observations.map(observationKey)).size !== observations.length ||
    new Set(observations.map((item) => item.id)).size !== observations.length
  )
    fail("store.observations.duplicates");
  const reviews = array(row.reviews, "store.reviews", 10_000).map((item, i) =>
    review(item, `store.reviews.${i}`),
  );
  if (new Set(reviews.map((item) => item.id)).size !== reviews.length)
    fail("store.reviews.duplicates");
  if (reviews.filter((item) => item.status === "reviewing").length > 1)
    fail("store.reviews.concurrent");
  const receipts = array(row.receipts, "store.receipts", 100_000);
  receipts.forEach((item) => {
    const receipt = object(item, "store.receipt");
    keys(receipt, ["id", "status", "error"], [], "store.receipt");
    string(receipt.id, "store.receipt.id", 256);
    enumeration(
      receipt.status,
      ["imported", "rejected"],
      "store.receipt.status",
    );
    nullableString(receipt.error, "store.receipt.error", 16000);
  });
  if (
    new Set(receipts.map((item) => (item as Row).id)).size !== receipts.length
  )
    fail("store.receipts.duplicates");
  return row as ImprovementStore;
}
