import { sanitizeUntrustedDocumentText } from "@/server/security/promptGuardrails";

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
    // Stub-safe PDF parsing for MVP portability across environments.
    // Replace with page-aware parser (pdfjs/Document AI) for production citations.
    const text = sanitizeUntrustedDocumentText(buffer.toString("latin1"));
    return {
      fullText: text,
      chunks: splitIntoChunks(text, 1)
    };
  }

  const text = sanitizeUntrustedDocumentText(buffer.toString("utf8"));
  return {
    fullText: text,
    chunks: splitIntoChunks(text, 1)
  };
};
