import "server-only";

import {
  formatMeters,
  formatSquareMeters,
  parseMetricNumber,
} from "./planningNormalizer";
import {
  extractPlanningRulesFromText,
  type PlanningExtractionConfidence,
  type PlanningExtractionResult,
} from "./planningTextExtractor";
import type { PlanningRules, PlanningSourceArticle } from "./projectInputSchema";
import type {
  PlanningPdfChunk,
  PlanningPdfIngestion,
} from "./planningPdfPipeline";

interface PlanningAiInterpretationContext {
  sourceLabel: string;
  municipality: string;
  address: string;
  cadastreReference: string;
  currentZone: string;
  currentOrdinance: string;
}

interface PlanningAiPayload {
  document_sufficient?: boolean;
  confidence?: PlanningExtractionConfidence;
  zone?: string;
  ordinance?: string;
  warnings?: string[];
  review_notes?: string[];
  source_articles?: Array<{
    article?: string;
    page?: number | null;
    excerpt?: string;
  }>;
  rules?: Partial<Record<keyof PlanningRules, string | number | null>>;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLocaleLowerCase("es");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result;
}

function uniqueSourceArticles(
  articles: PlanningSourceArticle[],
): PlanningSourceArticle[] {
  const result: PlanningSourceArticle[] = [];
  const seen = new Set<string>();

  for (const article of articles) {
    const key = [
      article.source_label.trim().toLocaleLowerCase("es"),
      article.article.trim().toLocaleLowerCase("es"),
      article.page ?? "",
      article.excerpt.trim().toLocaleLowerCase("es"),
    ].join("|");

    if (!key.replace(/\|/g, "")) {
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      result.push(article);
    }
  }

  return result;
}

function findSourceArticleForExcerpt(
  excerpt: string,
  chunks: PlanningPdfChunk[],
  sourceLabel: string,
): PlanningSourceArticle {
  const normalizedExcerpt = excerpt.trim().toLocaleLowerCase("es");
  const chunk = chunks.find((candidate) =>
    candidate.text.toLocaleLowerCase("es").includes(normalizedExcerpt),
  );

  return {
    source_label: sourceLabel,
    article: "",
    page: chunk?.page_start ?? null,
    excerpt,
  };
}

function parseNullableMetric(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const textValue = typeof value === "string" ? value : "";
  if (!hasText(textValue)) {
    return null;
  }

  return parseMetricNumber(textValue.trim()) ?? null;
}

function parseStringValue(value: string | number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  const textValue = typeof value === "string" ? value : "";
  return hasText(textValue) ? textValue.trim() : "";
}

function normalizeRules(
  rules: PlanningAiPayload["rules"],
): Partial<PlanningRules> {
  if (!rules) {
    return {};
  }

  const buildabilityTotal = parseNullableMetric(rules.buildability_total_m2);
  const buildabilityAboveGround = parseNullableMetric(
    rules.buildability_above_ground_m2,
  );
  const buildabilityBelowGround = parseNullableMetric(
    rules.buildability_below_ground_m2,
  );
  const maxHeightEaves = parseNullableMetric(rules.max_height_eaves_m);
  const maxHeightRidge = parseNullableMetric(rules.max_height_ridge_m);
  const setbackBoundary = parseNullableMetric(rules.setback_boundary_m);
  const setbackStreet = parseNullableMetric(rules.setback_street_m);

  return {
    buildability_total_m2: buildabilityTotal,
    buildability_total_m2_display:
      buildabilityTotal !== null ? formatSquareMeters(buildabilityTotal) : "",
    buildability_above_ground_m2: buildabilityAboveGround,
    buildability_above_ground_m2_display:
      buildabilityAboveGround !== null
        ? formatSquareMeters(buildabilityAboveGround)
        : "",
    buildability_below_ground_m2: buildabilityBelowGround,
    buildability_below_ground_m2_display:
      buildabilityBelowGround !== null
        ? formatSquareMeters(buildabilityBelowGround)
        : "",
    occupancy: parseStringValue(rules.occupancy),
    max_floors: parseStringValue(rules.max_floors),
    max_height_eaves_m: maxHeightEaves,
    max_height_eaves_m_display:
      maxHeightEaves !== null ? formatMeters(maxHeightEaves) : "",
    max_height_ridge_m: maxHeightRidge,
    max_height_ridge_m_display:
      maxHeightRidge !== null ? formatMeters(maxHeightRidge) : "",
    setback_boundary_m: setbackBoundary,
    setback_boundary_m_display:
      setbackBoundary !== null ? formatMeters(setbackBoundary) : "",
    setback_street_m: setbackStreet,
    setback_street_m_display:
      setbackStreet !== null ? formatMeters(setbackStreet) : "",
  };
}

