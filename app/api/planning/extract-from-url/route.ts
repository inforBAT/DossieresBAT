import { NextResponse } from "next/server";
import { extractPlanningRulesFromText } from "@/lib/planningTextExtractor";
import { fetchTextFromPublicUrl } from "@/lib/safeUrlFetch";

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

  try {
    const fetched = await fetchTextFromPublicUrl(targetUrl);
    const extractedText = fetched.contentType.includes("html")
      ? htmlToText(fetched.text)
      : fetched.text.trim();

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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo procesar la URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
