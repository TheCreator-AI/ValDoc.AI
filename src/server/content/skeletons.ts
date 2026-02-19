import ursV1 from "../../../content/skeletons/urs.v1.json";
import raV1 from "../../../content/skeletons/ra.v1.json";
import ioqV1 from "../../../content/skeletons/ioq.v1.json";
import oqV1 from "../../../content/skeletons/oq.v1.json";
import summaryReportV1 from "../../../content/skeletons/summary-report.v1.json";

export type SkeletonDocType = "URS" | "RA" | "IOQ" | "OQ" | "SUMMARY_REPORT";

type SkeletonSection = {
  id: string;
  order: number;
  heading: string;
  populate_from: string[];
  layout: "text" | "table" | "checklist";
  table_layout?: {
    columns: string[];
  };
};

export type DocumentSkeleton = {
  doc_type: SkeletonDocType;
  version: string;
  sections: SkeletonSection[];
};

const skeletons: Record<SkeletonDocType, DocumentSkeleton> = {
  URS: ursV1 as DocumentSkeleton,
  RA: raV1 as DocumentSkeleton,
  IOQ: ioqV1 as DocumentSkeleton,
  OQ: oqV1 as DocumentSkeleton,
  SUMMARY_REPORT: summaryReportV1 as DocumentSkeleton
};

export const listSkeletonDocTypes = (): SkeletonDocType[] => {
  return ["URS", "RA", "IOQ", "OQ", "SUMMARY_REPORT"];
};

export const getSkeleton = (docType: SkeletonDocType): DocumentSkeleton => {
  return skeletons[docType];
};
