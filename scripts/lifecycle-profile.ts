import { promises as fs } from "node:fs";
import path from "node:path";

export type ReporterProfile = {
  id: string;
  root: string;
  dataDir: string;
  test: boolean;
};

// The reporter selects the same process profile as the desktop. It never changes
// USERPROFILE, APPDATA, application identity, or an installed skill root.
export async function resolveReporterProfile(
  selection: string,
): Promise<ReporterProfile> {
  if (selection === "personal") {
    if (!process.env.USERPROFILE || !process.env.APPDATA)
      throw new Error(
        "USERPROFILE and APPDATA are required for the explicit personal profile.",
      );
    return {
      id: "personal",
      root: path.join(process.env.USERPROFILE, ".agents", "skills"),
      dataDir: path.join(process.env.APPDATA, "com.skillarchive.desktop"),
      test: false,
    };
  }
  if (!path.isAbsolute(selection))
    throw new Error(
      "Select --profile personal or an absolute initialized test-profile directory.",
    );
  const base = path.resolve(selection);
  await refuseLinks(base);
  const marker = JSON.parse(
    await fs.readFile(path.join(base, "skills-dash-test-profile.json"), "utf8"),
  );
  if (marker.version !== 1)
    throw new Error("Unsupported test-profile marker; no files were changed.");
  if (
    base.toLowerCase() ===
    path.resolve(process.env.USERPROFILE ?? ".").toLowerCase()
  )
    throw new Error("A test profile cannot be the real user profile.");
  return {
    id: `test:${base}`,
    root: path.join(base, ".agents", "skills"),
    dataDir: path.join(base, "app-data"),
    test: true,
  };
}

export async function refuseLinks(target: string): Promise<void> {
  let current = path.resolve(target);
  while (true) {
    const info = await fs.lstat(current);
    if (info.isSymbolicLink())
      throw new Error(`Linked profile paths are not supported: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export async function readLifecycleRaw(
  profile: ReporterProfile,
): Promise<string | null> {
  const directory = path.join(profile.dataDir, "lifecycle-v1");
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  await refuseLinks(directory);
  const generations = names
    .filter((name) => /^g\d{20}\.json$/.test(name))
    .sort();
  let previous: string | null = null;
  let raw: string | null = null;
  for (const [index, name] of generations.entries()) {
    const filename = path.join(directory, name);
    await refuseLinks(filename);
    const size = (await fs.stat(filename)).size;
    if (size > 32 * 1024 * 1024)
      throw new Error("Lifecycle generation exceeds the reporter read limit.");
    const entry = JSON.parse(await fs.readFile(filename, "utf8"));
    if (
      name !== `g${String(index + 1).padStart(20, "0")}.json` ||
      entry.version !== 1 ||
      entry.previousRevision !== previous ||
      entry.revision !== name.slice(0, -5) ||
      typeof entry.raw !== "string"
    )
      throw new Error(
        `Lifecycle chain is corrupt at ${name}; preserved without repair.`,
      );
    previous = entry.revision;
    raw = entry.raw;
  }
  return raw;
}
