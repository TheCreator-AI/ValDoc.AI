import { sanitizeUntrustedDocumentText } from "@/server/security/promptGuardrails";
import { PDFParse } from "pdf-parse";

export type CitationChunk = {
  page: number;
  section: string;
  text: string;
};

const splitIntoChunks = (text: string, page: number): CitationChunk[] => {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const chunks: CitationChunk[] = [];

  for (let index = 0; index < lines.length; index += 4) {
    const slice = lines.slice(index, index + 4).join(" ");
    if (slice.length > 0) {
      chunks.push({
        page,
        section: `Section ${Math.floor(index / 4) + 1}`,
        text: slice
      });
    }
  }

  return chunks;
};

export const parseSourceDocument = async (buffer: Buffer, mimeType: string) => {
  if (mimeType === "application/pdf") {
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: new Uint8Array(buffer) });
      const parsed = await parser.getText();
      const normalizedPages =
        parsed.pages.length > 0
          ? parsed.pages.map((pageResult: { text: string }) => sanitizeUntrustedDocumentText(pageResult.text.trim()))
          : parsed.text.split("\f").map((pageText: string) => sanitizeUntrustedDocumentText(pageText.trim()));
      const fullText = normalizedPages.filter(Boolean).join("\n\n");
      return {
        fullText,
        chunks: normalizedPages.flatMap((pageText: string, index: number) => splitIntoChunks(pageText, index + 1))
      };
    } catch {
      const text = sanitizeUntrustedDocumentText(buffer.toString("latin1"));
      return {
        fullText: text,
        chunks: splitIntoChunks(text, 1)
      };
    } finally {
      if (parser) {
        await parser.destroy().catch(() => undefined);
      }
    }
  }

  const text = sanitizeUntrustedDocumentText(buffer.toString("utf8"));
  return {
    fullText: text,
    chunks: splitIntoChunks(text, 1)
  };
};
