import { DocType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { assertExportPayloadValid, getSchemaForDocType } from "@/server/export/exportValidation";

describe("export payload validation", () => {
  it("maps schema-backed document types", () => {
    expect(getSchemaForDocType(DocType.URS)).toBe("urs.v1");
    expect(getSchemaForDocType(DocType.RID)).toBe("ra.v1");
    expect(getSchemaForDocType(DocType.IOQ)).toBe("ioq.v1");
    expect(getSchemaForDocType(DocType.OQ)).toBe("oq.v1");
    expect(getSchemaForDocType(DocType.TRACEABILITY)).toBe("tm.v1");
  });

  it("rejects export when payload fails schema validation", () => {
    expect(() => assertExportPayloadValid(DocType.URS, { metadata: { doc_type: "URS" } })).toThrow(
      /Export blocked/
    );
  });

  it("allows export for doc types without a canonical schema mapping", () => {
    expect(() => assertExportPayloadValid(DocType.DIA, { any: "shape" })).not.toThrow();
  });
});
