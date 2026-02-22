import type { CitationChunk } from "@/server/parsers/pdfParser";
import { validateFactModel } from "@/server/extract/factModelSchema";

export type FactModel = {
  intendedUse: string | null;
  coreFunctions: string[];
  utilities: string[];
  safetyFeatures: string[];
  sensors: string[];
  dataInterfaces: string[];
  softwareVersion: string | null;
  processRanges: Array<{ parameter: string; min: number; max: number; units: string }>;
  citations: Array<{ sourceDocumentId: string; page: number; section: string; evidence: string }>;
};

const findFirstMatch = (chunks: CitationChunk[], patterns: RegExp[]) => {
  for (const chunk of chunks) {
    for (const pattern of patterns) {
      if (pattern.test(chunk.text)) {
        return chunk.text;
      }
    }
  }
  return null;
};

export const extractFactModel = (sourceDocumentId: string, chunks: CitationChunk[]): FactModel => {
  const citations = chunks.slice(0, 8).map((chunk) => ({
    sourceDocumentId,
    page: chunk.page,
    section: chunk.section,
    evidence: chunk.text.slice(0, 220)
  }));

  const intendedUse = findFirstMatch(chunks, [/intended use/i, /designed for/i]);
  const versionLine = findFirstMatch(chunks, [/version/i, /firmware/i, /software/i]);

  const rangeRegex = /(temperature|pressure|flow|ph|speed)[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:to|-|\u2013)\s*(\d+(?:\.\d+)?)\s*([a-zA-Z%]+)/i;
  const processRanges = chunks
    .map((chunk) => {
      const match = chunk.text.match(rangeRegex);
      if (!match) return null;
      return {
        parameter: match[1],
        min: Number(match[2]),
        max: Number(match[3]),
        units: match[4]
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const pullKeywords = (keywords: string[]) => {
    return chunks
      .flatMap((chunk) =>
        keywords.filter((keyword) => new RegExp(`\\b${keyword}\\b`, "i").test(chunk.text))
      )
      .filter((value, index, arr) => arr.indexOf(value) === index);
  };

  return validateFactModel({
    intendedUse,
    coreFunctions: pullKeywords(["mixing", "heating", "cooling", "sterilization", "agitation"]),
    utilities: pullKeywords(["steam", "water", "air", "nitrogen", "power"]),
    safetyFeatures: pullKeywords(["interlock", "alarm", "emergency", "redundant"]),
    sensors: pullKeywords(["temperature", "pressure", "flow", "ph", "conductivity"]),
    dataInterfaces: pullKeywords(["opc", "modbus", "ethernet", "serial", "usb"]),
    softwareVersion: versionLine,
    processRanges,
    citations
  });
};

