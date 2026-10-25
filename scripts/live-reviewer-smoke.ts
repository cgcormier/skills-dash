import { promises as fs } from "node:fs";
import path from "node:path";
import { connectNative } from "./native-cdp";
import { resolveReporterProfile } from "./lifecycle-profile";
import {
  buildReviewPrompt,
  parseReviewDecision,
  REVIEW_SCHEMA,
  sha256,
} from "../src/improvement/reviewer";
import type {
  LifecycleProfile,
  ReviewSnapshot,
} from "../src/improvement/types";

const args = process.argv.slice(2);
const option = (key: string) => args[args.indexOf(key) + 1];
if (!args.includes("--profile"))
  throw new Error(
    "Usage: npm.cmd run test:live -- --profile <absolute initialized test-profile> [--port 9237]. Start its native executable with the QA CDP port first. This test consumes live model usage.",
  );
const expected = await resolveReporterProfile(option("--profile"));
if (!expected.test)
  throw new Error("Live smoke refuses the normal personal profile.");
const native = await connectNative(
  args.includes("--port") ? Number(option("--port")) : 9237,
);
try {
  const actual = await native.invoke<LifecycleProfile>("lifecycle_profile");
  if (
    !actual.test ||
    actual.id.toLowerCase() !== expected.id.toLowerCase() ||
    actual.root.toLowerCase() !== expected.root.toLowerCase() ||
    actual.dataDir.toLowerCase() !== expected.dataDir.toLowerCase()
  )
    throw new Error(
      "Live smoke connected to the wrong native profile; no reviewer was started.",
    );
  const content =
    "---\nname: live-smoke\ndescription: Convert color names to lowercase\n---\nConvert each supplied color name to lowercase, preserving input order.\n";
  const revision = await sha256(content);
  const evidence = {
    id: "smoke-observation",
    folder: "live-smoke",
    sourcePath: path.join(actual.root, "live-smoke", "SKILL.md"),
    sourceKind: "personal" as const,
    revision,
    taskId: "synthetic-live-smoke",
    kind: "task" as const,
    observations: [
      "A synthetic smoke case converted RED, Blue to red, blue exactly as requested. No defect or friction was observed. This is a fixture for reviewer connectivity, not an actual usage record.",
    ],
    suggestedImprovements: [],
    evidenceRefs: [],
    reportIds: ["smoke-report"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const snapshot: ReviewSnapshot = {
    skill: {
      folder: evidence.folder,
      sourcePath: evidence.sourcePath,
      sourceKind: "personal",
    },
    content,
    revision,
    evidence: [evidence],
    fingerprint: await sha256(JSON.stringify(evidence)),
  };
  const started = Date.now();
  const result = await native.invoke<{
    output: string;
    usage: unknown;
    model: string;
    reasoningEffort: string;
    diagnostics: string[];
  }>(
    "reviewer_start",
    {
      id: `live-smoke-${Date.now()}`,
      prompt: buildReviewPrompt(snapshot),
      schema: JSON.stringify(REVIEW_SCHEMA),
      timeoutMs: 120_000,
      model: "gpt-6.1-sol",
    },
    140_000,
  );
  const decision = parseReviewDecision(result.output, snapshot);
  if (decision.decision !== "no-change")
    throw new Error(
      `Expected no-change for the defect-free smoke fixture, got ${decision.decision}.`,
    );
  const record = {
    surface: "native IPC + live Codex CLI",
    fixtureEvidence: true,
    profile: actual,
    elapsedMs: Date.now() - started,
    model: result.model,
    reasoningEffort: result.reasoningEffort,
    usage: result.usage,
    decision,
    diagnostics: result.diagnostics,
  };
  await fs.mkdir("output", { recursive: true });
  const filename = path.join("output", `native-live-smoke-${Date.now()}.json`);
  await fs.writeFile(filename, JSON.stringify(record, null, 2), { flag: "wx" });
  console.log(
    JSON.stringify({ ...record, artifact: path.resolve(filename) }, null, 2),
  );
} finally {
  native.close();
}
