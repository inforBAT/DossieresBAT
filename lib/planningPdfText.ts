import "server-only";
import { PDFParse } from "pdf-parse";

async function extractTextFromPdfData(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  const parser = new PDFParse({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
  });

  try {
    const result = await parser.getText();
    return result.text.replace(/\s+\n/g, "\n").trim();
  } finally {
    await parser.destroy();
  }
}
export async function extractTextFromPdfBytes(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  return extractTextFromPdfData(data);
}
