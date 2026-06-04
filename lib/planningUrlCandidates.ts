import type { PlanningExtractionConfidence } from "./planningTextExtractor";

export type PlanningCandidateSourceType = "pdf" | "html";
export type PlanningCandidateKind =
  | "planning_pdf"
  | "zoning_map"
  | "urban_sheet"
  | "municipal_page"
  | "unknown";

export interface PlanningLinkCandidate {
  title: string;
  url: string;
  sourceType: PlanningCandidateSourceType;
  confidence: PlanningExtractionConfidence;
  reason: string;
  source: string;
  kind: PlanningCandidateKind;
}

interface RankedPlanningCandidate extends PlanningLinkCandidate {
  score: number;
}

const PLANNING_KEYWORDS = [
  "pgou",
  "plan general",
  "normas subsidiarias",
  "ordenanzas urbanisticas",
  "ordenanza",
  "planeamiento",
  "urbanismo",
  "edificabilidad",
  "retranqueo",
  "alero",
  "cumbrera",
  "ficha urbanistica",
  "geoportal",
  "visor",
  "catastro",
];

const OFFICIAL_HOST_HINTS = [
  "ayuntamiento",
  "ayto",
  "sede",
  "sedeelectronica",
  "urbanismo",
  "planeamiento",
  "geoportal",
  "catastro",
  "diputacion",
  "dipu",
  "gob",
  "gva",
  "junta",
  "xunta",
  "euskadi",
  "navarra",
  "rioja",
  "asturias",
  "madrid",
  "andalucia",
  "catalunya",
  "canarias",
  "castillalamancha",
  "castillayleon",
  "murcia",
  "extremadura",
  "aragon",
  "cantabria",
  "balears",
  "illesbalears",
  "dipcas",
  "seu",
];

const OFFICIAL_PATH_HINTS = [
  "urbanismo",
  "planeamiento",
  "geoportal",
  "visor",
  "sedeelectronica",
  "sede-electronica",
  "catastro",
  "cartografia",
];

const COMMERCIAL_HOST_HINTS = [
  "idealista",
  "fotocasa",
  "habitaclia",
  "yaencontre",
  "pisos",
  "portalinmobiliario",
  "milanuncios",
  "wallapop",
];

