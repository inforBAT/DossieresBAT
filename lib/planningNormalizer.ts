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
    buildabilityAboveGround !== null
      ? `Sobre rasante: ${formatSquareMeters(buildabilityAboveGround)}`
      : "",
    buildabilityBelowGround !== null
      ? `Bajo rasante: ${formatSquareMeters(buildabilityBelowGround)}`
      : "",
    buildabilityTotal !== null
      ? `Total: ${formatSquareMeters(buildabilityTotal)}`
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
        buildability_total_m2: buildabilityTotal,
        buildability_total_m2_display: formatSquareMeters(buildabilityTotal),
        buildability_above_ground_m2: buildabilityAboveGround,
        buildability_above_ground_m2_display: formatSquareMeters(
          buildabilityAboveGround,
        ),
        buildability_below_ground_m2: buildabilityBelowGround,
        buildability_below_ground_m2_display: formatSquareMeters(
          buildabilityBelowGround,
        ),
        max_height_eaves_m: heightEaves,
        max_height_eaves_m_display: formatMeters(heightEaves),
        max_height_ridge_m: heightRidge,
        max_height_ridge_m_display: formatMeters(heightRidge),
        setback_boundary_m: setbackBoundary,
        setback_boundary_m_display: formatMeters(setbackBoundary),
        setback_street_m: setbackStreet,
        setback_street_m_display: formatMeters(setbackStreet),
      },
    },
    program: {
      ...normalized.program,
      allowed_total_built_m2:
        buildabilityTotal ?? normalized.program.allowed_total_built_m2,
      allowed_total_built_m2_display:
        buildabilityTotal !== null
          ? formatSquareMeters(buildabilityTotal)
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
