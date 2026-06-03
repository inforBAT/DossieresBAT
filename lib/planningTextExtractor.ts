import {
  formatMeters,
  formatSquareMeters,
  parseMetricNumber,
} from "./planningNormalizer";
import type {
  PlanningBlock,
  PlanningRules,
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

const MAX_SOURCE_ARTICLES = 8;

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
  if (keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase("es")))) {
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

  const zone = extractTextFieldFromLines(lines, ["zona urban", "zona:"]);
  const ordinance = extractTextFieldFromLines(lines, ["ordenanza", "ord."]);
  const buildabilityTotal = extractMetricFromLines(
    lines,
    ["edificabilidad total", "edificabilidad maxima", "edificabilidad máxima", "aprovechamiento"],
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
    ["retranqueo a calle", "retranqueo a vial", "alineacion", "alineación", "vial", "calle"],
    "m",
  );
  const occupancy = extractTextFieldFromLines(
    lines,
    ["ocupacion maxima", "ocupación máxima", "ocupacion", "ocupación"],
  );
  const maxFloors = extractTextFieldFromLines(
    lines,
    ["numero maximo de plantas", "número máximo de plantas", "maximo de plantas", "máximo de plantas", "plantas maximas", "plantas máximas"],
  );

  pushTextMatch(matches, "planning.zone", zone);
  pushTextMatch(matches, "planning.ordinance", ordinance);
  pushMetricMatch(matches, "planning.rules.buildability_total_m2", buildabilityTotal);
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
  pushMetricMatch(matches, "planning.rules.setback_boundary_m", setbackBoundary);
  pushMetricMatch(matches, "planning.rules.setback_street_m", setbackStreet);

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
    rawMatches: matches,
    warnings,
    sourceArticles,
    reviewNotes: [],
  };
}

function metricFieldHasValue(
  rules: PlanningRules,
  key: keyof PlanningRules,
  displayKey: keyof PlanningRules,
): boolean {
  const numericValue = rules[key];
  const displayValue = rules[displayKey];

  return (
    typeof numericValue === "number" ||
    (typeof displayValue === "string" && displayValue.trim().length > 0)
  );
}

function sameMetricValue(
  currentNumericValue: number | null,
  currentDisplayValue: string,
  proposedNumericValue: number | null,
  proposedDisplayValue: string,
): boolean {
  if (
    typeof currentNumericValue === "number" &&
    typeof proposedNumericValue === "number" &&
    Math.abs(currentNumericValue - proposedNumericValue) < 0.0001
  ) {
    return true;
  }

  return currentDisplayValue.trim() === proposedDisplayValue.trim();
}

