import type { PlanningExtractionConfidence } from "./planningTextExtractor";

export type PlanningCandidateSourceType = "pdf" | "html";

export interface PlanningLinkCandidate {
  title: string;
  url: string;
  sourceType: PlanningCandidateSourceType;
  confidence: PlanningExtractionConfidence;
  reason: string;
}

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
  return left.hostname.replace(/^www\./, "") === right.hostname.replace(/^www\./, "");
}

function confidenceFromScore(score: number): PlanningExtractionConfidence {
  if (score >= 8) {
    return "high";
  }
  if (score >= 4) {
    return "medium";
  }
  return "low";
}

const KEYWORDS = [
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
  "pdf",
];

export function extractPlanningLinkCandidatesFromHtml(
  html: string,
  baseUrl: URL,
): PlanningLinkCandidate[] {
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const rawCandidates: PlanningLinkCandidate[] = [];

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1]?.trim() ?? "";
    const rawLabel = match[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
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

    const haystack = normalizeText(
      `${rawLabel} ${resolvedUrl.pathname} ${resolvedUrl.search}`,
    );
    let score = 0;
    const reasons: string[] = [];

    if (sameDomain(baseUrl, resolvedUrl)) {
      score += 3;
      reasons.push("mismo dominio");
    }

    if (resolvedUrl.pathname.toLowerCase().endsWith(".pdf")) {
      score += 4;
      reasons.push("pdf");
    }

    for (const keyword of KEYWORDS) {
      if (haystack.includes(normalizeText(keyword))) {
        score += 2;
        reasons.push(keyword);
      }
    }

    if (score <= 0) {
      continue;
    }

    rawCandidates.push({
      title: rawLabel || resolvedUrl.pathname.split("/").filter(Boolean).pop() || resolvedUrl.hostname,
      url: resolvedUrl.toString(),
      sourceType: resolvedUrl.pathname.toLowerCase().endsWith(".pdf") ? "pdf" : "html",
      confidence: confidenceFromScore(score),
      reason: reasons.join(", "),
    });
  }

  return uniqueByUrl(rawCandidates).sort((left, right) => {
    const weight = { low: 0, medium: 1, high: 2 };
    return weight[right.confidence] - weight[left.confidence] || left.title.localeCompare(right.title, "es");
  });
}
