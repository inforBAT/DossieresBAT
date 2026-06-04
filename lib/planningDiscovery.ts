import type { PlanningExtractionConfidence } from "./planningTextExtractor";
import type { PlanningLinkCandidate } from "./planningUrlCandidates";

export type PlanningDiscoveryCandidateKind =
  | "planning_pdf"
  | "zoning_map"
  | "urban_sheet"
  | "municipal_page"
  | "unknown";

export interface PlanningDiscoveryCandidate {
  title: string;
  url: string;
  source: string;
  reason: string;
  confidence: PlanningExtractionConfidence;
  kind: PlanningDiscoveryCandidateKind;
}

export interface PlanningDiscoveryInput {
  municipality?: string;
  address?: string;
  cadastre_reference?: string;
  planning_url?: string;
  current_warnings?: string[];
}

interface DiscoveryQueryTemplate {
  kind: PlanningDiscoveryCandidateKind;
  title: string;
  reason: string;
  confidence: PlanningExtractionConfidence;
  buildQuery: (input: RequiredDiscoveryInput) => string | null;
}

type RequiredDiscoveryInput = {
  municipality: string;
  address: string;
  cadastre_reference: string;
  planning_url: string;
  current_warnings: string[];
};

const DISCOVERY_QUERY_TEMPLATES: DiscoveryQueryTemplate[] = [
  {
    kind: "urban_sheet",
    title: "Buscar ficha urbanistica de la parcela",
    reason:
      "Busqueda contextual para localizar ficha urbanistica usando municipio, direccion y catastro.",
    confidence: "high",
    buildQuery: ({ municipality, address, cadastre_reference }) => {
      if (!municipality) {
        return null;
      }

      const context =
        address || cadastre_reference
          ? `${address} ${cadastre_reference}`.trim()
          : "ficha urbanistica";
      return `${municipality} ficha urbanistica ${context}`.trim();
    },
  },
  {
    kind: "zoning_map",
    title: "Buscar plano de zonificacion aplicable",
    reason:
      "Busqueda contextual para localizar PGOU, zonificacion o ambito aplicable a la parcela.",
    confidence: "medium",
    buildQuery: ({ municipality, address }) => {
      if (!municipality) {
        return null;
      }

      return `${municipality} PGOU plano zonificacion ${address}`.trim();
    },
  },
  {
    kind: "planning_pdf",
    title: "Buscar planeamiento urbanistico municipal",
    reason:
      "Busqueda contextual para localizar normas subsidiarias, planeamiento o ordenanzas del municipio.",
    confidence: "medium",
    buildQuery: ({ municipality, cadastre_reference }) => {
      if (!municipality) {
        return null;
      }

      return `${municipality} normas subsidiarias ficha urbanistica ${cadastre_reference}`.trim();
    },
  },
  {
    kind: "municipal_page",
    title: "Buscar visor o pagina municipal de urbanismo",
    reason:
      "Busqueda contextual para localizar visor urbanistico o pagina municipal con documentacion complementaria.",
    confidence: "low",
    buildQuery: ({ municipality }) => {
      if (!municipality) {
        return null;
      }

      return `${municipality} planeamiento urbanistico visor`.trim();
    },
  },
];

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function uniqueCandidates(
  candidates: PlanningDiscoveryCandidate[],
): PlanningDiscoveryCandidate[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = candidate.url.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function inferKindFromText(value: string): PlanningDiscoveryCandidateKind {
  const normalized = normalizeForMatch(value);

  if (
    normalized.includes("ficha urbanistica") ||
    normalized.includes("ficha de zona")
  ) {
    return "urban_sheet";
  }

  if (
    normalized.includes("zonificacion") ||
    normalized.includes("zoning") ||
    normalized.includes("plano")
  ) {
    return "zoning_map";
  }

  if (
    normalized.includes("pgou") ||
    normalized.includes("planeamiento") ||
    normalized.includes("ordenanza") ||
    normalized.includes(".pdf")
  ) {
    return "planning_pdf";
  }

  if (normalized.includes("urbanismo") || normalized.includes("municipal")) {
    return "municipal_page";
  }

  return "unknown";
}

export function mapLinkCandidatesToDiscoveryCandidates(
  candidates: PlanningLinkCandidate[],
  source = "planning_url",
): PlanningDiscoveryCandidate[] {
  return candidates.map((candidate) => ({
    title: candidate.title,
    url: candidate.url,
    source,
    reason: candidate.reason,
    confidence: candidate.confidence,
    kind:
      candidate.sourceType === "pdf"
        ? "planning_pdf"
        : inferKindFromText(`${candidate.title} ${candidate.reason} ${candidate.url}`),
  }));
}

export function buildPlanningDiscoveryCandidates(
  input: PlanningDiscoveryInput,
): PlanningDiscoveryCandidate[] {
  const normalizedInput: RequiredDiscoveryInput = {
    municipality: input.municipality?.trim() ?? "",
    address: input.address?.trim() ?? "",
    cadastre_reference: input.cadastre_reference?.trim() ?? "",
    planning_url: input.planning_url?.trim() ?? "",
    current_warnings: input.current_warnings ?? [],
  };

  const warningReason = normalizedInput.current_warnings
    .filter(hasText)
    .slice(0, 2)
    .join(" ");

  const candidates = DISCOVERY_QUERY_TEMPLATES.flatMap((template) => {
    const query = template.buildQuery(normalizedInput);
    if (!hasText(query)) {
      return [];
    }

    return [
      {
        title: template.title,
        url: buildSearchUrl(query),
        source: "project_context",
        reason: warningReason
          ? `${template.reason} Avisos actuales: ${warningReason}`
          : template.reason,
        confidence: template.confidence,
        kind: template.kind,
      } satisfies PlanningDiscoveryCandidate,
    ];
  });

  return uniqueCandidates(candidates);
}