export function applyPlanningExtractionProposal(
  planning: PlanningBlock,
  result: PlanningExtractionResult,
): AppliedPlanningExtraction {
  const nextPlanning: PlanningBlock = {
    ...planning,
    source_articles: uniqueSourceArticles([
      ...planning.source_articles,
      ...result.sourceArticles,
    ]).slice(0, MAX_SOURCE_ARTICLES),
  };
  const appliedFields: string[] = [];
  const conflictFields: string[] = [];
  const warnings = [...result.warnings];
  const extractionLabel =
    result.sourceType === "pdf"
      ? `Extracción PDF: ${result.sourceLabel}`
      : `Extracción URL: ${result.sourceLabel}`;

  if (planning.rules_confirmed_by_user) {
    const reviewNotes = appendText(planning.review_notes, [
      extractionLabel,
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

  const metricMappings: Array<{
    numericKey:
      | "buildability_total_m2"
      | "buildability_above_ground_m2"
      | "buildability_below_ground_m2"
      | "max_height_eaves_m"
      | "max_height_ridge_m"
      | "setback_boundary_m"
      | "setback_street_m";
    displayKey:
      | "buildability_total_m2_display"
      | "buildability_above_ground_m2_display"
      | "buildability_below_ground_m2_display"
      | "max_height_eaves_m_display"
      | "max_height_ridge_m_display"
      | "setback_boundary_m_display"
      | "setback_street_m_display";
    label: string;
  }> = [
    {
      numericKey: "buildability_total_m2",
      displayKey: "buildability_total_m2_display",
      label: "planning.rules.buildability_total_m2",
    },
    {
      numericKey: "buildability_above_ground_m2",
      displayKey: "buildability_above_ground_m2_display",
      label: "planning.rules.buildability_above_ground_m2",
    },
    {
      numericKey: "buildability_below_ground_m2",
      displayKey: "buildability_below_ground_m2_display",
      label: "planning.rules.buildability_below_ground_m2",
    },
    {
      numericKey: "max_height_eaves_m",
      displayKey: "max_height_eaves_m_display",
      label: "planning.rules.max_height_eaves_m",
    },
    {
      numericKey: "max_height_ridge_m",
      displayKey: "max_height_ridge_m_display",
      label: "planning.rules.max_height_ridge_m",
    },
    {
      numericKey: "setback_boundary_m",
      displayKey: "setback_boundary_m_display",
      label: "planning.rules.setback_boundary_m",
    },
    {
      numericKey: "setback_street_m",
      displayKey: "setback_street_m_display",
      label: "planning.rules.setback_street_m",
    },
  ];

  const textMappings: Array<{
    key: "occupancy" | "max_floors";
    label: string;
  }> = [
    { key: "occupancy", label: "planning.rules.occupancy" },
    { key: "max_floors", label: "planning.rules.max_floors" },
  ];

  for (const mapping of metricMappings) {
    const proposedNumericValue = result.rules[mapping.numericKey] ?? null;
    const proposedDisplayValue = result.rules[mapping.displayKey] ?? "";

    if (proposedNumericValue === null && !hasText(proposedDisplayValue)) {
      continue;
    }

    const currentHasValue = metricFieldHasValue(
      nextPlanning.rules,
      mapping.numericKey,
      mapping.displayKey,
    );

    if (!currentHasValue) {
      nextPlanning.rules = {
        ...nextPlanning.rules,
        [mapping.numericKey]: proposedNumericValue,
        [mapping.displayKey]: proposedDisplayValue,
      };
      appliedFields.push(mapping.label);
      continue;
    }

    if (
      sameMetricValue(
        nextPlanning.rules[mapping.numericKey] as number | null,
        nextPlanning.rules[mapping.displayKey] as string,
        proposedNumericValue,
        proposedDisplayValue,
      )
    ) {
      nextPlanning.rules = {
        ...nextPlanning.rules,
        [mapping.numericKey]: proposedNumericValue,
        [mapping.displayKey]: proposedDisplayValue,
      };
      continue;
    }

    conflictFields.push(mapping.label);
    warnings.push(`Conflicto en ${mapping.label}: se mantiene el valor manual.`);
  }

  for (const mapping of textMappings) {
    const proposedValue = result.rules[mapping.key] ?? "";
    if (!hasText(proposedValue)) {
      continue;
    }

    const currentValue = nextPlanning.rules[mapping.key];
    if (!hasText(currentValue)) {
      nextPlanning.rules = {
        ...nextPlanning.rules,
        [mapping.key]: proposedValue,
      };
      appliedFields.push(mapping.label);
      continue;
    }

    if (currentValue.trim() !== proposedValue.trim()) {
      conflictFields.push(mapping.label);
      warnings.push(`Conflicto en ${mapping.label}: se mantiene el valor manual.`);
    }
  }

  const reviewNotes = appendText(planning.review_notes, [
    extractionLabel,
    `Confianza estimada: ${result.confidence}.`,
    appliedFields.length > 0
      ? `Campos propuestos aplicados: ${appliedFields.join(", ")}`
      : "No se aplicaron campos nuevos automáticamente.",
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
