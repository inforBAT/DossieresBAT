import type {
  PlanningCandidateKind,
  PlanningLinkCandidate,
} from "./planningUrlCandidates";
import { extractPlanningLinkCandidatesFromHtml } from "./planningUrlCandidates";
import { fetchTextFromPublicUrl } from "./safeUrlFetch";

interface PlanningDiscoveryInput {
  municipality?: string;
  address?: string;
  cadastreReference?: string;
  planningUrl?: string;
  currentWarnings?: string[];
}

const SEARCH_RESULT_HOST = "duckduckgo.com";
const DISCOVERY_KEYWORDS = [
  "ficha urbanistica",
  "pgou",
  "normas subsidiarias",
  "planeamiento",
  "zonificacion",
  "ordenanza",
  "catastro",
];

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectSourceTypeFromUrl(url: URL): "pdf" | "html" {
  return url.pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "html";
}

function inferCandidateKind(
  title: string,
  url: URL,
  sourceType: "pdf" | "html",
): PlanningCandidateKind {
  const haystack = normalizeText(`${title} ${url.pathname} ${url.search}`);

  if (haystack.includes("ficha urban")) {
    return "urban_sheet";
  }

  if (
    haystack.includes("zonificacion") ||
    haystack.includes("plano") ||
    haystack.includes("ordenacion pormenorizada")
  ) {
    return "zoning_map";
  }

  if (sourceType === "pdf") {
    return "planning_pdf";
  }

  if (
    haystack.includes("pgou") ||
    haystack.includes("plan general") ||
    haystack.includes("normas subsidiarias") ||
    haystack.includes("planeamiento")
  ) {
    return "municipal_page";
  }

  return "unknown";
}

function buildSearchQueries(input: PlanningDiscoveryInput): string[] {
  const municipality = input.municipality?.trim() ?? "";
  const address = input.address?.trim() ?? "";
  const cadastreReference = input.cadastreReference?.trim() ?? "";
  const locationHint = address || cadastreReference || "parcela";

  return [
    `${municipality} ficha urbanistica ${locationHint}`.trim(),
    `${municipality} PGOU plano zonificacion ${locationHint}`.trim(),
    `${municipality} normas subsidiarias ficha urbanistica`.trim(),
    `${municipality} ordenanza zona ${cadastreReference}`.trim(),
    `${municipality} planeamiento urbanistico visor`.trim(),
  ].filter((query, index, list) => hasText(query) && list.indexOf(query) === index);
}

function unwrapSearchResultUrl(url: URL): URL {
  const uddg = url.searchParams.get("uddg");
  if (hasText(uddg)) {
    try {
      return new URL(uddg);
    } catch {
      return url;
    }
  }

  return url;
}

function scoreCandidate(title: string, url: URL): { score: number; reasons: string[] } {
  const haystack = normalizeText(`${title} ${url.pathname} ${url.search}`);
  let score = 0;
  const reasons: string[] = [];

  if (url.pathname.toLowerCase().endsWith(".pdf")) {
    score += 4;
    reasons.push("pdf");
  }

  for (const keyword of DISCOVERY_KEYWORDS) {
    if (haystack.includes(normalizeText(keyword))) {
      score += 2;
      reasons.push(keyword);
    }
  }

  if (normalizeText(url.hostname).includes("urban")) {
    score += 1;
    reasons.push("dominio urbanistico");
  }

  return { score, reasons };
}

function confidenceFromScore(score: number): "low" | "medium" | "high" {
  if (score >= 8) {
    return "high";
  }

  if (score >= 4) {
    return "medium";
  }

  return "low";
}

function parseSearchResultAnchors(html: string): PlanningLinkCandidate[] {
  const candidates: PlanningLinkCandidate[] = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = match[1]?.trim() ?? "";
    const title = match[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    if (!rawHref || !title) {
      continue;
    }

    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(rawHref, `https://${SEARCH_RESULT_HOST}`);
    } catch {
      continue;
    }

    const targetUrl = unwrapSearchResultUrl(resolvedUrl);
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      continue;
    }

    if (normalizeText(targetUrl.hostname).includes(SEARCH_RESULT_HOST)) {
      continue;
    }

    const sourceType = detectSourceTypeFromUrl(targetUrl);
    const { score, reasons } = scoreCandidate(title, targetUrl);
    if (score <= 0) {
      continue;
    }

    candidates.push({
      title,
      url: targetUrl.toString(),
      sourceType,
      confidence: confidenceFromScore(score),
      reason: reasons.join(", "),
      source: SEARCH_RESULT_HOST,
      kind: inferCandidateKind(title, targetUrl, sourceType),
    });
  }

  return candidates;
}

function uniqueCandidates(candidates: PlanningLinkCandidate[]): PlanningLinkCandidate[] {
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

function sortCandidates(candidates: PlanningLinkCandidate[]): PlanningLinkCandidate[] {
  const weight = { low: 0, medium: 1, high: 2 };
  return [...candidates].sort((left, right) => {
    if (weight[right.confidence] !== weight[left.confidence]) {
      return weight[right.confidence] - weight[left.confidence];
    }

    return left.title.localeCompare(right.title, "es");
  });
}

async function discoverFromPlanningUrl(planningUrl: string): Promise<PlanningLinkCandidate[]> {
  const fetched = await fetchTextFromPublicUrl(planningUrl, {
    allowedContentTypes: ["text/html", "application/xhtml+xml"],
    maxBytes: 1_000_000,
  });

  if (!fetched.contentType.includes("html")) {
    return [];
  }

  return extractPlanningLinkCandidatesFromHtml(fetched.text, fetched.url);
}

async function discoverFromSearchQueries(
  queries: string[],
): Promise<PlanningLinkCandidate[]> {
  const results: PlanningLinkCandidate[] = [];

  for (const query of queries.slice(0, 3)) {
    const searchUrl = `https://${SEARCH_RESULT_HOST}/html/?q=${encodeURIComponent(query)}`;
    try {
      const fetched = await fetchTextFromPublicUrl(searchUrl, {
        allowedContentTypes: ["text/html", "application/xhtml+xml"],
        maxBytes: 1_000_000,
      });
      results.push(...parseSearchResultAnchors(fetched.text));
    } catch {
      continue;
    }
  }

  return results;
}

export async function discoverPlanningCandidates(
  input: PlanningDiscoveryInput,
): Promise<{ candidates: PlanningLinkCandidate[]; warnings: string[] }> {
  const warnings: string[] = [];
  const queries = buildSearchQueries(input);
  const candidateGroups: PlanningLinkCandidate[][] = [];

  if (hasText(input.planningUrl)) {
    try {
      candidateGroups.push(await discoverFromPlanningUrl(input.planningUrl));
    } catch {
      warnings.push(
        "No se pudieron ampliar candidatos desde la URL de normativa existente.",
      );
    }
  }

  if (queries.length === 0) {
    warnings.push(
      "Faltan municipio, direccion y referencia catastral para afinar la busqueda automatica.",
    );
  } else {
    const searchCandidates = await discoverFromSearchQueries(queries);
    if (searchCandidates.length === 0) {
      warnings.push(
        "No se han encontrado documentos complementarios automaticamente. Sube manualmente ficha urbanistica, PGOU o plano de zonificacion.",
      );
    }
    candidateGroups.push(searchCandidates);
  }

  return {
    candidates: sortCandidates(uniqueCandidates(candidateGroups.flat())).slice(0, 12),
    warnings,
  };
}
