import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  resolveReporterProfile,
  readLifecycleRaw,
  refuseLinks,
} from "./lifecycle-profile";
// Core imports are kept here so policy and report validation have one owner.
import {
  parseReport,
  effectiveMode,
  parseStore,
} from "../src/improvement/index";

const args = process.argv.slice(2);
function option(key: string): string | undefined {
  const index = args.indexOf(key);
  return index < 0 ? undefined : args[index + 1];
}
const selection = option("--profile");
const input = option("--input");
if (!selection || !input)
  throw new Error(
    "Usage: npm.cmd run report:use -- --profile <absolute-test-profile|personal> --input <report.json>. Supply the exact revision loaded by the task, never a later disk hash.",
  );
const profile = await resolveReporterProfile(selection);
const info = await fs.stat(input);
if (info.size > 64 * 1024) throw new Error("Report exceeds 64 KiB.");
const report = parseReport(await fs.readFile(input, "utf8"));
const expectedPath = path.join(profile.root, report.folder, "SKILL.md");
if (
  path.resolve(report.sourcePath).toLowerCase() !== expectedPath.toLowerCase()
)
  throw new Error(
    "Report source does not belong to the selected profile's personal skill root.",
  );
await refuseLinks(path.dirname(expectedPath));
const raw = await readLifecycleRaw(profile);
if (raw === null)
  throw new Error(
    "Improvement has not been enabled in this profile. Open the desktop Settings first.",
  );
const store = parseStore(raw);
if (effectiveMode(store.settings, store.skillModes, report.folder) === "off")
  throw new Error(
    "Improvement is Off for this skill/profile. No report was recorded.",
  );
if (report.kind !== "task")
  throw new Error(
    "Maintenance and validation runs do not count as task evidence.",
  );
const inbox = path.join(profile.dataDir, "lifecycle-inbox");
await fs.mkdir(inbox, { recursive: true });
await refuseLinks(inbox);
const id = randomUUID();
const temporary = path.join(inbox, `${id}.partial`);
const destination = path.join(inbox, `${id}.json`);
const handle = await fs.open(temporary, "wx");
try {
  await handle.writeFile(JSON.stringify(report));
  await handle.sync();
} finally {
  await handle.close();
}
await fs.rename(temporary, destination);
console.log(
  JSON.stringify(
    {
      recorded: true,
      reportId: report.id,
      inboxId: id,
      profile,
      inbox: destination,
      status:
        "Pending app import; the desktop processes reviews only while running.",
    },
    null,
    2,
  ),
);
