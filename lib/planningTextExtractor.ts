import {
  formatMeters,
  formatSquareMeters,
  parseMetricNumber,
} from "./planningNormalizer";
import type {
  PlanningBlock,
  PlanningListRuleProposal,
  PlanningNumericRuleProposal,
  PlanningRuleProposalStatus,
  PlanningRules,
  PlanningRulesProposal,
  PlanningSourceArticle,
} from "./projectInputSchema";

export type PlanningExtractionSourceType = "pdf" | "url";
export type PlanningExtractionConfidence = "low" | "medium" | "high";

export interface ExtractedPlanningMatch {
  field: string;
  value: string;
  snippet: string;
  confidence: PlanningExtractionConfidence;
}

export interface PlanningExtractionResult {
  sourceType: PlanningExtractionSourceType;
  sourceLabel: string;
  confidence: PlanningExtractionConfidence;
  hasUsefulData: boolean;
  zone: string;
  ordinance: string;
  rules: Partial<PlanningRules>;
  rulesProposal: PlanningRulesProposal;
  rawMatches: ExtractedPlanningMatch[];
  warnings: string[];
  sourceArticles: PlanningSourceArticle[];
  reviewNotes?: string[];
}

export interface AppliedPlanningExtraction {
  planning: PlanningBlock;
  appliedFields: string[];
  conflictFields: string[];
  warnings: string[];
}

export interface AppliedPlanningRulesProposal {
  planning: PlanningBlock;
  appliedFields: string[];
  skippedFields: string[];
  warnings: string[];
}

interface MetricExtraction {
  displayValue: string;
  numericValue: number | null;
  snippet: string;
  confidence: PlanningExtractionConfidence;
}

interface TextExtraction {
  value: string;
  snippet: string;
  confidence: PlanningExtractionConfidence;
}

interface ProposalMissingDataEvidence {
  reason: string;
  source_excerpt: string;
}

const MAX_SOURCE_ARTICLES = 8;
const INSUFFICIENT_WARNING_PATTERNS = [
  "falta ficha urbanistica",
  "falta ambito concreto",
  "falta ambito",
  "no se ha identificado zona",
  "no se ha identificado una zona",
  "no se ha identificado ordenanza",
  "no se ha identificado una ordenanza",
  "documento leido, pero no contiene parametros urbanisticos suficientes",
  "documento leido, pero no contiene parametros",
  "falta documento de planeamiento",
  "falta ficha de zona",
];
const MISSING_DATA_HINT_PATTERNS = [
  "ficha urbanistica",
  "fichas urbanisticas",
  "ficha de zona",
  "documento complementario",
  "planeamiento de desarrollo",
  "plan parcial",
  "estudio de detalle",
  "se define en",
  "se determina en",
  "remite a",
  "segun ficha",
];

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
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

export function hasClearPlanningSourceArticles(
  result: Pick<PlanningExtractionResult, "sourceArticles">,
): boolean {
  return result.sourceArticles.some(
    (article) =>
      hasText(article.excerpt) &&
      (article.page !== null || hasText(article.article)),
  );
}

export function needsComplementaryPlanningDocuments(
  result: Pick<PlanningExtractionResult, "confidence" | "warnings">,
): boolean {
  if (result.confidence === "low") {
    return true;
  }

  return result.warnings.some((warning) => {
    const normalizedWarning = normalizeForMatch(warning);
    return INSUFFICIENT_WARNING_PATTERNS.some((pattern) =>
      normalizedWarning.includes(pattern),
    );
  });
}

export function hasPlanningReviewNotesNeedingComplementaryDocuments(
  reviewNotes: string,
): boolean {
  return splitTextIntoLines(reviewNotes).some((line) => {
    const normalizedLine = normalizeForMatch(line);
    return (
      normalizedLine.includes("documento insuficiente para la parcela concreta") ||
      normalizedLine.includes("documentos complementarios requeridos") ||
      INSUFFICIENT_WARNING_PATTERNS.some((pattern) =>
        normalizedLine.includes(pattern),
      )
    );
  });
}

