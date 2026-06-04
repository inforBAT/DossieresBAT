import "server-only";

import {
  formatMeters,
  formatSquareMeters,
  parseMetricNumber,
} from "./planningNormalizer";
import {
  extractPlanningRulesProposalFromText,
  extractPlanningRulesFromText,
  type PlanningExtractionConfidence,
  type PlanningExtractionResult,
} from "./planningTextExtractor";
import type {
  PlanningListRuleProposal,
  PlanningNumericRuleProposal,
  PlanningRules,
  PlanningRulesProposal,
  PlanningSourceArticle,
} from "./projectInputSchema";
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
  rules_proposal?: {
    buildability_m2_m2?: {
      value?: string | number | null;
      confidence?: PlanningExtractionConfidence;
      source_excerpt?: string;
    };
    occupancy_percent?: {
      value?: string | number | null;
      confidence?: PlanningExtractionConfidence;
      source_excerpt?: string;
    };
    max_height_m?: {
      value?: string | number | null;
      confidence?: PlanningExtractionConfidence;
      source_excerpt?: string;
    };
    max_floors?: {
      value?: string | number | null;
      confidence?: PlanningExtractionConfidence;
      source_excerpt?: string;
    };
    setbacks?: {
      front_m?: {
        value?: string | number | null;
        confidence?: PlanningExtractionConfidence;
        source_excerpt?: string;
      };
      rear_m?: {
        value?: string | number | null;
        confidence?: PlanningExtractionConfidence;
        source_excerpt?: string;
      };
      side_m?: {
        value?: string | number | null;
        confidence?: PlanningExtractionConfidence;
        source_excerpt?: string;
      };
    };
    uses_allowed?: {
      values?: string[];
      confidence?: PlanningExtractionConfidence;
      source_excerpt?: string;
    };
    uses_forbidden?: {
      values?: string[];
      confidence?: PlanningExtractionConfidence;
      source_excerpt?: string;
    };
  };
}

interface SelectedAiChunks {
  chunks: PlanningPdfChunk[];
  truncated: boolean;
  totalChunks: number;
}

