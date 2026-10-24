import { describe, expect, it } from "vitest";
import { updateRawDraft } from "./rawDraft";

describe("raw editor preservation", () => {
  it("keeps an unchanged normalized textarea byte-identical, including BOM and mixed endings", () => {
    const raw = "\uFEFF---\r\nname: x\n---\rBody";
    expect(updateRawDraft(raw, raw.replace(/\r\n?/g, "\n"))).toBe(raw);
  });
  it("preserves unknown metadata and original CRLF while editing the body", () => {
    const raw =
      "---\r\nname: x\r\nunknown: keep # comment\r\n---\r\nOld body\r\n";
    expect(
      updateRawDraft(
        raw,
        raw.replace(/\r\n/g, "\n").replace("Old body", "New body\nAdded"),
      ),
    ).toBe(raw.replace("Old body", "New body\r\nAdded"));
  });
  it("preserves untouched mixed endings around an insertion and deletion", () => {
    const raw = "\uFEFFfirst\r\nsecond\nthird\rfourth";
    expect(updateRawDraft(raw, "\uFEFFfirst\nSECOND\nthird\nfourth")).toBe(
      "\uFEFFfirst\r\nSECOND\nthird\rfourth",
    );
    expect(updateRawDraft("one\r\ntwo\r\n", "one\n")).toBe("one\r\n");
  });
});