function buildDefaultWarnings(
  payload: PlanningAiPayload | null,
  context: PlanningAiInterpretationContext,
  hasUsefulData: boolean,
): string[] {
  const warnings = uniqueStrings(payload?.warnings ?? []);

  if (!hasText(context.cadastreReference) && !hasText(context.address)) {
    warnings.push(
      "Falta contexto de parcela para decidir si esta normativa aplica exactamente a la finca concreta.",
    );
  }

  if (!hasText(payload?.zone) && !hasText(context.currentZone)) {
    warnings.push(
      "No se ha identificado una zona urbanística concreta. Puede faltar la ficha de zona o PGOU aplicable.",
    );
  }

  if (!hasText(payload?.ordinance) && !hasText(context.currentOrdinance)) {
    warnings.push(
      "No se ha identificado una ordenanza o ficha concreta de planeamiento para la parcela.",
    );
  }

  if (!hasUsefulData) {
    warnings.push(
      "Documento leído, pero no contiene parámetros urbanísticos suficientes para la parcela. Falta documento de planeamiento/ficha de zona.",
    );
  }

  return warnings;
}

function buildHeuristicFallback(
  ingestion: PlanningPdfIngestion,
  context: PlanningAiInterpretationContext,
  warning?: string,
): PlanningExtractionResult {
  const heuristic = extractPlanningRulesFromText(ingestion.raw_text, {
    sourceType: "pdf",
    sourceLabel: context.sourceLabel,
  });

  const hasUsefulData = heuristic.hasUsefulData;
  const warnings = buildDefaultWarnings(
    {
      zone: heuristic.zone,
      ordinance: heuristic.ordinance,
      warnings: warning ? [warning, ...heuristic.warnings] : heuristic.warnings,
    },
    context,
    hasUsefulData,
  );

  return {
    ...heuristic,
    confidence: hasUsefulData ? heuristic.confidence : "low",
    warnings,
    sourceArticles: uniqueSourceArticles(
      heuristic.sourceArticles.map((article) => ({
        ...article,
        source_label: article.source_label || context.sourceLabel,
        page:
          article.page ??
          findSourceArticleForExcerpt(
            article.excerpt,
            ingestion.chunks,
            context.sourceLabel,
          ).page,
      })),
    ),
    reviewNotes: warning ? [warning] : [],
  };
}

function aiClientConfig() {
  const apiKey = process.env.PLANNING_AI_API_KEY || process.env.OPENAI_API_KEY || "";
  const model = process.env.PLANNING_AI_MODEL || process.env.OPENAI_MODEL || "";
  const apiUrl =
    process.env.PLANNING_AI_API_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1/chat/completions";

  return {
    apiKey,
    model,
    apiUrl,
    enabled: Boolean(apiKey && model),
  };
}

function aiSystemPrompt(): string {
  return [
    "Eres un analista urbanístico que interpreta normativa a partir de texto extraído de PDFs.",
    "Devuelve exclusivamente JSON válido.",
    "No inventes datos urbanísticos no presentes en el documento.",
    "Si el documento no contiene datos suficientes, marca document_sufficient=false y explica la carencia en warnings.",
    "Nunca confirmes la normativa del usuario ni afirmes que está validada.",
    "Busca únicamente: zona, ordenanza, edificabilidad total/sobre rasante/bajo rasante, ocupación, número máximo de plantas, altura de alero, altura de cumbrera, retranqueos a linderos y a calle.",
    "Incluye source_articles con article, page y excerpt cuando cites una regla.",
  ].join(" ");
}

