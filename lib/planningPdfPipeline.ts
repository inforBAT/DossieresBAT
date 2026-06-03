import "server-only";
import type { PlanningExtractionConfidence } from "./planningTextExtractor";

export type PlanningPdfErrorCode =
  | "pdf_parser_failed"
  | "pdf_ocr_required"
  | "pdf_too_large"
  | "unsupported_pdf";

export interface PlanningPdfEndpointError {
  code: PlanningPdfErrorCode;
  message: string;
  details?: string;
}

export interface PlanningPdfPage {
  page: number;
  text: string;
}

export interface PlanningPdfChunk {
  id: string;
  page_start: number;
  page_end: number;
  text: string;
}

export interface PlanningPdfIngestion {
  parser: "pdf-parse" | "pdf2json";
  raw_text: string;
  pages: PlanningPdfPage[];
  chunks: PlanningPdfChunk[];
  warnings: string[];
}

export type PlanningPdfIngestionResult =
  | { ok: true; value: PlanningPdfIngestion }
  | { ok: false; error: PlanningPdfEndpointError };

const MIN_TEXT_LENGTH = 40;
const MAX_CHUNK_LENGTH = 3_200;

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikePdf(data: Uint8Array): boolean {
  if (data.length < 4) {
    return false;
  }

  return (
    data[0] === 0x25 &&
    data[1] === 0x50 &&
    data[2] === 0x44 &&
    data[3] === 0x46
  );
}

function hasMeaningfulExtractedText(text: string): boolean {
  const normalized = normalizeWhitespace(text.replace(/-- \d+ of \d+ --/g, ""));
  const alphaNumericCount = normalized.replace(/[^0-9A-Za-zÀ-ÿ]/g, "").length;
  return normalized.length >= MIN_TEXT_LENGTH && alphaNumericCount >= 20;
}

function joinPages(pages: PlanningPdfPage[]): string {
  return pages
    .filter((page) => page.text.length > 0)
    .map((page) => `[Página ${page.page}]\n${page.text}`)
    .join("\n\n");
}

function chunkPages(pages: PlanningPdfPage[]): PlanningPdfChunk[] {
  const chunks: PlanningPdfChunk[] = [];
  let currentText = "";
  let pageStart = 0;
  let pageEnd = 0;

  for (const page of pages) {
    if (!page.text) {
      continue;
    }

    const pageBlock = `[Página ${page.page}]\n${page.text}`;
    const nextText = currentText ? `${currentText}\n\n${pageBlock}` : pageBlock;

    if (currentText && nextText.length > MAX_CHUNK_LENGTH) {
      chunks.push({
        id: `chunk_${chunks.length + 1}`,
        page_start: pageStart,
        page_end: pageEnd,
        text: currentText,
      });
      currentText = pageBlock;
      pageStart = page.page;
      pageEnd = page.page;
      continue;
    }

    currentText = nextText;
    pageStart = pageStart || page.page;
    pageEnd = page.page;
  }

  if (currentText) {
    chunks.push({
      id: `chunk_${chunks.length + 1}`,
      page_start: pageStart,
      page_end: pageEnd,
      text: currentText,
    });
  }

  return chunks;
}

function normalizePdfParsePages(
  pages: Array<{ num: number; text: string }>,
): PlanningPdfPage[] {
  return pages
    .map((page) => ({
      page: page.num,
      text: normalizeWhitespace(page.text),
    }))
    .filter((page) => page.text.length > 0);
}

function decodePdf2JsonText(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function normalizePdf2JsonPages(data: unknown): PlanningPdfPage[] {
  if (
    typeof data !== "object" ||
    data === null ||
    !("Pages" in data) ||
    !Array.isArray((data as { Pages: unknown[] }).Pages)
  ) {
    return [];
  }

  return (data as { Pages: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }).Pages
    .map((page, index) => ({
      page: index + 1,
      text: normalizeWhitespace(
        (page.Texts ?? [])
          .flatMap((textBlock) => textBlock.R ?? [])
          .map((segment) => decodePdf2JsonText(segment.T ?? ""))
          .join(" "),
      ),
    }))
    .filter((page) => page.text.length > 0);
}

async function extractPagesWithPdfParse(
  data: Uint8Array,
): Promise<PlanningPdfPage[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    return normalizePdfParsePages(result.pages);
  } finally {
    await parser.destroy();
  }
}

async function extractPagesWithPdf2Json(
  data: Uint8Array,
): Promise<PlanningPdfPage[]> {
  const { default: PDFParser } = await import("pdf2json");

  return await new Promise<PlanningPdfPage[]>((resolve, reject) => {
    const parser = new PDFParser();

    parser.once("pdfParser_dataError", (errorData: { parserError?: unknown }) => {
      parser.destroy();
      reject(
        errorData?.parserError instanceof Error
          ? errorData.parserError
          : new Error(String(errorData?.parserError ?? "pdf2json failed")),
      );
    });

    parser.once("pdfParser_dataReady", (pdfData: unknown) => {
      const pages = normalizePdf2JsonPages(pdfData);
      parser.destroy();
      resolve(pages);
    });

    parser.parseBuffer(Buffer.from(data));
  });
}

function buildParserFailedError(errors: Error[]): PlanningPdfEndpointError {
  const details = errors.map((error) => error.message).join(" | ");

  return {
    code: "pdf_parser_failed",
    message:
      "No se ha podido leer técnicamente el PDF con los parsers disponibles. Prueba otra exportación del PDF, OCR o una versión con texto seleccionable.",
    details,
  };
}

export function confidenceFromChunkCoverage(
  chunkCount: number,
): PlanningExtractionConfidence {
  if (chunkCount >= 6) {
    return "high";
  }

  if (chunkCount >= 2) {
    return "medium";
  }

  return "low";
}

export async function ingestPlanningPdf(
  data: Uint8Array,
): Promise<PlanningPdfIngestionResult> {
  if (!looksLikePdf(data)) {
    return {
      ok: false,
      error: {
        code: "unsupported_pdf",
        message:
          "El archivo no parece un PDF válido o está corrupto. Sube un PDF urbanístico exportado correctamente.",
      },
    };
  }

  const parserErrors: Error[] = [];
  const parsers: Array<{
    id: "pdf-parse" | "pdf2json";
    run: (bytes: Uint8Array) => Promise<PlanningPdfPage[]>;
  }> = [
    { id: "pdf-parse", run: extractPagesWithPdfParse },
    { id: "pdf2json", run: extractPagesWithPdf2Json },
  ];

  for (const parser of parsers) {
    try {
      const pages = await parser.run(data);
      const rawText = joinPages(pages);

      if (!hasMeaningfulExtractedText(rawText)) {
        continue;
      }

      return {
        ok: true,
        value: {
          parser: parser.id,
          raw_text: rawText,
          pages,
          chunks: chunkPages(pages),
          warnings: [],
        },
      };
    } catch (error) {
      parserErrors.push(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  if (parserErrors.length === 0) {
    return {
      ok: false,
      error: {
        code: "pdf_ocr_required",
        message:
          "El PDF se ha leído, pero no contiene texto utilizable. Necesita OCR o un documento exportado con texto seleccionable.",
      },
    };
  }

  return {
    ok: false,
    error: buildParserFailedError(parserErrors),
  };
}
