export type DiffLine = { kind: "context" | "removed" | "added"; text: string };

/** Linear, bounded replacement hunk. Does not claim minimal edit distance. */
export function proposalDiff(before: string, after: string): DiffLine[] {
  const oldLines = before.split(/\r\n|\n|\r/);
  const newLines = after.split(/\r\n|\n|\r/);
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  )
    start++;
  let end = 0;
  while (
    end < oldLines.length - start &&
    end < newLines.length - start &&
    oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]
  )
    end++;
  if (start === oldLines.length && start === newLines.length) return [];
  return [
    ...oldLines
      .slice(Math.max(0, start - 3), start)
      .map((text) => ({ kind: "context" as const, text })),
    ...oldLines
      .slice(start, oldLines.length - end)
      .map((text) => ({ kind: "removed" as const, text })),
    ...newLines
      .slice(start, newLines.length - end)
      .map((text) => ({ kind: "added" as const, text })),
    ...newLines
      .slice(newLines.length - end, newLines.length - end + 3)
      .map((text) => ({ kind: "context" as const, text })),
  ];
}
