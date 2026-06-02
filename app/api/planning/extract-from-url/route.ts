import { NextResponse } from "next/server";
import { extractTextFromPdfBytes } from "@/lib/planningPdfText";
import { extractPlanningRulesFromText } from "@/lib/planningTextExtractor";
import { extractPlanningLinkCandidatesFromHtml } from "@/lib/planningUrlCandidates";
import { fetchContentFromPublicUrl, fetchTextFromPublicUrl } from "@/lib/safeUrlFetch";

export const runtime = "nodejs";

const REMOTE_PDF_MAX_BYTES = 20_000_000;
const REMOTE_PDF_SIZE_MESSAGE =
  "El PDF supera el tamaño máximo de extracción automática. Descárgalo y súbelo manualmente o usa una versión más ligera.";

interface ExtractFromUrlRequest {
  url?: string;
  selectedUrl?: string;
  selectedSourceType?: "pdf" | "html";
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr|td)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function shouldSuggestCandidates(confidence: string, hasUsefulData: boolean): boolean {
  return confidence === "low" || !hasUsefulData;
}

async function extractFromPdfUrl(targetUrl: string) {
  const fetched = await fetchContentFromPublicUrl(targetUrl, {
    allowedContentTypes: ["application/pdf"],
    maxBytes: REMOTE_PDF_MAX_BYTES,
    sizeExceededMessage: REMOTE_PDF_SIZE_MESSAGE,
  });
  const extractedText = await extractTextFromPdfBytes(fetched.body);

  return {
    extraction: extractPlanningRulesFromText(extractedText, {
      sourceType: "pdf",
      sourceLabel: targetUrl,
    }),
    linkCandidates: [],
  };
}

async function extractFromHtmlOrTextUrl(targetUrl: string) {
  const fetched = await fetchTextFromPublicUrl(targetUrl);
  const extractedText = fetched.contentType.includes("html")
    ? htmlToText(fetched.text)
    : fetched.text.trim();

  if (!extractedText) {
    throw new Error("La URL no devolvió texto utilizable.");
  }

  const extraction = extractPlanningRulesFromText(extractedText, {
    sourceType: "url",
    sourceLabel: targetUrl,
  });

  const linkCandidates =
    fetched.contentType.includes("html") &&
    shouldSuggestCandidates(extraction.confidence, extraction.hasUsefulData)
      ? extractPlanningLinkCandidatesFromHtml(fetched.text, fetched.url)
      : [];

  return {
    extraction,
    linkCandidates,
  };
}

function shouldFetchAsPdf(
  targetUrl: string,
  selectedSourceType?: "pdf" | "html",
): boolean {
  if (selectedSourceType === "pdf") {
    return true;
  }

  try {
    const parsedUrl = new URL(targetUrl);
    return parsedUrl.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as ExtractFromUrlRequest;
  const baseUrl = body.url?.trim();
  const selectedUrl = body.selectedUrl?.trim();
  const selectedSourceType = body.selectedSourceType;
  const targetUrl = selectedUrl || baseUrl;

  if (!targetUrl) {
    return NextResponse.json({ error: "URL no válida." }, { status: 400 });
  }

  try {
    const result = shouldFetchAsPdf(targetUrl, selectedSourceType)
      ? await extractFromPdfUrl(targetUrl)
      : await extractFromHtmlOrTextUrl(targetUrl);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo procesar la URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
