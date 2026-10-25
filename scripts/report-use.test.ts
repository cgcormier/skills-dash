import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { emptyStore } from "../src/improvement/types";
import { readLifecycleRaw, resolveReporterProfile } from "./lifecycle-profile";

function fixture(enabled: boolean) {
  const base = mkdtempSync(path.join(tmpdir(), "skills-dash-report-test-"));
  writeFileSync(
    path.join(base, "skills-dash-test-profile.json"),
    '{"version":1}',
  );
  const root = path.join(base, ".agents", "skills", "fixture");
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "SKILL.md"), "fixture source");
  const store = emptyStore();
  store.settings.enabled = enabled;
  store.settings.defaultMode = "observe";
  const directory = path.join(base, "app-data", "lifecycle-v1");
  mkdirSync(directory, { recursive: true });
  const generation = path.join(directory, "g00000000000000000001.json");
  writeFileSync(
    generation,
    JSON.stringify({
      version: 1,
      revision: "g00000000000000000001",
      previousRevision: null,
      raw: JSON.stringify(store),
    }),
  );
  const input = path.join(base, "report.json");
  const report = {
    version: 1,
    id: "report-1",
    folder: "fixture",
    sourcePath: path.join(root, "SKILL.md"),
    sourceKind: "personal",
    revision: "a".repeat(64),
    taskId: "bounded-task-1",
    kind: "task",
    observation: "The expected output matched.",
    evidenceRefs: [],
    reportedAt: new Date().toISOString(),
  };
  writeFileSync(input, JSON.stringify(report));
  const run = () =>
    spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/report-use.ts",
        "--profile",
        base,
        "--input",
        input,
      ],
      { encoding: "utf8", timeout: 30_000, windowsHide: true },
    );
  return { base, input, report, generation, run };
}
describe("closed-app reporter", () => {
  it("writes a durable inbox report using explicit profile without rewriting lifecycle", async () => {
    const f = fixture(true);
    const before = readFileSync(f.generation, "utf8");
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.profile.dataDir).toBe(path.join(f.base, "app-data"));
    expect(JSON.parse(readFileSync(receipt.inbox, "utf8"))).toEqual(f.report);
    expect(readFileSync(f.generation, "utf8")).toBe(before);
    const profile = await resolveReporterProfile(f.base);
    expect(await readLifecycleRaw(profile)).toContain('"enabled":true');
  });
  it("refuses Off, wrong-profile sources, and maintenance evidence", () => {
    const off = fixture(false);
    expect(off.run().stderr).toContain("Off");
    expect(readdirSync(path.join(off.base, "app-data"))).toEqual([
      "lifecycle-v1",
    ]);
    const f = fixture(true);
    writeFileSync(
      f.input,
      JSON.stringify({
        ...f.report,
        sourcePath: path.join(tmpdir(), "outside", "SKILL.md"),
      }),
    );
    expect(f.run().stderr).toContain("selected profile");
    writeFileSync(f.input, JSON.stringify({ ...f.report, kind: "validation" }));
    expect(f.run().stderr).toContain("do not count");
  });
  it("fails visibly on corruption while retaining original generations", async () => {
    const f = fixture(true);
    writeFileSync(f.generation, "{broken");
    expect(f.run().status).not.toBe(0);
    expect(readFileSync(f.generation, "utf8")).toBe("{broken");
  });
});
