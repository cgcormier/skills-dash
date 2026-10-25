import { describe, expect, it } from "vitest";
import { proposalDiff } from "./proposalDiff";

describe("proposal diff", () => {
  it("shows insertion without marking the shared suffix as removed", () => {
    expect(
      proposalDiff("a\nb\nc", "a\nnew\nb\nc").filter(
        (line) => line.kind !== "context",
      ),
    ).toEqual([{ kind: "added", text: "new" }]);
  });
  it("shows deletion and replacement including final newline changes", () => {
    expect(
      proposalDiff("a\nb\nc", "a\nx\nc").filter(
        (line) => line.kind !== "context",
      ),
    ).toEqual([
      { kind: "removed", text: "b" },
      { kind: "added", text: "x" },
    ]);
    expect(
      proposalDiff("a\n", "a").some(
        (line) => line.kind === "removed" && line.text === "",
      ),
    ).toBe(true);
  });
});
