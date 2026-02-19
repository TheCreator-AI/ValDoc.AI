import { describe, expect, it } from "vitest";
import {
  generateIoqPayload,
  generateOqPayload,
  generateTraceabilityMatrixPayload
} from "@/server/verification/generator";

const metadata = {
  systemName: "TSX2320FA20",
  equipmentId: "machine_tsx_2320",
  generatedBy: "andrew@qa.org",
  generatedAt: "2026-02-17T10:00:00.000Z"
};

const facts = [
  { key: "line_voltage", value: "120 +/- 10%", units: "V" },
  { key: "ambient_temperature", value: "20-25", units: "C" },
  { key: "firmware_version", value: "v2.4.1", units: null }
];

const ursRequirements = [
  {
    req_id: "URS-001",
    category: "Utilities",
    statement: "System shall support 120 V +/- 10%.",
    acceptance_criteria: "Unit remains operational at nominal voltage range.",
    linked_risk_ids: ["RA-001"]
  },
  {
    req_id: "URS-002",
    category: "Calibration",
    statement: "Temperature probe calibration must be current.",
    acceptance_criteria: "Calibration status is current and documented.",
    linked_risk_ids: ["RA-002"]
  }
];

const raRisks = [
  {
    risk_id: "RA-001",
    controls: ["Input validation (OQ)", "Audit trail (Doc Review)"],
    linked_req_ids: ["URS-001"],
    verification_test_ids: ["VT-001"]
  },
  {
    risk_id: "RA-002",
    controls: ["Calibration management (IQ)"],
    linked_req_ids: ["URS-002"],
    verification_test_ids: ["VT-002"]
  }
];

describe("verification generators", () => {
  it("generates deterministic IOQ payload", () => {
    const first = generateIoqPayload({
      ...metadata,
      facts,
      ursRequirements
    });
    const second = generateIoqPayload({
      ...metadata,
      facts,
      ursRequirements
    });

    expect(first).toEqual(second);
    expect(first).toMatchSnapshot();
  });

  it("generates deterministic OQ payload", () => {
    const first = generateOqPayload({
      ...metadata,
      ursRequirements,
      raRisks
    });
    const second = generateOqPayload({
      ...metadata,
      ursRequirements,
      raRisks
    });

    expect(first).toEqual(second);
    expect(first).toMatchSnapshot();
  });

  it("generates deterministic traceability matrix payload", () => {
    const ioq = generateIoqPayload({
      ...metadata,
      facts,
      ursRequirements
    });
    const oq = generateOqPayload({
      ...metadata,
      ursRequirements,
      raRisks
    });

    const first = generateTraceabilityMatrixPayload({
      ...metadata,
      ursRequirements,
      raRisks,
      ioqTestCases: ioq.test_cases,
      oqTestCases: oq.test_cases,
      outputRefPrefix: "machine_tsx_2320"
    });
    const second = generateTraceabilityMatrixPayload({
      ...metadata,
      ursRequirements,
      raRisks,
      ioqTestCases: ioq.test_cases,
      oqTestCases: oq.test_cases,
      outputRefPrefix: "machine_tsx_2320"
    });

    expect(first).toEqual(second);
    expect(first).toMatchSnapshot();
  });
});
