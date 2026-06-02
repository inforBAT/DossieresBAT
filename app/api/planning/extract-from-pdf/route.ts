import { NextResponse } from "next/server";
import { extractTextFromPdfBytes } from "@/lib/planningPdfText";
import { extractPlanningRulesFromText } from "@/lib/planningTextExtractor";

export const runtime = "nodejs";

const MAX_LOCAL_PDF_BYTES = 20_000_000;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se ha recibido ningun archivo PDF." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "El extractor PDF solo esta disponible para archivos .pdf." },
        { status: 400 },
      );
    }

    if (file.size > MAX_LOCAL_PDF_BYTES) {
      return NextResponse.json(
        {
          error:
            "El PDF supera el tamaño máximo de extracción automática. Prueba con una versión más ligera.",
        },
        { status: 400 },
      );
    }

    const text = await extractTextFromPdfBytes(new Uint8Array(await file.arrayBuffer()));
    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "PDF sin texto extraible; introduce valores manualmente o sube una version textual.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      extraction: extractPlanningRulesFromText(text, {
        sourceType: "pdf",
        sourceLabel: sourceLabel || file.name,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo extraer texto del PDF.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
