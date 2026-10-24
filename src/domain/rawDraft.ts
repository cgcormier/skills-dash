/** Preserve untouched source bytes when a textarea normalizes line endings. */
export function updateRawDraft(original: string, editorText: string): string {
  const offsets = [0];
  let normalized = "";
  for (let index = 0; index < original.length; index++) {
    const char = original[index];
    if (char === "\r") {
      if (original[index + 1] === "\n") index++;
      normalized += "\n";
    } else normalized += char;
    offsets.push(index + 1);
  }
  const next = editorText.replace(/\r\n?/g, "\n");
  if (next === normalized) return original;
  let prefix = 0;
  while (
    prefix < next.length &&
    prefix < normalized.length &&
    next[prefix] === normalized[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < next.length - prefix &&
    suffix < normalized.length - prefix &&
    next[next.length - 1 - suffix] ===
      normalized[normalized.length - 1 - suffix]
  )
    suffix++;
  const ending = original.match(/\r\n|\r|\n/)?.[0] ?? "\n";
  return (
    original.slice(0, offsets[prefix]) +
    next.slice(prefix, next.length - suffix).replace(/\n/g, ending) +
    original.slice(offsets[normalized.length - suffix])
  );
}
