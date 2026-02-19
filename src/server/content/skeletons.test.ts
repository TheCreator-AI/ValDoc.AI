import { describe, expect, it } from "vitest";
import {
  getSkeleton,
  listSkeletonDocTypes,
  type SkeletonDocType
} from "@/server/content/skeletons";

const requiredHeadingsByDocType: Record<SkeletonDocType, string[]> = {
  URS: ["Purpose", "User Requirements", "Revision History", "Approvals and Signatures"],
  RA: ["Purpose", "Risk Register", "Revision History", "Approvals and Signatures"],
  IOQ: ["Purpose", "Test Cases", "Revision History", "Approvals and Signatures"],
  OQ: ["Purpose", "Test Cases", "Revision History", "Approvals and Signatures"],
  SUMMARY_REPORT: ["Purpose", "Execution Summary", "Revision History", "Approvals and Signatures"]
};

describe("skeleton library", () => {
  it("includes all required document types", () => {
    expect(listSkeletonDocTypes()).toEqual(["URS", "RA", "IOQ", "OQ", "SUMMARY_REPORT"]);
  });

  it("enforces required sections and stable ordering per skeleton", () => {
    for (const docType of listSkeletonDocTypes()) {
      const skeleton = getSkeleton(docType);
      const headings = skeleton.sections.map((section) => section.heading);
      const orders = skeleton.sections.map((section) => section.order);

      for (const requiredHeading of requiredHeadingsByDocType[docType]) {
        expect(headings).toContain(requiredHeading);
      }

      const sortedOrders = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sortedOrders);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });

  it("uses revision history and approvals placeholders consistently", () => {
    for (const docType of listSkeletonDocTypes()) {
      const skeleton = getSkeleton(docType);
      const revisionHistory = skeleton.sections.find((section) => section.id === "revision_history");
      const approvals = skeleton.sections.find((section) => section.id === "approvals_signatures");

      expect(revisionHistory).toBeDefined();
      expect(approvals).toBeDefined();
      expect(revisionHistory?.populate_from).toContain("revision_history[]");
      expect(approvals?.populate_from).toContain("approvals[]");
      expect(approvals?.populate_from).toContain("signatures[]");
    }
  });
});
