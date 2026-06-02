import {
  MINIMUM_REQUIREMENTS,
  type ProjectInputV2,
  type RequirementMissing,
  type RequirementOptional,
  type RequirementResolved,
  type WorkflowStatus,
} from "./projectInputSchema";

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function getPath(input: ProjectInputV2, path: string): string {
  const [block, key] = path.split(".") as [keyof ProjectInputV2, string];
  const value = (input[block] as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function missingRequirement(input: {
  id: string;
  label: string;
  message: string;
  requested_input_type: string;
  acceptable_files?: string[];
  blocks_pdf_generation?: boolean;
}): RequirementMissing {
  return {
    id: input.id,
    label: input.label,
    severity: "required",
    message: input.message,
    requested_input_type: input.requested_input_type,
    acceptable_files: input.acceptable_files ?? [],
    blocks_pdf_generation: input.blocks_pdf_generation ?? true,
  };
}

function resolvedRequirement(
  id: string,
  label: string,
  source: string,
  resolvedAt: string,
): RequirementResolved {
  return {
    id,
    label,
    source,
    resolved_at: resolvedAt,
  };
}

function optionalRequirement(input: {
  id: string;
  label: string;
  message: string;
  requested_input_type: string;
  acceptable_files?: string[];
}): RequirementOptional {
  return {
    id: input.id,
    label: input.label,
    message: input.message,
    requested_input_type: input.requested_input_type,
    acceptable_files: input.acceptable_files ?? [],
  };
}

function surveyReviewed(status: ProjectInputV2["survey"]["status"]): boolean {
  return status === "reviewed" || status === "confirmed";
}

function surveyNormalizationPending(
  status: ProjectInputV2["survey"]["status"],
): boolean {
  return status === "pending_normalization";
}

function hasManualPlanningRules(projectInput: ProjectInputV2): boolean {
  const { planning } = projectInput;
  const { rules } = planning;

  return (
    hasText(planning.review_notes) ||
    hasText(rules.buildability_total_m2_display) ||
    hasText(rules.buildability_above_ground_m2_display) ||
    hasText(rules.buildability_below_ground_m2_display) ||
    hasText(rules.occupancy) ||
    hasText(rules.max_floors) ||
    hasText(rules.max_height_eaves_m_display) ||
    hasText(rules.max_height_ridge_m_display) ||
    hasText(rules.setback_boundary_m_display) ||
    hasText(rules.setback_street_m_display) ||
    typeof rules.buildability_total_m2 === "number" ||
    typeof rules.buildability_above_ground_m2 === "number" ||
    typeof rules.buildability_below_ground_m2 === "number" ||
    typeof rules.max_height_eaves_m === "number" ||
    typeof rules.max_height_ridge_m === "number" ||
    typeof rules.setback_boundary_m === "number" ||
    typeof rules.setback_street_m === "number"
  );
}

export function updateRequirementsAndWorkflow(
  projectInput: ProjectInputV2,
  updatedAt = projectInput.workflow.updated_at,
): ProjectInputV2 {
  const resolvedAt = updatedAt ?? "";
  const missing: RequirementMissing[] = [];
  const resolved: RequirementResolved[] = [];
  const warnings: string[] = [];

  for (const requirement of MINIMUM_REQUIREMENTS) {
    if (!hasText(getPath(projectInput, requirement.path))) {
      missing.push(
        missingRequirement({
          id: requirement.requirement_id,
          label: requirement.label,
          message: `${requirement.label} es obligatorio para crear el expediente.`,
          requested_input_type: "text",
        }),
      );
    } else {
      resolved.push(
        resolvedRequirement(
          requirement.requirement_id,
          requirement.label,
          requirement.path,
          resolvedAt,
        ),
      );
    }
  }

  const firstSurveyFile = projectInput.assets.survey_files[0];
  const firstCadFile = projectInput.assets.cad_files[0];
  const firstPlanningFile = projectInput.assets.planning_files[0];
  const hasSurvey = Boolean(firstSurveyFile);
  const hasGeometry =
    hasText(projectInput.site.cadastre_reference) || Boolean(firstCadFile);
  const hasPlanning =
    hasText(projectInput.planning.planning_url) ||
    hasText(projectInput.planning.planning_document) ||
    hasText(projectInput.planning.zone) ||
    hasText(projectInput.planning.ordinance) ||
    hasManualPlanningRules(projectInput) ||
    Boolean(firstPlanningFile);

  if (!hasSurvey) {
    missing.push(
      missingRequirement({
        id: "survey_file_required",
        label: "Encuesta / briefing",
        message: "Añade un XLSX o CSV de encuesta para poder normalizar el briefing.",
        requested_input_type: "file",
        acceptable_files: [".xlsx", ".csv"],
      }),
    );
  } else {
    resolved.push(
      resolvedRequirement(
        "survey_file_required",
        "Encuesta / briefing",
        firstSurveyFile.path,
        resolvedAt,
      ),
    );
  }

  if (!hasGeometry) {
    missing.push(
      missingRequirement({
        id: "parcel_geometry_required",
        label: "Geometría o referencia catastral",
        message:
          "Añade una referencia catastral o un archivo CAD/plano para definir la parcela.",
        requested_input_type: "file_or_text",
        acceptable_files: [".dwg", ".dxf", ".svg", ".pdf"],
      }),
    );
  } else {
    resolved.push(
      resolvedRequirement(
        "parcel_geometry_required",
        "Geometría o referencia catastral",
        firstCadFile?.path || "site.cadastre_reference",
        resolvedAt,
      ),
    );
  }

  if (!hasPlanning) {
    missing.push(
      missingRequirement({
        id: "planning_rules_required",
        label: "Normativa urbanística",
        message:
          "Añade una URL, datos básicos de normativa o un archivo de planeamiento.",
        requested_input_type: "file_or_url",
        acceptable_files: [".pdf", ".docx", ".txt", ".xlsx", ".csv"],
      }),
    );
  } else {
    resolved.push(
      resolvedRequirement(
        "planning_rules_required",
        "Normativa urbanística",
        firstPlanningFile?.path || "planning.fields",
        resolvedAt,
      ),
    );
  }

  if (hasSurvey && surveyNormalizationPending(projectInput.survey.status)) {
    warnings.push("survey.status_pending_review");
  }

  if (hasPlanning && !projectInput.planning.rules_confirmed_by_user) {
    warnings.push("planning.rules_need_human_review");
  }

  const optional: RequirementOptional[] = [];
  if (projectInput.assets.site_photos.length === 0) {
    optional.push(
      optionalRequirement({
        id: "site_photos_optional",
        label: "Fotos del solar",
        message: "Añade fotos del solar si quieres enriquecer el análisis visual.",
        requested_input_type: "file",
        acceptable_files: [".jpg", ".jpeg", ".png", ".heic"],
      }),
    );
  }

  const planningStatus = hasPlanning
    ? projectInput.planning.rules_confirmed_by_user
      ? "reviewed"
      : "processed_needs_review"
    : "not_started";

  const canGeneratePdf =
    missing.length === 0 &&
    planningStatus === "reviewed" &&
    surveyReviewed(projectInput.survey.status);

  const humanReviewRequired =
    missing.length > 0 ||
    warnings.length > 0 ||
    !projectInput.planning.rules_confirmed_by_user ||
    !surveyReviewed(projectInput.survey.status);

  let status: WorkflowStatus = "draft";
  let currentStep = "project_created";
  let nextAction = "collect_site_inputs";
  const hasStarted =
    hasText(projectInput.project.title) ||
    hasText(projectInput.site.address) ||
    hasSurvey ||
    hasGeometry ||
    hasPlanning;

  if (!hasStarted) {
    status = "draft";
  } else if (missing.length > 0) {
    status = "needs_user_input";
    currentStep = "collect_missing_inputs";
    nextAction = "complete_required_fields";
  } else if (humanReviewRequired) {
    status = "needs_human_review";
    currentStep = "human_review";
    nextAction = "review_survey_and_planning_rules";
  } else if (canGeneratePdf) {
    status = "ready_for_pdf";
    currentStep = "ready_for_pdf";
    nextAction = "generate_pdf";
  } else {
    status = "ready_for_analysis";
    currentStep = "ready_for_analysis";
    nextAction = "run_analysis";
  }

  return {
    ...projectInput,
    workflow: {
      ...projectInput.workflow,
      status,
      can_generate_pdf: canGeneratePdf,
      current_step: currentStep,
      next_action: nextAction,
      blocking_reasons: missing
        .filter((requirement) => requirement.blocks_pdf_generation)
        .map((requirement) => requirement.id),
      warnings,
      human_review_required: humanReviewRequired,
      updated_at: updatedAt,
    },
    requirements: {
      missing,
      resolved,
      optional,
    },
    parcel: {
      ...projectInput.parcel,
      geometry_source: firstCadFile
        ? "cad_file"
        : hasText(projectInput.site.cadastre_reference)
          ? "cadastre_reference"
          : projectInput.parcel.geometry_source,
      geometry_file: firstCadFile?.path ?? projectInput.parcel.geometry_file,
    },
    planning: {
      ...projectInput.planning,
      status: planningStatus,
      municipality:
        projectInput.planning.municipality || projectInput.site.municipality,
      planning_document_file:
        firstPlanningFile?.path ?? projectInput.planning.planning_document_file,
    },
    survey: {
      ...projectInput.survey,
      source_file: firstSurveyFile?.path ?? projectInput.survey.source_file,
    },
  };
}
