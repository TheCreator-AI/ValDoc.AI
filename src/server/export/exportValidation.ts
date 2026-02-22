import { DocType } from "@prisma/client";
import { type ValidationSchemaName, validateDocumentPayload } from "@/server/schemas/validator";

const docTypeToSchema: Partial<Record<DocType, ValidationSchemaName>> = {
  [DocType.URS]: "urs.v1",
  [DocType.RID]: "ra.v1",
  [DocType.IOQ]: "ioq.v1",
  [DocType.OQ]: "oq.v1",
  [DocType.TRACEABILITY]: "tm.v1"
};

export const getSchemaForDocType = (docType: DocType): ValidationSchemaName | null => {
  return docTypeToSchema[docType] ?? null;
};

export const assertExportPayloadValid = (docType: DocType, payload: unknown) => {
  const schema = getSchemaForDocType(docType);
  if (!schema) return;
  const validation = validateDocumentPayload(schema, payload);
  if (!validation.valid) {
    throw new Error(`Export blocked: ${docType} payload failed ${schema} validation: ${validation.errors.join("; ")}`);
  }
};
