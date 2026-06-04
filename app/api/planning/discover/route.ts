import { NextResponse } from "next/server";
import { discoverPlanningCandidates } from "@/lib/planningDiscover";

export const runtime = "nodejs";

interface PlanningDiscoverRequest {
  municipality?: string;
  address?: string;
  cadastre_reference?: string;
  planning_url?: string;
  current_warnings?: string[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlanningDiscoverRequest;
    const result = await discoverPlanningCandidates({
      municipality: body.municipality,
      address: body.address,
      cadastreReference: body.cadastre_reference,
      planningUrl: body.planning_url,
      currentWarnings: body.current_warnings,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron buscar documentos complementarios.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