const GENERIC_LOW_QUALITY_HINTS = [
  "blog",
  "foro",
  "forum",
  "wordpress",
  "blogspot",
  "medium",
  "wixsite",
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uniqueByUrl(candidates: PlanningLinkCandidate[]): PlanningLinkCandidate[] {
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

function sameDomain(left: URL, right: URL): boolean {
  return (
    left.hostname.replace(/^www\./, "") === right.hostname.replace(/^www\./, "")
  );
}

function inferCandidateKind(
  haystack: string,
  sourceType: PlanningCandidateSourceType,
): PlanningCandidateKind {
  if (haystack.includes("ficha urban")) {
    return "urban_sheet";
  }

  if (
    haystack.includes("zonificacion") ||
    haystack.includes("zoning") ||
    haystack.includes("plano") ||
    haystack.includes("geoportal") ||
    haystack.includes("visor")
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

function confidenceFromScore(score: number): PlanningExtractionConfidence {
  if (score >= 12) {
    return "high";
  }
  if (score >= 6) {
    return "medium";
  }
  return "low";
}

function pushReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function countPlanningKeywordMatches(haystack: string): number {
  let matches = 0;

  for (const keyword of PLANNING_KEYWORDS) {
    if (haystack.includes(normalizeText(keyword))) {
      matches += 1;
    }
  }

  return matches;
}

function scoreOfficialSignals(
  hostname: string,
  pathname: string,
  reasons: string[],
): number {
  let score = 0;

  if (
    OFFICIAL_HOST_HINTS.some((hint) => hostname.includes(hint)) ||
    /\.(gob\.es|edu\.es|catastro\.gob\.es)$/.test(hostname)
  ) {
    score += 8;
    pushReason(reasons, "fuente oficial municipal");
  }

  if (hostname.includes("sede") || pathname.includes("sede")) {
    score += 5;
    pushReason(reasons, "sede electronica");
  }

  if (hostname.includes("catastro") || pathname.includes("catastro")) {
    score += 5;
    pushReason(reasons, "catastro");
  }

  if (pathname.includes("geoportal") || hostname.includes("geoportal")) {
    score += 5;
    pushReason(reasons, "geoportal");
  }

  if (pathname.includes("visor") || hostname.includes("visor")) {
    score += 5;
    pushReason(reasons, "visor urbanistico");
  }

  if (
    OFFICIAL_PATH_HINTS.some((hint) => pathname.includes(hint)) ||
    pathname.includes("urbanismo") ||
    pathname.includes("planeamiento")
  ) {
    score += 4;
    pushReason(reasons, "planeamiento urbanistico");
  }

  return score;
}

function scorePenaltySignals(
  hostname: string,
  haystack: string,
  reasons: string[],
): number {
  let penalty = 0;

  if (COMMERCIAL_HOST_HINTS.some((hint) => hostname.includes(hint))) {
    penalty += 8;
    pushReason(reasons, "posible fuente comercial penalizada");
  }

  if (GENERIC_LOW_QUALITY_HINTS.some((hint) => haystack.includes(hint))) {
    penalty += 5;
    pushReason(reasons, "posible blog o foro penalizado");
  }

  if (
    haystack.includes("seo") ||
    haystack.includes("marketing") ||
    haystack.includes("inmobiliaria")
  ) {
    penalty += 4;
    pushReason(reasons, "posible portal generico penalizado");
  }

  return penalty;
}

function scoreBaseContextSignals(
  baseUrl: URL | undefined,
  resolvedUrl: URL,
  reasons: string[],
): number {
  if (!baseUrl || !sameDomain(baseUrl, resolvedUrl)) {
    return 0;
  }

  const baseHost = normalizeText(baseUrl.hostname);
  const basePath = normalizeText(baseUrl.pathname);
  const looksOfficialBase =
    OFFICIAL_HOST_HINTS.some((hint) => baseHost.includes(hint)) ||
    OFFICIAL_PATH_HINTS.some((hint) => basePath.includes(hint)) ||
    /\.(es|eus|cat)$/i.test(baseUrl.hostname);

  if (!looksOfficialBase) {
    return 0;
  }

  pushReason(reasons, "fuente oficial municipal");
  return 5;
}

export function buildPlanningLinkCandidate(
  title: string,
  resolvedUrl: URL,
  source: string,
  baseUrl?: URL,
): RankedPlanningCandidate | null {
  const sourceType = resolvedUrl.pathname.toLowerCase().endsWith(".pdf")
    ? "pdf"
    : "html";
  const hostname = normalizeText(resolvedUrl.hostname);
  const pathname = normalizeText(resolvedUrl.pathname);
  const haystack = normalizeText(`${title} ${resolvedUrl.pathname} ${resolvedUrl.search}`);
  const reasons: string[] = [];
  let relevanceScore = 0;
  let rankingScore = 0;

  if (baseUrl && sameDomain(baseUrl, resolvedUrl)) {
    relevanceScore += 3;
    rankingScore += 3;
    pushReason(reasons, "mismo dominio");
  }

  if (sourceType === "pdf") {
    relevanceScore += 4;
    rankingScore += 4;
    pushReason(reasons, "pdf");
  }

  const keywordMatches = countPlanningKeywordMatches(haystack);
  if (keywordMatches > 0) {
    relevanceScore += keywordMatches * 2;
    rankingScore += keywordMatches * 2;

    for (const keyword of PLANNING_KEYWORDS) {
      if (haystack.includes(normalizeText(keyword))) {
        pushReason(reasons, keyword);
      }
    }
  }

  const officialScore = scoreOfficialSignals(hostname, pathname, reasons);
  const baseContextScore = scoreBaseContextSignals(baseUrl, resolvedUrl, reasons);
  const penaltyScore = scorePenaltySignals(hostname, haystack, reasons);

  relevanceScore += officialScore + baseContextScore;
  rankingScore += officialScore + baseContextScore;
  rankingScore -= penaltyScore;

  if (relevanceScore <= 0) {
    return null;
  }

  const score = Math.max(1, rankingScore);

  return {
    title,
    url: resolvedUrl.toString(),
    sourceType,
    confidence: confidenceFromScore(score),
    reason: reasons.join(", "),
    source,
    kind: inferCandidateKind(haystack, sourceType),
    score,
  };
}

export function sortPlanningLinkCandidates(
  candidates: PlanningLinkCandidate[],
): PlanningLinkCandidate[] {
  const weight = { low: 0, medium: 1, high: 2 };
  return [...candidates].sort((left, right) => {
    if (weight[right.confidence] !== weight[left.confidence]) {
      return weight[right.confidence] - weight[left.confidence];
    }

    const rightScore = "score" in right && typeof right.score === "number" ? right.score : 0;
    const leftScore = "score" in left && typeof left.score === "number" ? left.score : 0;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.title.localeCompare(right.title, "es");
  });
}

export function extractPlanningLinkCandidatesFromHtml(
  html: string,
  baseUrl: URL,
): PlanningLinkCandidate[] {
  const anchorPattern =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const rawCandidates: PlanningLinkCandidate[] = [];

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1]?.trim() ?? "";
    const rawLabel =
      match[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    if (!href) {
      continue;
    }

    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(href, baseUrl);
    } catch {
      continue;
    }

    if (!["http:", "https:"].includes(resolvedUrl.protocol)) {
      continue;
    }

    const candidate = buildPlanningLinkCandidate(
      rawLabel ||
        resolvedUrl.pathname.split("/").filter(Boolean).pop() ||
        resolvedUrl.hostname,
      resolvedUrl,
      baseUrl.hostname,
      baseUrl,
    );

    if (!candidate) {
      continue;
    }

    rawCandidates.push(candidate);
  }

  return sortPlanningLinkCandidates(uniqueByUrl(rawCandidates));
}