function appendText(base: string, additions: string[]): string {
  return uniqueStrings(
    [base, ...additions]
      .flatMap((item) => item.split("\n"))
      .map((item) => item.trim()),
  ).join("\n");
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function hasMissingDataHint(value: string): boolean {
  const normalized = normalizeForMatch(value);
  return MISSING_DATA_HINT_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function splitTextIntoLines(text: string): string[] {
  return uniqueStrings(
    text
      .replace(/\r/g, "\n")
      .replace(/[|]/g, "\n")
      .replace(/\u00a0/g, " ")
      .split(/\n+/)
      .map(normalizeLine)
      .filter(Boolean),
  );
}

function confidenceFromKeywords(
  line: string,
  keywords: string[],
): PlanningExtractionConfidence {
  const normalized = line.toLocaleLowerCase("es");
  if (
    keywords.some((keyword) =>
      normalized.includes(keyword.toLocaleLowerCase("es")),
    )
  ) {
    return "high";
  }

  return "medium";
}

function metricCandidateFromLine(
  line: string,
  unitType: "m2" | "m",
): MetricExtraction | null {
  const normalizedLine = normalizeLine(line);
  const regex =
    unitType === "m2"
      ? /\d+(?:[.,]\d+)?\s*(?:m²|m2|mts2|metros cuadrados)/i
      : /\d+(?:[.,]\d+)?\s*(?:m|mts|metros?)/i;
  const match = normalizedLine.match(regex);

  if (!match) {
    return null;
  }

  const displayValue = match[0].replace(/\s+/g, " ").trim();
  const numericValue = parseMetricNumber(displayValue);
  if (numericValue === null) {
    return null;
  }

  return {
    displayValue,
    numericValue,
    snippet: normalizedLine,
    confidence: "medium",
  };
}

function extractMetricFromLines(
  lines: string[],
  keywords: string[],
  unitType: "m2" | "m",
): MetricExtraction | null {
  for (const line of lines) {
    const normalized = line.toLocaleLowerCase("es");
    if (!keywords.some((keyword) => normalized.includes(keyword))) {
      continue;
    }

    const metric = metricCandidateFromLine(line, unitType);
    if (!metric) {
      continue;
    }

    return {
      ...metric,
      confidence: confidenceFromKeywords(line, keywords),
    };
  }

  return null;
}

function extractMetricFromLinesWithRegex(
  lines: string[],
  keywords: string[],
  regex: RegExp,
): MetricExtraction | null {
  for (const line of lines) {
    const normalized = line.toLocaleLowerCase("es");
    if (!keywords.some((keyword) => normalized.includes(keyword))) {
      continue;
    }

    const normalizedLine = normalizeLine(line);
    const match = normalizedLine.match(regex);
    if (!match) {
      continue;
    }

    const displayValue = match[0].replace(/\s+/g, " ").trim();
    const numericToken = displayValue.match(/\d+(?:[.,]\d+)?/)?.[0] ?? "";
    const numericValue = parseMetricNumber(numericToken);
    if (numericValue === null) {
      continue;
    }

    return {
      displayValue,
      numericValue,
      snippet: normalizedLine,
      confidence: confidenceFromKeywords(line, keywords),
    };
  }

  return null;
}

function emptyNumericRuleProposal(
  missingData?: ProposalMissingDataEvidence | null,
): PlanningNumericRuleProposal {
  return {
    value: null,
    confidence: "low",
    source_excerpt: missingData?.source_excerpt ?? "",
    reason: missingData?.reason ?? "",
    status: "proposed",
  };
}

function emptyListRuleProposal(
  missingData?: ProposalMissingDataEvidence | null,
): PlanningListRuleProposal {
  return {
    values: [],
    confidence: "low",
    source_excerpt: missingData?.source_excerpt ?? "",
    reason: missingData?.reason ?? "",
    status: "proposed",
  };
}

function buildNumericRuleProposal(
  extraction: MetricExtraction | null,
  missingData?: ProposalMissingDataEvidence | null,
): PlanningNumericRuleProposal {
  if (!extraction) {
    return emptyNumericRuleProposal(missingData);
  }

  return {
    value: extraction.numericValue,
    confidence: extraction.confidence,
    source_excerpt: extraction.snippet,
    reason: "",
    status: "proposed",
  };
}

function extractFloorCount(
  textExtraction: TextExtraction | null,
  missingData?: ProposalMissingDataEvidence | null,
): PlanningNumericRuleProposal {
  if (!textExtraction) {
    return emptyNumericRuleProposal(missingData);
  }

  const match = textExtraction.value.match(/\d+(?:[.,]\d+)?/);
  if (!match) {
    return {
      value: null,
      confidence: textExtraction.confidence,
      source_excerpt: textExtraction.snippet,
      reason: missingData?.reason ?? "",
      status: "proposed",
    };
  }

  return {
    value: parseMetricNumber(match[0]),
    confidence: textExtraction.confidence,
    source_excerpt: textExtraction.snippet,
    reason: "",
    status: "proposed",
  };
}

function splitRuleListValues(value: string): string[] {
  return uniqueStrings(
    value
      .split(/[,;]|\by\b/gi)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function extractListRuleProposal(
  lines: string[],
  keywords: string[],
): PlanningListRuleProposal {
  const extraction = extractTextFieldFromLines(lines, keywords);
  if (!extraction) {
    return emptyListRuleProposal(extractMissingDataEvidence(lines, keywords));
  }

  if (hasMissingDataHint(extraction.snippet)) {
    return emptyListRuleProposal({
      reason: buildMissingDataReason(extraction.snippet),
      source_excerpt: extraction.snippet,
    });
  }

  const values = splitRuleListValues(extraction.value);
  const missingData =
    values.length === 0 ? extractMissingDataEvidence(lines, keywords) : null;

  return {
    values,
    confidence: extraction.confidence,
    source_excerpt: extraction.snippet,
    reason: missingData?.reason ?? "",
    status: "proposed",
  };
}

function buildMissingDataReason(line: string): string {
  const normalized = normalizeForMatch(line);

  if (
    normalized.includes("ficha urbanistica") ||
    normalized.includes("fichas urbanisticas") ||
    normalized.includes("ficha de zona")
  ) {
    return "El documento remite a ficha urbanistica para este parametro.";
  }

  return "No se ha podido determinar este parametro. Requiere ficha urbanistica o documento complementario.";
}

function extractMissingDataEvidence(
  lines: string[],
  keywords: string[],
): ProposalMissingDataEvidence | null {
  for (const line of lines) {
    const normalized = normalizeForMatch(line);
    if (!keywords.some((keyword) => normalized.includes(normalizeForMatch(keyword)))) {
      continue;
    }

    if (!hasMissingDataHint(line)) {
      continue;
    }

    return {
      reason: buildMissingDataReason(line),
      source_excerpt: line,
    };
  }

  return null;
}

export function extractPlanningRulesProposalFromText(
  text: string,
): PlanningRulesProposal {
  const lines = splitTextIntoLines(text);
  const buildabilityKeywords = [
    "edificabilidad",
    "aprovechamiento",
    "indice de edificabilidad",
    "indice de aprovechamiento",
  ];
  const occupancyKeywords = [
    "ocupacion maxima",
    "ocupacion",
    "porcentaje de ocupacion",
  ];
  const maxHeightKeywords = [
    "altura maxima",
    "altura total",
    "altura reguladora",
    "altura a cumbrera",
    "cumbrera",
    "altura al alero",
    "alero",
  ];
  const maxFloorsKeywords = [
    "numero maximo de plantas",
    "maximo de plantas",
    "plantas maximas",
    "alturas",
  ];
  const setbackFrontKeywords = [
    "retranqueo frontal",
    "retranqueo a calle",
    "retranqueo a vial",
    "alineacion",
    "frente",
    "fachada principal",
  ];
  const setbackRearKeywords = [
    "retranqueo posterior",
    "retranqueo trasero",
    "retranqueo al fondo",
    "fondo de parcela",
    "fondo",
  ];
  const setbackSideKeywords = [
    "retranqueo lateral",
    "retranqueo a linderos",
    "retranqueo a lindero",
    "lateral",
    "lindero",
    "linderos",
  ];
  const usesAllowedKeywords = [
    "usos permitidos",
    "uso permitido",
    "usos autorizados",
    "uso caracteristico",
    "uso compatible",
  ];
  const usesForbiddenKeywords = [
    "usos prohibidos",
    "uso prohibido",
    "usos incompatibles",
    "uso no permitido",
  ];
  const buildabilityRatio = extractMetricFromLinesWithRegex(
    lines,
    buildabilityKeywords,
    /\d+(?:[.,]\d+)?\s*(?:m2|m²)\s*\/\s*(?:m2|m²)/i,
  );
  const occupancyPercent = extractMetricFromLinesWithRegex(
    lines,
    occupancyKeywords,
    /\d+(?:[.,]\d+)?\s*%/i,
  );
  const maxHeightMetric =
    extractMetricFromLines(
      lines,
      ["altura maxima", "altura total", "altura reguladora"],
      "m",
    ) ??
    extractMetricFromLines(lines, ["altura a cumbrera", "cumbrera"], "m") ??
    extractMetricFromLines(lines, ["altura al alero", "alero"], "m");
  const maxFloors = extractTextFieldFromLines(lines, maxFloorsKeywords);
  const setbackFront = extractMetricFromLines(lines, setbackFrontKeywords, "m");
  const setbackRear = extractMetricFromLines(lines, setbackRearKeywords, "m");
  const setbackSide = extractMetricFromLines(lines, setbackSideKeywords, "m");
  const maxHeightMissingData =
    maxHeightMetric === null
      ? extractMissingDataEvidence(lines, maxHeightKeywords)
      : null;
  const maxFloorsMissingData =
    maxFloors === null || maxFloors.value.match(/\d+(?:[.,]\d+)?/) === null
      ? extractMissingDataEvidence(lines, maxFloorsKeywords)
      : null;
  const buildabilityMissingData =
    buildabilityRatio === null
      ? extractMissingDataEvidence(lines, buildabilityKeywords)
      : null;
  const occupancyMissingData =
    occupancyPercent === null
      ? extractMissingDataEvidence(lines, occupancyKeywords)
      : null;
  const setbackFrontMissingData =
    setbackFront === null
      ? extractMissingDataEvidence(lines, setbackFrontKeywords)
      : null;
  const setbackRearMissingData =
    setbackRear === null
      ? extractMissingDataEvidence(lines, setbackRearKeywords)
      : null;
  const setbackSideMissingData =
    setbackSide === null
      ? extractMissingDataEvidence(lines, setbackSideKeywords)
      : null;

  return {
    max_height_m: buildNumericRuleProposal(maxHeightMetric, maxHeightMissingData),
    max_floors: extractFloorCount(maxFloors, maxFloorsMissingData),
    buildability_m2_m2: buildNumericRuleProposal(
      buildabilityRatio,
      buildabilityMissingData,
    ),
    occupancy_percent: buildNumericRuleProposal(
      occupancyPercent,
      occupancyMissingData,
    ),
    setbacks: {
      front_m: buildNumericRuleProposal(setbackFront, setbackFrontMissingData),
      rear_m: buildNumericRuleProposal(setbackRear, setbackRearMissingData),
      side_m: buildNumericRuleProposal(setbackSide, setbackSideMissingData),
    },
    uses_allowed: extractListRuleProposal(lines, usesAllowedKeywords),
    uses_forbidden: extractListRuleProposal(lines, usesForbiddenKeywords),
  };
}

function extractTextFieldFromLines(
  lines: string[],
  keywords: string[],
): TextExtraction | null {
  for (const line of lines) {
    const normalized = line.toLocaleLowerCase("es");
    if (!keywords.some((keyword) => normalized.includes(keyword))) {
      continue;
    }

    const value =
      line.split(/:\s*|\s[-–]\s/).slice(1).join(" ").trim() ||
      line.replace(/\s+/g, " ").trim();
    if (!value) {
      continue;
    }

    return {
      value,
      snippet: line,
      confidence: confidenceFromKeywords(line, keywords),
    };
  }

  return null;
}

function pushMetricMatch(
  matches: ExtractedPlanningMatch[],
  field: string,
  metric: MetricExtraction | null,
): void {
  if (!metric) {
    return;
  }

  matches.push({
    field,
    value: metric.displayValue,
    snippet: metric.snippet,
    confidence: metric.confidence,
  });
}

function pushTextMatch(
  matches: ExtractedPlanningMatch[],
  field: string,
  value: TextExtraction | null,
): void {
  if (!value) {
    return;
  }

  matches.push({
    field,
    value: value.value,
    snippet: value.snippet,
    confidence: value.confidence,
  });
}

function overallConfidence(
  matches: ExtractedPlanningMatch[],
): PlanningExtractionConfidence {
  if (matches.length >= 5) {
    return "high";
  }

  if (matches.length >= 2) {
    return "medium";
  }

  return "low";
}

export function extractPlanningRulesFromText(
  text: string,
  options: {
    sourceType: PlanningExtractionSourceType;
    sourceLabel: string;
  },
): PlanningExtractionResult {
  const lines = splitTextIntoLines(text);
  const matches: ExtractedPlanningMatch[] = [];
  const rulesProposal = extractPlanningRulesProposalFromText(text);

  const zone = extractTextFieldFromLines(lines, ["zona urban", "zona:"]);
  const ordinance = extractTextFieldFromLines(lines, ["ordenanza", "ord."]);
  const buildabilityTotal = extractMetricFromLines(
    lines,
    [
      "edificabilidad total",
      "edificabilidad maxima",
      "edificabilidad máxima",
      "aprovechamiento",
    ],
    "m2",
  );
  const buildabilityAboveGround = extractMetricFromLines(
    lines,
    ["edificabilidad sobre rasante", "sobre rasante"],
    "m2",
  );
  const buildabilityBelowGround = extractMetricFromLines(
    lines,
    ["edificabilidad bajo rasante", "bajo rasante"],
    "m2",
  );
  const heightEaves = extractMetricFromLines(
    lines,
    ["altura al alero", "altura de alero", "alero"],
    "m",
  );
  const heightRidge = extractMetricFromLines(
    lines,
    ["altura a cumbrera", "altura maxima", "altura máxima", "cumbrera"],
    "m",
  );
  const setbackBoundary = extractMetricFromLines(
    lines,
    ["retranqueo a linderos", "linderos", "lindero"],
    "m",
  );
  const setbackStreet = extractMetricFromLines(
    lines,
    [
      "retranqueo a calle",
      "retranqueo a vial",
      "alineacion",
      "alineación",
      "vial",
      "calle",
    ],
    "m",
  );
  const occupancy = extractTextFieldFromLines(
    lines,
    ["ocupacion maxima", "ocupación máxima", "ocupacion", "ocupación"],
  );
  const maxFloors = extractTextFieldFromLines(
    lines,
    [
      "numero maximo de plantas",
      "número máximo de plantas",
      "maximo de plantas",
      "máximo de plantas",
      "plantas maximas",
      "plantas máximas",
    ],
  );

  pushTextMatch(matches, "planning.zone", zone);
  pushTextMatch(matches, "planning.ordinance", ordinance);
  pushMetricMatch(
    matches,
    "planning.rules.buildability_total_m2",
    buildabilityTotal,
  );
  pushMetricMatch(
    matches,
    "planning.rules.buildability_above_ground_m2",
    buildabilityAboveGround,
  );
  pushMetricMatch(
    matches,
    "planning.rules.buildability_below_ground_m2",
    buildabilityBelowGround,
  );
  pushTextMatch(matches, "planning.rules.occupancy", occupancy);
  pushTextMatch(matches, "planning.rules.max_floors", maxFloors);
  pushMetricMatch(matches, "planning.rules.max_height_eaves_m", heightEaves);
  pushMetricMatch(matches, "planning.rules.max_height_ridge_m", heightRidge);
  pushMetricMatch(
    matches,
    "planning.rules.setback_boundary_m",
    setbackBoundary,
  );
  pushMetricMatch(
    matches,
    "planning.rules.setback_street_m",
    setbackStreet,
  );

  const warnings: string[] = [];
  if (matches.length === 0) {
    warnings.push(
      "No se detectaron reglas claras en el texto. Revisa el documento o introduce la normativa manualmente.",
    );
  }

  const sourceArticles = uniqueSourceArticles(
    matches.map((match) => ({
      source_label: options.sourceLabel,
      article: "",
      page: null,
      excerpt: match.snippet,
    })),
  ).slice(0, MAX_SOURCE_ARTICLES);

  return {
    sourceType: options.sourceType,
    sourceLabel: options.sourceLabel,
    confidence: overallConfidence(matches),
    hasUsefulData: matches.length > 0,
    zone: zone?.value ?? "",
    ordinance: ordinance?.value ?? "",
    rules: {
      buildability_total_m2: buildabilityTotal?.numericValue ?? null,
      buildability_total_m2_display:
        buildabilityTotal?.numericValue !== null && buildabilityTotal
          ? formatSquareMeters(buildabilityTotal.numericValue)
          : "",
      buildability_above_ground_m2:
        buildabilityAboveGround?.numericValue ?? null,
      buildability_above_ground_m2_display:
        buildabilityAboveGround?.numericValue !== null && buildabilityAboveGround
          ? formatSquareMeters(buildabilityAboveGround.numericValue)
          : "",
      buildability_below_ground_m2:
        buildabilityBelowGround?.numericValue ?? null,
      buildability_below_ground_m2_display:
        buildabilityBelowGround?.numericValue !== null && buildabilityBelowGround
          ? formatSquareMeters(buildabilityBelowGround.numericValue)
          : "",
      occupancy: occupancy?.value ?? "",
      max_floors: maxFloors?.value ?? "",
      max_height_eaves_m: heightEaves?.numericValue ?? null,
      max_height_eaves_m_display:
        heightEaves?.numericValue !== null && heightEaves
          ? formatMeters(heightEaves.numericValue)
          : "",
      max_height_ridge_m: heightRidge?.numericValue ?? null,
      max_height_ridge_m_display:
        heightRidge?.numericValue !== null && heightRidge
          ? formatMeters(heightRidge.numericValue)
          : "",
      setback_boundary_m: setbackBoundary?.numericValue ?? null,
      setback_boundary_m_display:
        setbackBoundary?.numericValue !== null && setbackBoundary
          ? formatMeters(setbackBoundary.numericValue)
          : "",
      setback_street_m: setbackStreet?.numericValue ?? null,
      setback_street_m_display:
        setbackStreet?.numericValue !== null && setbackStreet
          ? formatMeters(setbackStreet.numericValue)
          : "",
    },
    rulesProposal,
    rawMatches: matches,
    warnings,
    sourceArticles,
    reviewNotes: [],
  };
}

export function applyPlanningExtractionProposal(
  planning: PlanningBlock,
  result: PlanningExtractionResult,
): AppliedPlanningExtraction {
  const nextPlanning: PlanningBlock = {
    ...planning,
    rules_proposal: result.rulesProposal,
    source_articles: uniqueSourceArticles([
      ...planning.source_articles,
      ...result.sourceArticles,
    ]).slice(0, MAX_SOURCE_ARTICLES),
  };
  const appliedFields: string[] = [];
  const conflictFields: string[] = [];
  const warnings = [...result.warnings];
  const requiresComplementaryDocs =
    needsComplementaryPlanningDocuments(result);
  const lowConfidenceWithoutClearSources =
    result.confidence === "low" && !hasClearPlanningSourceArticles(result);
  const extractionLabel =
    result.sourceType === "pdf"
      ? `Extraccion PDF: ${result.sourceLabel}`
      : `Extraccion URL: ${result.sourceLabel}`;
  const reviewSummaryLines = [
    result.sourceType === "pdf"
      ? "PDF leido por IA correctamente."
      : "Documento de normativa leido correctamente.",
    ...(requiresComplementaryDocs
      ? [
          "Documento insuficiente para la parcela concreta.",
          "Documentos complementarios requeridos: ficha urbanistica, PGOU, plano de zonificacion o ambito aplicable.",
        ]
      : []),
  ];

  if (planning.rules_confirmed_by_user) {
    const reviewNotes = appendText(planning.review_notes, [
      extractionLabel,
      ...reviewSummaryLines,
      "La normativa ya estaba confirmada por el usuario. No se han sobrescrito valores.",
      ...(result.reviewNotes ?? []),
      ...warnings,
    ]);

    return {
      planning: {
        ...nextPlanning,
        status: "processed_needs_review",
        rules_confirmed_by_user: false,
        review_notes: reviewNotes,
      },
      appliedFields,
      conflictFields,
      warnings,
    };
  }

  if (lowConfidenceWithoutClearSources) {
    warnings.push(
      "La interpretacion tiene confianza baja y no aporta source_articles claros. No se aplican campos automaticamente.",
    );
  } else {
    if (hasText(result.zone)) {
      if (!hasText(planning.zone)) {
        nextPlanning.zone = result.zone;
        appliedFields.push("planning.zone");
      } else if (planning.zone !== result.zone) {
        conflictFields.push("planning.zone");
        warnings.push(`Conflicto en zona: se mantiene "${planning.zone}".`);
      }
    }

    if (hasText(result.ordinance)) {
      if (!hasText(planning.ordinance)) {
        nextPlanning.ordinance = result.ordinance;
        appliedFields.push("planning.ordinance");
      } else if (planning.ordinance !== result.ordinance) {
        conflictFields.push("planning.ordinance");
        warnings.push(
          `Conflicto en ordenanza: se mantiene "${planning.ordinance}".`,
        );
      }
    }
  }

  const reviewNotes = appendText(planning.review_notes, [
    extractionLabel,
    ...reviewSummaryLines,
    `Confianza estimada: ${result.confidence}.`,
    appliedFields.length > 0
      ? `Campos propuestos aplicados: ${appliedFields.join(", ")}`
      : lowConfidenceWithoutClearSources
        ? "No se aplicaron campos nuevos automaticamente por confianza baja y falta de citas claras."
        : "No se aplicaron campos nuevos automaticamente.",
    "Las reglas detectadas se han guardado en planning.rules_proposal y requieren revision humana antes de aplicarse a planning.rules.",
    ...(result.reviewNotes ?? []),
    ...warnings,
  ]);

  return {
    planning: {
      ...nextPlanning,
      status: "processed_needs_review",
      rules_confirmed_by_user: false,
      review_notes: reviewNotes,
    },
    appliedFields,
    conflictFields,
    warnings,
  };
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(2)}%`;
}

function isRuleAccepted(status: PlanningRuleProposalStatus): boolean {
  return status === "accepted";
}

export function applyAcceptedPlanningRulesProposal(
  planning: PlanningBlock,
): AppliedPlanningRulesProposal {
  const nextPlanning: PlanningBlock = {
    ...planning,
    rules: {
      ...planning.rules,
    },
  };
  const appliedFields: string[] = [];
  const skippedFields: string[] = [];
  const warnings: string[] = [];
  const proposal = planning.rules_proposal;

  if (
    isRuleAccepted(proposal.max_floors.status) &&
    typeof proposal.max_floors.value === "number"
  ) {
    nextPlanning.rules.max_floors = String(proposal.max_floors.value);
    appliedFields.push("planning.rules.max_floors");
  }

  if (
    isRuleAccepted(proposal.occupancy_percent.status) &&
    typeof proposal.occupancy_percent.value === "number"
  ) {
    nextPlanning.rules.occupancy = formatPercent(proposal.occupancy_percent.value);
    appliedFields.push("planning.rules.occupancy");
  }

  if (
    isRuleAccepted(proposal.setbacks.front_m.status) &&
    typeof proposal.setbacks.front_m.value === "number"
  ) {
    nextPlanning.rules.setback_street_m = proposal.setbacks.front_m.value;
    nextPlanning.rules.setback_street_m_display = formatMeters(
      proposal.setbacks.front_m.value,
    );
    appliedFields.push("planning.rules.setback_street_m");
  }

  if (
    isRuleAccepted(proposal.setbacks.side_m.status) ||
    isRuleAccepted(proposal.setbacks.rear_m.status)
  ) {
    skippedFields.push("planning.rules.setback_boundary_m");
    warnings.push(
      "Los retranqueos lateral y trasero no se aplican automaticamente a setback_boundary_m sin revision manual.",
    );
  }

  if (isRuleAccepted(proposal.max_height_m.status)) {
    skippedFields.push("planning.rules.max_height_eaves_m");
    skippedFields.push("planning.rules.max_height_ridge_m");
    warnings.push(
      "La altura maxima propuesta no se aplica automaticamente a alero o cumbrera sin elegir destino.",
    );
  }

  if (isRuleAccepted(proposal.buildability_m2_m2.status)) {
    skippedFields.push("planning.rules.buildability_total_m2");
    warnings.push(
      "La edificabilidad m2/m2 no se aplica automaticamente a buildability_total_m2.",
    );
  }

  if (
    isRuleAccepted(proposal.uses_allowed.status) ||
    isRuleAccepted(proposal.uses_forbidden.status)
  ) {
    warnings.push(
      "Los usos permitidos/prohibidos se conservan en planning.rules_proposal porque no existe un campo final equivalente en planning.rules.",
    );
  }

  nextPlanning.status = "processed_needs_review";
  nextPlanning.rules_confirmed_by_user = false;
  nextPlanning.review_notes = appendText(planning.review_notes, [
    appliedFields.length > 0
      ? `Se aplicaron reglas aceptadas a planning.rules: ${appliedFields.join(", ")}`
      : "No habia reglas aceptadas con mapeo automatico seguro.",
    ...warnings,
  ]);

  return {
    planning: nextPlanning,
    appliedFields,
    skippedFields,
    warnings,
  };
}
