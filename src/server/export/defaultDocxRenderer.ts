import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Footer,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import { getSkeleton, type SkeletonDocType } from "@/server/content/skeletons";

type ExportDocType =
  | "URS"
  | "SIA"
  | "RID"
  | "DIA"
  | "IOQ"
  | "OQ"
  | "EXECUTED_PROTOCOL"
  | "PROTOCOL_SUMMARY"
  | "SUMMARY"
  | "TRACEABILITY";

type TraceabilityRow = {
  requirementId: string;
  riskControlId: string;
  testCaseId: string;
};

type BuildDocxModelParams = {
  docType: ExportDocType;
  docId: string;
  hash: string;
  payload: unknown;
  signatures?: SignatureRow[];
  generatedAtIso?: string;
};

type RenderDefaultDocxParams = BuildDocxModelParams & {
  title: string;
  primaryContent?: string;
};

type DefaultDocxLayout = {
  docType: string;
  titlePrefix: string;
  sectionHeadingPrefix: string;
};

type DocxSection = {
  heading: string;
  paragraphs: string[];
  tableColumns: string[];
  tableRows: string[][];
};

export type SignatureRow = {
  signerFullName: string;
  signerUserId: string;
  meaning: string;
  signedAt: string;
  recordHash: string;
  authMethod?: string;
  remarks?: string | null;
};

export type DocxExportModel = {
  sectionHeadings: string[];
  traceabilityRows: TraceabilityRow[];
  footerText: string;
  metadataRows: Array<{ key: string; value: string }>;
  sections: DocxSection[];
  signatures: SignatureRow[];
  primaryContentLineCount: number;
};

const docTypeToSkeleton: Record<ExportDocType, SkeletonDocType> = {
  URS: "URS",
  SIA: "SUMMARY_REPORT",
  RID: "RA",
  DIA: "SUMMARY_REPORT",
  IOQ: "IOQ",
  OQ: "OQ",
  EXECUTED_PROTOCOL: "SUMMARY_REPORT",
  PROTOCOL_SUMMARY: "SUMMARY_REPORT",
  SUMMARY: "SUMMARY_REPORT",
  TRACEABILITY: "SUMMARY_REPORT"
};

const docTypeToLayoutName: Record<ExportDocType, string> = {
  URS: "urs",
  SIA: "summary-report",
  RID: "ra",
  DIA: "summary-report",
  IOQ: "ioq",
  OQ: "oq",
  EXECUTED_PROTOCOL: "summary-report",
  PROTOCOL_SUMMARY: "summary-report",
  SUMMARY: "summary-report",
  TRACEABILITY: "summary-report"
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toStringValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => toStringValue(item)).filter(Boolean).join(", ");
  return JSON.stringify(value);
};

const getPathValues = (root: unknown, pathExpr: string): unknown[] => {
  const segments = pathExpr.split(".");
  let values: unknown[] = [root];

  for (const segment of segments) {
    const isArraySegment = segment.endsWith("[]");
    const key = isArraySegment ? segment.slice(0, -2) : segment;
    const next: unknown[] = [];
    for (const value of values) {
      const record = toRecord(value);
      const child = record[key];
      if (isArraySegment) {
        if (Array.isArray(child)) {
          next.push(...child);
        }
      } else if (child !== undefined) {
        next.push(child);
      }
    }
    values = next;
  }
  return values;
};

const dedupe = <T,>(items: T[]) => Array.from(new Set(items));

const loadLayout = (docType: ExportDocType): DefaultDocxLayout => {
  const layoutName = docTypeToLayoutName[docType];
  const layoutPath = path.resolve(process.cwd(), "templates", "default-docx", `${layoutName}.layout.json`);
  const text = fs.readFileSync(layoutPath, "utf8");
  const parsed = JSON.parse(text) as Partial<DefaultDocxLayout>;
  return {
    docType: parsed.docType ?? docType,
    titlePrefix: parsed.titlePrefix ?? "Validation Document",
    sectionHeadingPrefix: parsed.sectionHeadingPrefix ?? ""
  };
};

const buildTraceabilityRows = (payload: Record<string, unknown>): TraceabilityRow[] => {
  const traceMappings = getPathValues(payload, "traceability.mappings[]").map((row) => toRecord(row));
  if (traceMappings.length > 0) {
    return traceMappings.map((row) => ({
      requirementId: toStringValue(row.req_id || row.requirement_id),
      riskControlId: toStringValue(row.risk_id || row.risk_control_id),
      testCaseId: toStringValue(row.test_id || row.test_case_id)
    }));
  }

  const riskTestById = new Map<string, string[]>();
  for (const risk of getPathValues(payload, "risks[]").map((item) => toRecord(item))) {
    const riskId = toStringValue(risk.risk_id);
    if (!riskId) continue;
    const tests = (risk.verification_test_ids as unknown[] | undefined)?.map((item) => toStringValue(item)).filter(Boolean) ?? [];
    riskTestById.set(riskId, tests);
  }

  const requirements = getPathValues(payload, "requirements[]").map((item) => toRecord(item));
  const rows: TraceabilityRow[] = [];
  for (const requirement of requirements) {
    const requirementId = toStringValue(requirement.req_id);
    const linkedRiskIds = (requirement.linked_risk_ids as unknown[] | undefined)
      ?.map((item) => toStringValue(item))
      .filter(Boolean) ?? [];
    for (const riskId of linkedRiskIds) {
      const tests = riskTestById.get(riskId);
      if (!tests || tests.length === 0) {
        rows.push({ requirementId, riskControlId: riskId, testCaseId: "TBD" });
        continue;
      }
      for (const testId of tests) {
        rows.push({ requirementId, riskControlId: riskId, testCaseId: testId });
      }
    }
  }
  return rows;
};

