import { NextResponse } from "next/server";
import {
  buildPlanningDiscoveryCandidates,
  type PlanningDiscoveryCandidate,
  mapLinkCandidatesToDiscoveryCandidates,
} from "@/lib/planningDiscovery";
import { extractPlanningLinkCandidatesFromHtml } from "@/lib/planningUrlCandidates";
import { fetchTextFromPublicUrl } from "@/lib/safeUrlFetch";

export const runtime = "nodejs";

interface PlanningDiscoverRequest {
  municipality?: string;
  address?: string;
  cadastre_reference?: string;
  planning_url?: string;
  current_warnings?: string[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as PlanningDiscoverRequest;
  const warnings: string[] = [];
  const contextualCandidates = buildPlanningDiscoveryCandidates(body);
  const planningUrl = body.planning_url?.trim() ?? "";
  let linkedCandidates: PlanningDiscoveryCandidate[] = [];

  if (planningUrl) {
    try {
      const fetched = await fetchTextFromPublicUrl(planningUrl);
      linkedCandidates = fetched.contentType.includes("html")
        ? mapLinkCandidatesToDiscoveryCandidates(
            extractPlanningLinkCandidatesFromHtml(fetched.text, fetched.url),
          )
        : [];
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "No se pudo revisar la URL inicial de normativa.",
      );
    }
  }

  const candidates = [...linkedCandidates, ...contextualCandidates].filter(
    (candidate, index, all) =>
      all.findIndex(
        (other) =>
          other.url.trim().toLowerCase() === candidate.url.trim().toLowerCase(),
      ) === index,
  );

  if (candidates.length === 0) {
    warnings.push(
      "No se han encontrado documentos complementarios automaticamente. Sube manualmente ficha urbanistica, PGOU o plano de zonificacion.",
    );
  } else {
    warnings.push(
      "Se han encontrado posibles documentos complementarios. Revisa y selecciona el que corresponda a la parcela.",
    );
  }

  return NextResponse.json({
    candidates,
    warnings,
  });
}
