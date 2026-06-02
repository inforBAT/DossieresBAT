import { NextResponse } from "next/server";
import { extractPlanningRulesFromText } from "@/lib/planningTextExtractor";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: string };
  const targetUrl = body.url?.trim();

  if (!targetUrl) {
    return NextResponse.json({ error: "URL no válida." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "URL no válida." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: "Solo se aceptan URLs http o https." },
      { status: 400 },
    );
  }

  const response = await fetch(parsedUrl, {
    headers: {
      "user-agent": "DossieresBAT Planning Extractor/1.0",
      accept: "text/html,text/plain,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `No se pudo descargar la URL (${response.status}).` },
      { status: 400 },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text();
  const extractedText = contentType.includes("html")
    ? htmlToText(bodyText)
    : bodyText.trim();

  if (!extractedText) {
    return NextResponse.json(
      { error: "La URL no devolvió texto utilizable." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    extraction: extractPlanningRulesFromText(extractedText, {
      sourceType: "url",
      sourceLabel: targetUrl,
    }),
  });
}