const buildSectionTableRows = (items: unknown[], columns: string[]) => {
  return items.map((item) => {
    const row = toRecord(item);
    return columns.map((column) => {
      const value = row[column];
      if (Array.isArray(value)) {
        return value.map((entry) => toStringValue(entry)).join(", ");
      }
      return toStringValue(value);
    });
  });
};

export const buildDocxExportModel = (params: BuildDocxModelParams): DocxExportModel => {
  const payload = toRecord(params.payload);
  const metadata = toRecord(payload.metadata);
  const skeleton = getSkeleton(docTypeToSkeleton[params.docType]);
  const sectionDefs = [...skeleton.sections].sort((a, b) => a.order - b.order);
  const traceabilityRows = buildTraceabilityRows(payload).filter((row) => row.requirementId || row.riskControlId || row.testCaseId);
  const generatedAt = params.generatedAtIso ?? new Date().toISOString();
  const footerText = `Doc ID: ${params.docId} | Hash: ${params.hash} | Generated: ${generatedAt}`;

  const metadataRows = [
    { key: "Document Type", value: toStringValue(metadata.doc_type || params.docType) },
    { key: "Document Version", value: toStringValue(metadata.doc_version) },
    { key: "System Name", value: toStringValue(metadata.system_name) },
    { key: "Equipment ID", value: toStringValue(metadata.equipment_id) },
    { key: "Generated At", value: toStringValue(metadata.generated_at) },
    { key: "Generated By", value: toStringValue(metadata.generated_by) }
  ];

  const sections: DocxSection[] = sectionDefs.map((section) => {
    const values = section.populate_from.flatMap((pathExpr) => getPathValues(payload, pathExpr));
    const tableColumns = section.table_layout?.columns ?? [];
    if (section.layout === "table" && tableColumns.length > 0) {
      const tableRows = values.length > 0 ? buildSectionTableRows(values, tableColumns) : [];
      return { heading: section.heading, paragraphs: [], tableColumns, tableRows };
    }

    const paragraphValues = dedupe(
      values
        .map((value) => toStringValue(value))
        .map((value) => value.trim())
        .filter(Boolean)
    );
    return { heading: section.heading, paragraphs: paragraphValues, tableColumns: [], tableRows: [] };
  });

  sections.push({
    heading: "Traceability References",
    paragraphs: [],
    tableColumns: ["requirement_id", "risk_control_id", "test_case_id"],
    tableRows: traceabilityRows.map((row) => [row.requirementId, row.riskControlId, row.testCaseId])
  });

  const signatures = params.signatures ?? [];
  sections.push({
    heading: "Signature Page",
    paragraphs: signatures.length === 0 ? ["No signatures recorded for this version."] : [],
    tableColumns: ["signer_name", "user_id", "meaning", "signed_at", "record_hash", "auth_method", "remarks"],
    tableRows: signatures.map((signature) => [
      signature.signerFullName,
      signature.signerUserId,
      signature.meaning,
      signature.signedAt,
      signature.recordHash,
      signature.authMethod ?? "",
      signature.remarks ?? ""
    ])
  });

  return {
    sectionHeadings: sections.map((section) => section.heading),
    traceabilityRows,
    footerText,
    metadataRows,
    sections,
    signatures,
    primaryContentLineCount: 0
  };
};

const paragraph = (text: string, opts?: { bold?: boolean }) =>
  new Paragraph({
    children: [new TextRun({ text, bold: opts?.bold ?? false })]
  });

const buildTable = (columns: string[], rows: string[][]) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: columns.map((column) =>
          new TableCell({
            children: [paragraph(column, { bold: true })]
          })
        )
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: columns.map((_, idx) =>
              new TableCell({
                children: [paragraph(row[idx] ?? "")]
              })
            )
          })
      )
    ]
  });

export const renderDefaultDocx = async (params: RenderDefaultDocxParams) => {
  const layout = loadLayout(params.docType);
  const model = buildDocxExportModel(params);
  const primaryLines = (params.primaryContent ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  model.primaryContentLineCount = primaryLines.length;

  const children: Array<Paragraph | Table> = [];
  children.push(paragraph(`${layout.titlePrefix}: ${params.title}`, { bold: true }));
  children.push(paragraph(""));
  if (primaryLines.length > 0) {
    children.push(paragraph("Document Content", { bold: true }));
    for (const line of primaryLines) {
      children.push(paragraph(line));
    }
    children.push(
      new Paragraph({
        children: [new PageBreak()]
      })
    );
  }

  children.push(paragraph("Document Metadata", { bold: true }));
  children.push(
    buildTable(
      ["field", "value"],
      model.metadataRows.map((row) => [row.key, row.value])
    )
  );

  for (const section of model.sections) {
    const headingText = `${layout.sectionHeadingPrefix}${section.heading}`;
    children.push(paragraph(""));
    children.push(paragraph(headingText, { bold: true }));
    if (section.tableColumns.length > 0) {
      children.push(buildTable(section.tableColumns, section.tableRows));
    } else if (section.paragraphs.length > 0) {
      for (const line of section.paragraphs) {
        children.push(paragraph(line));
      }
    } else {
      children.push(paragraph("No entries."));
    }
  }

  const doc = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [paragraph(model.footerText)]
          })
        },
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, model };
};
