import { buildProjectInput } from "./buildProjectInput";
import type { ProjectInputV2 } from "./projectInputSchema";

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

export function parseMetricNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/m²|m2|mts2|mts|metros cuadrados|metros?/gi, "")
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimal(value: number): string {
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

export function formatSquareMeters(value: number | null): string {
  return value === null ? "" : `${formatDecimal(value)} m²`;
}

export function formatMeters(value: number | null): string {
  return value === null ? "" : `${formatDecimal(value)} m`;
}

function preserveMetricField(
  parsedValue: number | null,
  currentNumericValue: number | null,
  currentDisplayValue: string,
  formatter: (value: number | null) => string,
): { numericValue: number | null; displayValue: string } {
  const trimmedDisplayValue = currentDisplayValue.trim();

  if (!trimmedDisplayValue) {
    return {
      numericValue: currentNumericValue,
      displayValue: formatter(currentNumericValue),
    };
  }

  if (parsedValue === null) {
    return {
      numericValue: currentNumericValue,
      displayValue: currentDisplayValue,
    };
  }

  return {
    numericValue: parsedValue,
    displayValue: formatter(parsedValue),
  };
}

function hasPlanningSignals(projectInput: ProjectInputV2): boolean {
  const { planning } = projectInput;

  return (
    hasText(planning.zone) ||
    hasText(planning.ordinance) ||
    hasText(planning.review_notes) ||
    hasText(planning.rules.occupancy) ||
    hasText(planning.rules.max_floors) ||
    hasText(planning.rules.buildability_total_m2_display) ||
    hasText(planning.rules.buildability_above_ground_m2_display) ||
    hasText(planning.rules.buildability_below_ground_m2_display) ||
    hasText(planning.rules.max_height_eaves_m_display) ||
    hasText(planning.rules.max_height_ridge_m_display) ||
    hasText(planning.rules.setback_boundary_m_display) ||
    hasText(planning.rules.setback_street_m_display) ||
    typeof planning.rules.buildability_total_m2 === "number" ||
    typeof planning.rules.buildability_above_ground_m2 === "number" ||
    typeof planning.rules.buildability_below_ground_m2 === "number" ||
    typeof planning.rules.max_height_eaves_m === "number" ||
    typeof planning.rules.max_height_ridge_m === "number" ||
    typeof planning.rules.setback_boundary_m === "number" ||
    typeof planning.rules.setback_street_m === "number"
  );
}

export function normalizePlanningInput(
  projectInput: ProjectInputV2,
): ProjectInputV2 {
  const normalized = buildProjectInput(projectInput);

  const buildabilityTotal = parseMetricNumber(
    normalized.planning.rules.buildability_total_m2_display,
  );
  const buildabilityAboveGround = parseMetricNumber(
    normalized.planning.rules.buildability_above_ground_m2_display,
  );
  const buildabilityBelowGround = parseMetricNumber(
    normalized.planning.rules.buildability_below_ground_m2_display,
  );
  const heightEaves = parseMetricNumber(
    normalized.planning.rules.max_height_eaves_m_display,
  );
  const heightRidge = parseMetricNumber(
    normalized.planning.rules.max_height_ridge_m_display,
  );
  const setbackBoundary = parseMetricNumber(
    normalized.planning.rules.setback_boundary_m_display,
  );
  const setbackStreet = parseMetricNumber(
    normalized.planning.rules.setback_street_m_display,
  );
  const buildabilityTotalField = preserveMetricField(
    buildabilityTotal,
    normalized.planning.rules.buildability_total_m2,
    normalized.planning.rules.buildability_total_m2_display,
    formatSquareMeters,
  );
  const buildabilityAboveGroundField = preserveMetricField(
    buildabilityAboveGround,
    normalized.planning.rules.buildability_above_ground_m2,
    normalized.planning.rules.buildability_above_ground_m2_display,
    formatSquareMeters,
  );
  const buildabilityBelowGroundField = preserveMetricField(
    buildabilityBelowGround,
    normalized.planning.rules.buildability_below_ground_m2,
    normalized.planning.rules.buildability_below_ground_m2_display,
    formatSquareMeters,
  );
  const heightEavesField = preserveMetricField(
    heightEaves,
    normalized.planning.rules.max_height_eaves_m,
    normalized.planning.rules.max_height_eaves_m_display,
    formatMeters,
  );
  const heightRidgeField = preserveMetricField(
    heightRidge,
    normalized.planning.rules.max_height_ridge_m,
    normalized.planning.rules.max_height_ridge_m_display,
    formatMeters,
  );
  const setbackBoundaryField = preserveMetricField(
    setbackBoundary,
    normalized.planning.rules.setback_boundary_m,
    normalized.planning.rules.setback_boundary_m_display,
    formatMeters,
  );
  const setbackStreetField = preserveMetricField(
    setbackStreet,
    normalized.planning.rules.setback_street_m,
    normalized.planning.rules.setback_street_m_display,
    formatMeters,
  );

  const hasPlanningData = hasPlanningSignals(normalized);
  const planningWarnings = normalized.planning.rules_confirmed_by_user
    ? normalized.workflow.warnings.filter(
        (warning) => warning !== "planning.rules_need_human_review",
      )
    : uniqueStrings([
        ...normalized.workflow.warnings,
        ...(hasPlanningData ? ["planning.rules_need_human_review"] : []),
      ]);

  const allowedTotalsLines = [
    buildabilityAboveGroundField.numericValue !== null
      ? `Sobre rasante: ${formatSquareMeters(buildabilityAboveGroundField.numericValue)}`
      : "",
    buildabilityBelowGroundField.numericValue !== null
      ? `Bajo rasante: ${formatSquareMeters(buildabilityBelowGroundField.numericValue)}`
      : "",
    buildabilityTotalField.numericValue !== null
      ? `Total: ${formatSquareMeters(buildabilityTotalField.numericValue)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ...normalized,
    planning: {
      ...normalized.planning,
      status: hasPlanningData
        ? normalized.planning.rules_confirmed_by_user
          ? "reviewed"
          : "processed_needs_review"
        : "not_started",
      rules: {
        ...normalized.planning.rules,
        buildability_total_m2: buildabilityTotalField.numericValue,
        buildability_total_m2_display: buildabilityTotalField.displayValue,
        buildability_above_ground_m2: buildabilityAboveGroundField.numericValue,
        buildability_above_ground_m2_display:
          buildabilityAboveGroundField.displayValue,
        buildability_below_ground_m2: buildabilityBelowGroundField.numericValue,
        buildability_below_ground_m2_display:
          buildabilityBelowGroundField.displayValue,
        max_height_eaves_m: heightEavesField.numericValue,
        max_height_eaves_m_display: heightEavesField.displayValue,
        max_height_ridge_m: heightRidgeField.numericValue,
        max_height_ridge_m_display: heightRidgeField.displayValue,
        setback_boundary_m: setbackBoundaryField.numericValue,
        setback_boundary_m_display: setbackBoundaryField.displayValue,
        setback_street_m: setbackStreetField.numericValue,
        setback_street_m_display: setbackStreetField.displayValue,
      },
    },
    program: {
      ...normalized.program,
      allowed_total_built_m2:
        buildabilityTotalField.numericValue ??
        normalized.program.allowed_total_built_m2,
      allowed_total_built_m2_display:
        buildabilityTotalField.numericValue !== null
          ? formatSquareMeters(buildabilityTotalField.numericValue)
          : normalized.program.allowed_total_built_m2_display,
      allowed_totals_lines:
        allowedTotalsLines || normalized.program.allowed_totals_lines,
    },
    workflow: {
      ...normalized.workflow,
      warnings: planningWarnings,
    },
  };
}
