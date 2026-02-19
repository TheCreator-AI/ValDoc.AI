import { describe, expect, it } from "vitest";
import { hashRecordContent } from "@/server/signatures/manifest";

describe("signature manifest hash", () => {
  it("produces stable hash for semantically identical JSON", () => {
    const a = hashRecordContent('{"b":2,"a":1}');
    const b = hashRecordContent('{"a":1,"b":2}');
    expect(a).toBe(b);
  });

  it("changes hash when content changes", () => {
    const a = hashRecordContent("alpha");
    const b = hashRecordContent("beta");
    expect(a).not.toBe(b);
  });
});

