import { NextResponse } from "next/server";
import { interpretPlanningPdfWithAi } from "@/lib/planningAiInterpreter";
import {
  ingestPlanningPdf,
  type PlanningPdfEndpointError,
} from "@/lib/planningPdfPipeline";

export const runtime = "nodejs";

const MAX_LOCAL_PDF_BYTES = 20_000_000;

function jsonError(error: PlanningPdfEndpointError, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
    const municipality = String(formData.get("municipality") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const cadastreReference = String(
      formData.get("cadastreReference") ?? "",
    ).trim();
    const currentZone = String(formData.get("currentZone") ?? "").trim();
    const currentOrdinance = String(
      formData.get("currentOrdinance") ?? "",
    ).trim();

    if (!(file instanceof File)) {
      return jsonError(
        {
          code: "unsupported_pdf",
          message: "No se ha recibido ningún archivo PDF válido.",
        },
        400,
      );
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return jsonError(
        {
          code: "unsupported_pdf",
          message: "El extractor PDF solo está disponible para archivos .pdf.",
        },
        400,
      );
    }

    if (file.size > MAX_LOCAL_PDF_BYTES) {
      return jsonError(
        {
          code: "pdf_too_large",
          message:
            "El PDF supera el tamaño máximo de extracción automática. Prueba con una versión más ligera.",
        },
        400,
      );
    }

    const ingestion = await ingestPlanningPdf(
      new Uint8Array(await file.arrayBuffer()),
    );
    if (!ingestion.ok) {
      return jsonError(ingestion.error, 400);
    }

    const extraction = await interpretPlanningPdfWithAi(ingestion.value, {
      sourceLabel: sourceLabel || file.name,
      municipality,
      address,
      cadastreReference,
      currentZone,
      currentOrdinance,
    });

    return NextResponse.json({
      extraction,
      ingestion: {
        parser: ingestion.value.parser,
        pageCount: ingestion.value.pages.length,
        chunkCount: ingestion.value.chunks.length,
        warnings: ingestion.value.warnings,
      },
    });
  } catch (error) {
    return jsonError(
      {
        code: "pdf_parser_failed",
        message:
          "No se pudo completar la lectura técnica del PDF. Prueba otra exportación, OCR o un documento con texto seleccionable.",
        details: error instanceof Error ? error.message : String(error),
      },
      400,
    );
  }
}