interface OpenAiResponsesPayload {
  output_text?: string;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

const AI_CHUNK_KEYWORDS = [
  "edificabilidad",
  "aprovechamiento",
  "ocupacion",
  "ocupacion maxima",
  "altura",
  "alero",
  "cumbrera",
  "plantas",
  "retranqueo",
  "lindero",
  "linderos",
  "alineacion",
  "rasante",
  "ordenanza",
  "zona",
  "parcela minima",
  "ficha",
  "pgou",
];
const MAX_AI_CHUNKS = 10;
const MAX_AI_CHARACTERS = 18000;
const AI_TRUNCATION_WARNING =
  "Se interpretaron los fragmentos mas relevantes del PDF; el documento completo no se envio a IA por tamano.";

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

function rankChunkForPlanning(chunk: PlanningPdfChunk): number {
  const normalized = chunk.text.toLocaleLowerCase("es");
  let score = 0;

  for (const keyword of AI_CHUNK_KEYWORDS) {
    if (normalized.includes(keyword)) {
      score += keyword.length >= 10 ? 3 : 2;
    }
  }

  if (/\bart(?:iculo)?s?\b/.test(normalized)) {
    score += 2;
  }

  if (/\b(?:m2|m²|%|plantas?)\b/.test(normalized)) {
    score += 1;
  }

  return score;
}

function selectChunksForAi(ingestion: PlanningPdfIngestion): SelectedAiChunks {
  const rankedChunks = ingestion.chunks
    .map((chunk, index) => ({
      chunk,
      score: rankChunkForPlanning(chunk),
      index,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.chunk.page_start !== right.chunk.page_start) {
        return left.chunk.page_start - right.chunk.page_start;
      }

      return left.index - right.index;
    });

  const candidates =
    rankedChunks.some((item) => item.score > 0)
      ? rankedChunks
      : ingestion.chunks.map((chunk, index) => ({
          chunk,
          score: 0,
          index,
        }));

  const selected: PlanningPdfChunk[] = [];
  let usedCharacters = 0;

  for (const item of candidates) {
    if (selected.length >= MAX_AI_CHUNKS) {
      break;
    }

    const candidateLength = item.chunk.text.length;
    const wouldOverflow = usedCharacters + candidateLength > MAX_AI_CHARACTERS;
    if (selected.length > 0 && wouldOverflow) {
      continue;
    }

    selected.push(item.chunk);
    usedCharacters += candidateLength;
  }

  if (selected.length === 0 && ingestion.chunks.length > 0) {
    selected.push(ingestion.chunks[0]);
  }

  selected.sort((left, right) => {
    if (left.page_start !== right.page_start) {
      return left.page_start - right.page_start;
    }

    return left.id.localeCompare(right.id, "es");
  });

  return {
    chunks: selected,
    truncated: selected.length < ingestion.chunks.length,
    totalChunks: ingestion.chunks.length,
  };
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

function normalizeProposalConfidence(
  confidence: unknown,
): PlanningExtractionConfidence {
  return confidence === "high" || confidence === "medium" ? confidence : "low";
}

function normalizeNumericProposal(
  proposal: {
    value?: string | number | null;
    confidence?: PlanningExtractionConfidence;
    source_excerpt?: string;
  } | undefined,
  fallback: PlanningNumericRuleProposal,
): PlanningNumericRuleProposal {
  const parsedValue = parseNullableMetric(proposal?.value);

  return {
    value: parsedValue,
    confidence:
      proposal && parsedValue !== null
        ? normalizeProposalConfidence(proposal.confidence)
        : fallback.confidence,
    source_excerpt: hasText(proposal?.source_excerpt)
      ? proposal!.source_excerpt!.trim()
      : fallback.source_excerpt,
    status: "pending",
  };
}

function normalizeListProposal(
  proposal: {
    values?: string[];
    confidence?: PlanningExtractionConfidence;
    source_excerpt?: string;
  } | undefined,
  fallback: PlanningListRuleProposal,
): PlanningListRuleProposal {
  const values = uniqueStrings(
    Array.isArray(proposal?.values)
      ? proposal!.values.filter((value): value is string => typeof value === "string")
      : fallback.values,
  );

  return {
    values,
    confidence:
      values.length > 0 && proposal
        ? normalizeProposalConfidence(proposal.confidence)
        : fallback.confidence,
    source_excerpt: hasText(proposal?.source_excerpt)
      ? proposal!.source_excerpt!.trim()
      : fallback.source_excerpt,
    status: "pending",
  };
}

function normalizeRulesProposal(
  proposal: PlanningAiPayload["rules_proposal"],
  fallback: PlanningRulesProposal,
): PlanningRulesProposal {
  return {
    buildability_m2_m2: normalizeNumericProposal(
      proposal?.buildability_m2_m2,
      fallback.buildability_m2_m2,
    ),
    occupancy_percent: normalizeNumericProposal(
      proposal?.occupancy_percent,
      fallback.occupancy_percent,
    ),
    max_height_m: normalizeNumericProposal(
      proposal?.max_height_m,
      fallback.max_height_m,
    ),
    max_floors: normalizeNumericProposal(
      proposal?.max_floors,
      fallback.max_floors,
    ),
    setbacks: {
      front_m: normalizeNumericProposal(
        proposal?.setbacks?.front_m,
        fallback.setbacks.front_m,
      ),
      rear_m: normalizeNumericProposal(
        proposal?.setbacks?.rear_m,
        fallback.setbacks.rear_m,
      ),
      side_m: normalizeNumericProposal(
        proposal?.setbacks?.side_m,
        fallback.setbacks.side_m,
      ),
    },
    uses_allowed: normalizeListProposal(
      proposal?.uses_allowed,
      fallback.uses_allowed,
    ),
    uses_forbidden: normalizeListProposal(
      proposal?.uses_forbidden,
      fallback.uses_forbidden,
    ),
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
      "No se ha identificado una zona urbanistica concreta. Puede faltar la ficha de zona o PGOU aplicable.",
    );
  }

  if (!hasText(payload?.ordinance) && !hasText(context.currentOrdinance)) {
    warnings.push(
      "No se ha identificado una ordenanza o ficha concreta de planeamiento para la parcela.",
    );
  }

  if (!hasUsefulData) {
    warnings.push(
      "Documento leido, pero no contiene parametros urbanisticos suficientes para la parcela. Falta documento de planeamiento/ficha de zona.",
    );
  }

  return warnings;
}

function buildHeuristicFallback(
  ingestion: PlanningPdfIngestion,
  context: PlanningAiInterpretationContext,
  warningsToAppend: string[] = [],
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
      warnings: [...warningsToAppend, ...heuristic.warnings],
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
    reviewNotes: warningsToAppend,
  };
}