function aiUserPrompt(
  ingestion: PlanningPdfIngestion,
  context: PlanningAiInterpretationContext,
): string {
  return JSON.stringify(
    {
      task: "Interpretar normativa urbanística en JSON estricto",
      context,
      parser: ingestion.parser,
      chunks: ingestion.chunks,
      expected_json_shape: {
        document_sufficient: true,
        confidence: "low | medium | high",
        zone: "",
        ordinance: "",
        rules: {
          buildability_total_m2: null,
          buildability_above_ground_m2: null,
          buildability_below_ground_m2: null,
          occupancy: "",
          max_floors: "",
          max_height_eaves_m: null,
          max_height_ridge_m: null,
          setback_boundary_m: null,
          setback_street_m: null,
        },
        source_articles: [
          {
            article: "",
            page: null,
            excerpt: "",
          },
        ],
        warnings: [""],
        review_notes: [""],
      },
    },
    null,
    2,
  );
}

function parseMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item === "object" &&
        item !== null &&
        "text" in item &&
        typeof (item as { text?: unknown }).text === "string"
          ? ((item as { text: string }).text)
          : "",
      )
      .join("\n");
  }

  return "";
}

async function requestAiInterpretation(
  ingestion: PlanningPdfIngestion,
  context: PlanningAiInterpretationContext,
): Promise<PlanningAiPayload | null> {
  const config = aiClientConfig();
  if (!config.enabled) {
    return null;
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: aiSystemPrompt(),
        },
        {
          role: "user",
          content: aiUserPrompt(ingestion, context),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI interpreter HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };
  const content = parseMessageContent(payload.choices?.[0]?.message?.content);

  if (!hasText(content)) {
    throw new Error("AI interpreter returned empty content.");
  }

  return JSON.parse(content) as PlanningAiPayload;
}

function buildAiSourceArticles(
  payload: PlanningAiPayload,
  context: PlanningAiInterpretationContext,
  chunks: PlanningPdfChunk[],
): PlanningSourceArticle[] {
  return uniqueSourceArticles(
    (payload.source_articles ?? []).map((article) => ({
      source_label: context.sourceLabel,
      article: hasText(article.article) ? article.article.trim() : "",
      page:
        typeof article.page === "number" && Number.isFinite(article.page)
          ? article.page
          : findSourceArticleForExcerpt(
              parseStringValue(article.excerpt),
              chunks,
              context.sourceLabel,
            ).page,
      excerpt: parseStringValue(article.excerpt),
    })),
  );
}

export async function interpretPlanningPdfWithAi(
  ingestion: PlanningPdfIngestion,
  context: PlanningAiInterpretationContext,
): Promise<PlanningExtractionResult> {
  try {
    const aiPayload = await requestAiInterpretation(ingestion, context);
    if (!aiPayload) {
      return buildHeuristicFallback(
        ingestion,
        context,
        "Interpretación IA no configurada; se ha aplicado el extractor heurístico local.",
      );
    }

    const rules = normalizeRules(aiPayload.rules);
    const hasUsefulData = Object.values(rules).some((value) =>
      typeof value === "number"
        ? Number.isFinite(value)
        : hasText(typeof value === "string" ? value : ""),
    );
    const warnings = buildDefaultWarnings(aiPayload, context, hasUsefulData);

    return {
      sourceType: "pdf",
      sourceLabel: context.sourceLabel,
      confidence: aiPayload.confidence ?? "low",
      hasUsefulData,
      zone: parseStringValue(aiPayload.zone),
      ordinance: parseStringValue(aiPayload.ordinance),
      rules,
      rawMatches: [],
      warnings,
      sourceArticles: buildAiSourceArticles(aiPayload, context, ingestion.chunks),
      reviewNotes: uniqueStrings(aiPayload.review_notes ?? []),
    };
  } catch (error) {
    return buildHeuristicFallback(
      ingestion,
      context,
      error instanceof Error
        ? `La interpretación IA no se pudo completar. Se aplica extractor heurístico local: ${error.message}`
        : "La interpretación IA no se pudo completar. Se aplica extractor heurístico local.",
    );
  }
}