function aiClientConfig() {
  const apiKey =
    process.env.PLANNING_AI_API_KEY || process.env.OPENAI_API_KEY || "";
  const model = process.env.PLANNING_AI_MODEL || process.env.OPENAI_MODEL || "";
  const configuredApiUrl =
    process.env.PLANNING_AI_API_URL || process.env.OPENAI_BASE_URL || "";
  const apiUrl = hasText(configuredApiUrl)
    ? configuredApiUrl.match(/\/v1\/(responses|chat\/completions)$/)
      ? configuredApiUrl
      : configuredApiUrl.replace(/\/+$/, "") + "/v1/responses"
    : "https://api.openai.com/v1/responses";

  return {
    apiKey,
    model,
    apiUrl,
    enabled: Boolean(apiKey && model),
  };
}

function aiSystemPrompt(): string {
  return [
    "Eres un analista urbanistico que interpreta normativa a partir de texto extraido de PDFs.",
    "Devuelve exclusivamente JSON valido.",
    "No inventes datos urbanisticos no presentes en el documento.",
    "Si el documento no contiene datos suficientes, marca document_sufficient=false y explica la carencia en warnings.",
    "Nunca confirmes la normativa del usuario ni afirmes que esta validada.",
    "Genera rules_proposal con propuestas revisables por regla, incluyendo confidence y source_excerpt por cada campo.",
    "Busca unicamente: zona, ordenanza, edificabilidad total/sobre rasante/bajo rasante, ocupacion, numero maximo de plantas, altura de alero, altura de cumbrera, retranqueos a linderos y a calle, edificabilidad m2/m2, retranqueo frontal/trasero/lateral y usos permitidos/prohibidos.",
    "Incluye source_articles con article, page y excerpt cuando cites una regla.",
  ].join(" ");
}

function aiUserPrompt(
  ingestion: PlanningPdfIngestion,
  selectedChunks: SelectedAiChunks,
  context: PlanningAiInterpretationContext,
): string {
  return JSON.stringify(
    {
      task: "Interpretar normativa urbanistica en JSON estricto",
      context,
      parser: ingestion.parser,
      chunk_selection: {
        total_chunks_in_pdf: selectedChunks.totalChunks,
        selected_chunks: selectedChunks.chunks.length,
        truncated_for_size: selectedChunks.truncated,
      },
      chunks: selectedChunks.chunks,
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
        rules_proposal: {
          buildability_m2_m2: {
            value: null,
            confidence: "low | medium | high",
            source_excerpt: "",
          },
          occupancy_percent: {
            value: null,
            confidence: "low | medium | high",
            source_excerpt: "",
          },
          max_height_m: {
            value: null,
            confidence: "low | medium | high",
            source_excerpt: "",
          },
          max_floors: {
            value: null,
            confidence: "low | medium | high",
            source_excerpt: "",
          },
          setbacks: {
            front_m: {
              value: null,
              confidence: "low | medium | high",
              source_excerpt: "",
            },
            rear_m: {
              value: null,
              confidence: "low | medium | high",
              source_excerpt: "",
            },
            side_m: {
              value: null,
              confidence: "low | medium | high",
              source_excerpt: "",
            },
          },
          uses_allowed: {
            values: [],
            confidence: "low | medium | high",
            source_excerpt: "",
          },
          uses_forbidden: {
            values: [],
            confidence: "low | medium | high",
            source_excerpt: "",
          },
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
          ? (item as { text: string }).text
          : "",
      )
      .join("\n");
  }

  return "";
}

function parseResponsesOutput(payload: OpenAiResponsesPayload): string {
  if (hasText(payload.output_text)) {
    return payload.output_text;
  }

  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => (typeof content.text === "string" ? content.text : ""))
    .filter((text) => text.trim().length > 0)
    .join("\n");
}

function summarizeApiErrorBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return "Sin detalle adicional.";
  }

  try {
    const payload = JSON.parse(trimmed) as OpenAiResponsesPayload;
    const errorMessage = payload.error?.message;
    if (hasText(errorMessage)) {
      return errorMessage.trim();
    }
  } catch {
    // Fall through to text summary.
  }

  return trimmed.replace(/\s+/g, " ").slice(0, 300);
}

async function requestAiInterpretation(
  ingestion: PlanningPdfIngestion,
  selectedChunks: SelectedAiChunks,
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
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: aiSystemPrompt() }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: aiUserPrompt(ingestion, selectedChunks, context),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "planning_rules_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              document_sufficient: { type: "boolean" },
              confidence: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
              zone: { type: "string" },
              ordinance: { type: "string" },
              warnings: {
                type: "array",
                items: { type: "string" },
              },
              review_notes: {
                type: "array",
                items: { type: "string" },
              },
              source_articles: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    article: { type: "string" },
                    page: {
                      anyOf: [{ type: "number" }, { type: "null" }],
                    },
                    excerpt: { type: "string" },
                  },
                  required: ["article", "page", "excerpt"],
                },
              },
              rules: {
                type: "object",
                additionalProperties: false,
                properties: {
                  buildability_total_m2: {
                    anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                  },
                  buildability_above_ground_m2: {
                    anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                  },
                  buildability_below_ground_m2: {
                    anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                  },
                  occupancy: {
                    anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
                  },
                  max_floors: {
                    anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
                  },
                  max_height_eaves_m: {
                    anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                  },
                  max_height_ridge_m: {
                    anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                  },
                  setback_boundary_m: {
                    anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                  },
                  setback_street_m: {
                    anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                  },
                },
                required: [
                  "buildability_total_m2",
                  "buildability_above_ground_m2",
                  "buildability_below_ground_m2",
                  "occupancy",
                  "max_floors",
                  "max_height_eaves_m",
                  "max_height_ridge_m",
                  "setback_boundary_m",
                  "setback_street_m",
                ],
              },
              rules_proposal: {
                type: "object",
                additionalProperties: false,
                properties: {
                  buildability_m2_m2: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      value: {
                        anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                      },
                      confidence: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                      },
                      source_excerpt: { type: "string" },
                    },
                    required: ["value", "confidence", "source_excerpt"],
                  },
                  occupancy_percent: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      value: {
                        anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                      },
                      confidence: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                      },
                      source_excerpt: { type: "string" },
                    },
                    required: ["value", "confidence", "source_excerpt"],
                  },
                  max_height_m: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      value: {
                        anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                      },
                      confidence: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                      },
                      source_excerpt: { type: "string" },
                    },
                    required: ["value", "confidence", "source_excerpt"],
                  },
                  max_floors: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      value: {
                        anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                      },
                      confidence: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                      },
                      source_excerpt: { type: "string" },
                    },
                    required: ["value", "confidence", "source_excerpt"],
                  },
                  setbacks: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      front_m: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          value: {
                            anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                          },
                          confidence: {
                            type: "string",
                            enum: ["low", "medium", "high"],
                          },
                          source_excerpt: { type: "string" },
                        },
                        required: ["value", "confidence", "source_excerpt"],
                      },
                      rear_m: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          value: {
                            anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                          },
                          confidence: {
                            type: "string",
                            enum: ["low", "medium", "high"],
                          },
                          source_excerpt: { type: "string" },
                        },
                        required: ["value", "confidence", "source_excerpt"],
                      },
                      side_m: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          value: {
                            anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
                          },
                          confidence: {
                            type: "string",
                            enum: ["low", "medium", "high"],
                          },
                          source_excerpt: { type: "string" },
                        },
                        required: ["value", "confidence", "source_excerpt"],
                      },
                    },
                    required: ["front_m", "rear_m", "side_m"],
                  },
                  uses_allowed: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      values: {
                        type: "array",
                        items: { type: "string" },
                      },
                      confidence: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                      },
                      source_excerpt: { type: "string" },
                    },
                    required: ["values", "confidence", "source_excerpt"],
                  },
                  uses_forbidden: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      values: {
                        type: "array",
                        items: { type: "string" },
                      },
                      confidence: {
                        type: "string",
                        enum: ["low", "medium", "high"],
                      },
                      source_excerpt: { type: "string" },
                    },
                    required: ["values", "confidence", "source_excerpt"],
                  },
                },
                required: [
                  "buildability_m2_m2",
                  "occupancy_percent",
                  "max_height_m",
                  "max_floors",
                  "setbacks",
                  "uses_allowed",
                  "uses_forbidden",
                ],
              },
            },
            required: [
              "document_sufficient",
              "confidence",
              "zone",
              "ordinance",
              "warnings",
              "review_notes",
              "source_articles",
              "rules",
              "rules_proposal",
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI devolvio ${response.status}: ${summarizeApiErrorBody(errorBody)}`,
    );
  }

  const payload = (await response.json()) as OpenAiResponsesPayload;
  const content = parseResponsesOutput(payload);

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
  const selectedChunks = selectChunksForAi(ingestion);
  const sharedWarnings = selectedChunks.truncated ? [AI_TRUNCATION_WARNING] : [];
  const heuristicRulesProposal = extractPlanningRulesProposalFromText(
    ingestion.raw_text,
  );

  try {
    const aiPayload = await requestAiInterpretation(
      ingestion,
      selectedChunks,
      context,
    );
    if (!aiPayload) {
      return buildHeuristicFallback(ingestion, context, [
        "Interpretacion IA no configurada; se ha aplicado el extractor heuristico local.",
        ...sharedWarnings,
      ]);
    }

    const rules = normalizeRules(aiPayload.rules);
    const rulesProposal = normalizeRulesProposal(
      aiPayload.rules_proposal,
      heuristicRulesProposal,
    );
    const hasUsefulData = Object.values(rules).some((value) =>
      typeof value === "number"
        ? Number.isFinite(value)
        : hasText(typeof value === "string" ? value : ""),
    ) || Object.values(rulesProposal.setbacks).some(
      (proposal) => typeof proposal.value === "number",
    ) ||
      typeof rulesProposal.buildability_m2_m2.value === "number" ||
      typeof rulesProposal.occupancy_percent.value === "number" ||
      typeof rulesProposal.max_height_m.value === "number" ||
      typeof rulesProposal.max_floors.value === "number" ||
      rulesProposal.uses_allowed.values.length > 0 ||
      rulesProposal.uses_forbidden.values.length > 0;
    const warnings = buildDefaultWarnings(
      {
        ...aiPayload,
        warnings: [...sharedWarnings, ...(aiPayload.warnings ?? [])],
      },
      context,
      hasUsefulData,
    );

    return {
      sourceType: "pdf",
      sourceLabel: context.sourceLabel,
      confidence: aiPayload.confidence ?? "low",
      hasUsefulData,
      zone: parseStringValue(aiPayload.zone),
      ordinance: parseStringValue(aiPayload.ordinance),
      rules,
      rulesProposal,
      rawMatches: [],
      warnings,
      sourceArticles: buildAiSourceArticles(
        aiPayload,
        context,
        selectedChunks.chunks,
      ),
      reviewNotes: uniqueStrings(aiPayload.review_notes ?? []),
    };
  } catch (error) {
    return buildHeuristicFallback(ingestion, context, [
      ...(error instanceof Error
        ? [
            `La interpretacion IA no se pudo completar. Se aplica extractor heuristico local: ${error.message}`,
          ]
        : [
            "La interpretacion IA no se pudo completar. Se aplica extractor heuristico local.",
          ]),
      ...sharedWarnings,
    ]);
  }
}
