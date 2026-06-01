import { buildProjectInput } from "./buildProjectInput";
import type { GraphicSpec, ProjectInputV2 } from "./projectInputSchema";

const LAYOUTS = {
  analysis_parcel: "layout_analysis_parcel_v01",
  survey_results: "layout_survey_simple",
  program_strategies: "layout_program_comparison",
  implantation_strategies: "layout_implantation_skeleton",
} as const;

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function displayMetric(
  displayValue: string | null | undefined,
  numericValue: number | null | undefined,
  unit: string,
): string {
  if (hasText(displayValue)) {
    return displayValue.trim();
  }

  if (typeof numericValue === "number" && Number.isFinite(numericValue)) {
    return `${numericValue} ${unit}`;
  }

  return "";
}

function appendUnique(existing: string[], additions: string[]): string[] {
  const result = [...existing];
  const seen = new Set(
    existing
      .filter((item) => hasText(item))
      .map((item) => item.trim().toLocaleLowerCase("es")),
  );

  for (const addition of additions) {
    if (!hasText(addition)) {
      continue;
    }

    const normalized = addition.trim().toLocaleLowerCase("es");
    if (!seen.has(normalized)) {
      result.push(addition.trim());
      seen.add(normalized);
    }
  }

  return result;
}

function firstText(values: string[]): string {
  return values.find((value) => hasText(value))?.trim() ?? "";
}

function allAssets(projectInput: ProjectInputV2) {
  return Object.values(projectInput.assets).flat();
}

function hasAssetRole(projectInput: ProjectInputV2, role: string): boolean {
  return allAssets(projectInput).some((asset) => asset.role === role);
}

function buildSetbackRules(
  rules: ProjectInputV2["planning"]["rules"],
): string[] {
  const boundarySetback = displayMetric(
    rules.setback_boundary_m_display,
    rules.setback_boundary_m,
    "m",
  );
  const streetSetback = displayMetric(
    rules.setback_street_m_display,
    rules.setback_street_m,
    "m",
  );
  const poolBoundary = displayMetric(
    rules.pool_boundary_m_display,
    rules.pool_boundary_m,
    "m",
  );

  return [
    boundarySetback ? `Retranqueo a linderos: ${boundarySetback}` : "",
    streetSetback ? `Retranqueo a calle: ${streetSetback}` : "",
    poolBoundary ? `Separacion de piscina a linderos: ${poolBoundary}` : "",
  ].filter(hasText);
}

function buildBuildabilityRules(
  rules: ProjectInputV2["planning"]["rules"],
): string[] {
  const total = displayMetric(
    rules.buildability_total_m2_display,
    rules.buildability_total_m2,
    "m2",
  );
  const aboveGround = displayMetric(
    rules.buildability_above_ground_m2_display,
    rules.buildability_above_ground_m2,
    "m2",
  );
  const belowGround = displayMetric(
    rules.buildability_below_ground_m2_display,
    rules.buildability_below_ground_m2,
    "m2",
  );

  return [
    total ? `Edificabilidad total: ${total}` : "",
    aboveGround ? `Edificabilidad sobre rasante: ${aboveGround}` : "",
    belowGround ? `Edificabilidad bajo rasante: ${belowGround}` : "",
  ].filter(hasText);
}

function hasPlanningData(projectInput: ProjectInputV2): boolean {
  return (
    hasText(projectInput.planning.zone) ||
    hasText(projectInput.planning.ordinance) ||
    buildBuildabilityRules(projectInput.planning.rules).length > 0 ||
    buildSetbackRules(projectInput.planning.rules).length > 0
  );
}

function hasSurveyData(projectInput: ProjectInputV2): boolean {
  const summary = projectInput.survey.summary;

  return (
    projectInput.survey.status !== "empty" ||
    hasText(projectInput.survey.source_file) ||
    summary.main_priorities.length > 0 ||
    hasText(summary.exterior_style) ||
    hasText(summary.interior_style) ||
    summary.day_area_bullets.length > 0
  );
}

function hasProgramData(projectInput: ProjectInputV2): boolean {
  return (
    projectInput.program.status !== "not_started" ||
    hasText(projectInput.program.desired_total_built_m2_display) ||
    hasText(projectInput.program.allowed_total_built_m2_display) ||
    hasText(projectInput.program.excess_m2_display) ||
    typeof projectInput.program.desired_total_built_m2 === "number" ||
    typeof projectInput.program.allowed_total_built_m2 === "number" ||
    typeof projectInput.program.excess_m2 === "number" ||
    projectInput.program.strategies.length > 0
  );
}

function generatedGraphicSpec(spec: GraphicSpec): GraphicSpec {
  return {
    ...spec,
    status: "pending",
    output_path: spec.output_path.startsWith("assets/generated/")
      ? spec.output_path
      : `assets/generated/${spec.output_path}`,
    format: "svg",
  };
}

function upsertGraphicSpec(
  specs: GraphicSpec[],
  nextSpec: GraphicSpec,
): GraphicSpec[] {
  const byId = new Map(dedupeGraphicSpecs(specs).map((spec) => [spec.id, spec]));

  const existing = byId.get(nextSpec.id);
  byId.set(
    nextSpec.id,
    existing
      ? {
          ...nextSpec,
          ...existing,
          id: nextSpec.id,
          type: nextSpec.type,
          inputs: appendUnique(existing.inputs, nextSpec.inputs),
          output_path: existing.output_path || nextSpec.output_path,
          format: existing.format || nextSpec.format,
          layout_role: existing.layout_role || nextSpec.layout_role,
        }
      : generatedGraphicSpec(nextSpec),
  );

  return Array.from(byId.values());
}

function dedupeGraphicSpecs(specs: GraphicSpec[]): GraphicSpec[] {
  const byId = new Map<string, GraphicSpec>();

  for (const spec of specs) {
    if (hasText(spec.id) && !byId.has(spec.id)) {
      byId.set(spec.id, spec);
    }
  }

  return Array.from(byId.values());
}

function hasGraphicSpec(specs: GraphicSpec[], id: string): boolean {
  return specs.some((spec) => spec.id === id);
}

function includeTextBlocks(existing: string[], required: string[]): string[] {
  return appendUnique(required, existing);
}

export function runAnalysisEngine(
  projectInput: ProjectInputV2,
): ProjectInputV2 {
  const normalized = buildProjectInput(projectInput);
  const hasCadastreReference = hasText(normalized.site.cadastre_reference);
  const hasParcelGeometry = hasAssetRole(normalized, "parcel_geometry");
  const setbackRules = buildSetbackRules(normalized.planning.rules);
  const buildabilityRules = buildBuildabilityRules(normalized.planning.rules);
  const planningKeyRules = [...buildabilityRules, ...setbackRules];
  const workflowWarnings: string[] = [];

  const areaDisplay = displayMetric(
    normalized.parcel.area_m2_display,
    normalized.parcel.area_m2,
    "m2",
  );
  const parcelSummary =
    normalized.analysis.parcel.summary ||
    firstText([
      areaDisplay ? `Parcela con superficie aproximada de ${areaDisplay}.` : "",
      hasCadastreReference
        ? `Parcela con referencia catastral ${normalized.site.cadastre_reference}.`
        : "",
      hasParcelGeometry
        ? "Parcela con geometria de parcela aportada."
        : "",
      "Analisis parcelario preparado para revision.",
    ]);

  const parcelMissingData =
    !hasCadastreReference && !hasParcelGeometry
      ? ["Referencia catastral o geometria de parcela."]
      : [];
  const parcelConstraints = appendUnique(
    normalized.analysis.parcel.constraints,
    [
      normalized.parcel.topography
        ? `Topografia: ${normalized.parcel.topography}`
        : "",
      normalized.parcel.slope_description
        ? `Pendiente: ${normalized.parcel.slope_description}`
        : "",
      ...setbackRules,
    ],
  );
  const parcelOpportunities = appendUnique(
    normalized.analysis.parcel.opportunities,
    hasCadastreReference || hasParcelGeometry
      ? ["Base disponible para preparar diagramas parcelarios del dossier."]
      : [],
  );

  const surveyPriorities = normalized.survey.summary.main_priorities;
  const surveyStyleSummary = [
    normalized.survey.summary.exterior_style
      ? `exterior ${normalized.survey.summary.exterior_style}`
      : "",
    normalized.survey.summary.interior_style
      ? `interior ${normalized.survey.summary.interior_style}`
      : "",
  ].filter(hasText);
  const surveySummary =
    normalized.analysis.survey.summary ||
    firstText([
      surveyStyleSummary.length > 0
        ? `Preferencias de estilo: ${surveyStyleSummary.join("; ")}.`
        : "",
      surveyPriorities.length > 0
        ? `Prioridades principales: ${surveyPriorities.join(", ")}.`
        : "",
      hasSurveyData(normalized)
        ? "Encuesta sintetizada para alimentar criterios de diseno."
        : "",
    ]);
  const surveyWarnings =
    normalized.survey.status === "reviewed" ||
    normalized.survey.status === "confirmed"
      ? []
      : ["La encuesta necesita revision humana antes de confirmar criterios."];

  if (surveyWarnings.length > 0 && hasSurveyData(normalized)) {
    workflowWarnings.push("survey.status_pending_review");
  }

  const surveyDesignImplications = appendUnique(
    normalized.analysis.survey.design_implications,
    normalized.survey.summary.day_area_bullets.length > 0
      ? [
          `El area de dia debe responder a: ${normalized.survey.summary.day_area_bullets.join(
            "; ",
          )}.`,
        ]
      : [],
  );

  const planningSummary =
    normalized.analysis.planning.summary ||
    firstText([
      normalized.planning.zone
        ? `Zona urbanistica: ${normalized.planning.zone}.`
        : "",
      normalized.planning.ordinance
        ? `Ordenanza aplicable: ${normalized.planning.ordinance}.`
        : "",
      hasPlanningData(normalized)
        ? "Normativa basica preparada para revision."
        : "",
    ]);
  const planningUncertainties = appendUnique(
    normalized.analysis.planning.uncertainties,
    normalized.planning.rules_confirmed_by_user
      ? []
      : ["Normativa pendiente de confirmacion por el usuario."],
  );

  if (!normalized.planning.rules_confirmed_by_user && hasPlanningData(normalized)) {
    workflowWarnings.push("planning.rules_need_human_review");
  }

  const desiredSurface = displayMetric(
    normalized.program.desired_total_built_m2_display,
    normalized.program.desired_total_built_m2,
    "m2",
  );
  const allowedSurface = displayMetric(
    normalized.program.allowed_total_built_m2_display,
    normalized.program.allowed_total_built_m2,
    "m2",
  );
  const excessSurface = displayMetric(
    normalized.program.excess_m2_display,
    normalized.program.excess_m2,
    "m2",
  );
  const hasProgramComparison = Boolean(desiredSurface && allowedSurface);
  const programSurfaceBalance =
    normalized.analysis.program.surface_balance ||
    (hasProgramComparison
      ? `Superficie deseada: ${desiredSurface}. Superficie permitida: ${allowedSurface}.`
      : "");
  const programSummary =
    normalized.analysis.program.summary ||
    firstText([
      hasProgramComparison
        ? "Programa contrastado con la superficie urbanistica disponible."
        : "",
      hasProgramData(normalized)
        ? "Programa preparado para completar estrategias."
        : "",
      "Datos de programa pendientes para comparar superficies.",
    ]);
  const programAdjustments = appendUnique(
    normalized.analysis.program.recommended_adjustments,
    excessSurface
      ? [
          `Reducir o redistribuir aproximadamente ${excessSurface} para ajustarse a la superficie permitida.`,
        ]
      : [],
  );
  const programStrategyNotes = appendUnique(
    normalized.analysis.program.strategy_notes,
    hasProgramData(normalized)
      ? []
      : ["Faltan datos de programa para proponer estrategias comparables."],
  );

  const analysis: ProjectInputV2["analysis"] = {
    status:
      normalized.analysis.status === "reviewed" ||
      normalized.analysis.status === "confirmed"
        ? normalized.analysis.status
        : "processed_needs_review",
    parcel: {
      ...normalized.analysis.parcel,
      summary: parcelSummary,
      constraints: parcelConstraints,
      opportunities: parcelOpportunities,
      missing_data: appendUnique(
        normalized.analysis.parcel.missing_data,
        parcelMissingData,
      ),
    },
    survey: {
      ...normalized.analysis.survey,
      summary: surveySummary,
      key_findings: appendUnique(
        normalized.analysis.survey.key_findings,
        surveyPriorities,
      ),
      design_implications: surveyDesignImplications,
      warnings: appendUnique(normalized.analysis.survey.warnings, surveyWarnings),
    },
    planning: {
      ...normalized.analysis.planning,
      summary: planningSummary,
      key_rules: appendUnique(
        normalized.analysis.planning.key_rules,
        planningKeyRules,
      ),
      uncertainties: planningUncertainties,
      requires_human_review:
        normalized.analysis.planning.requires_human_review ||
        !normalized.planning.rules_confirmed_by_user,
    },
    program: {
      ...normalized.analysis.program,
      summary: programSummary,
      surface_balance: programSurfaceBalance,
      recommended_adjustments: programAdjustments,
      strategy_notes: programStrategyNotes,
    },
  };

  let specs = dedupeGraphicSpecs(normalized.graphics.specs);

  if (surveyPriorities.length > 0) {
    specs = upsertGraphicSpec(specs, {
      id: "g_survey_priorities",
      type: "survey_priorities",
      status: "pending",
      title: "Prioridades de encuesta",
      description: "Grafico resumen de prioridades principales del briefing.",
      inputs: ["survey.summary.main_priorities", "analysis.survey.key_findings"],
      output_path: "assets/generated/g_survey_priorities.svg",
      format: "svg",
      layout_role: "survey_results",
      requires_human_review: true,
    });
  }

  if (hasProgramComparison) {
    specs = upsertGraphicSpec(specs, {
      id: "g_program_comparison",
      type: "program_comparison",
      status: "pending",
      title: "Comparativa de superficies",
      description: "Comparacion entre superficie deseada y superficie permitida.",
      inputs: [
        "program.desired_total_built_m2_display",
        "program.allowed_total_built_m2_display",
        "analysis.program.surface_balance",
      ],
      output_path: "assets/generated/g_program_comparison.svg",
      format: "svg",
      layout_role: "program_strategies",
      requires_human_review: true,
    });
  }

  if ((hasCadastreReference || hasParcelGeometry) && setbackRules.length > 0) {
    specs = upsertGraphicSpec(specs, {
      id: "g_parcel_setbacks",
      type: "parcel_setbacks",
      status: "pending",
      title: "Retranqueos de parcela",
      description: "Diagrama pendiente de retranqueos aplicables sobre parcela.",
      inputs: [
        "site.cadastre_reference",
        "assets.*.role:parcel_geometry",
        "planning.rules.setback_boundary_m_display",
        "planning.rules.setback_street_m_display",
      ],
      output_path: "assets/generated/g_parcel_setbacks.svg",
      format: "svg",
      layout_role: "analysis_parcel",
      requires_human_review: true,
    });
  }

  const hasSurveyPrioritiesSpec = hasGraphicSpec(specs, "g_survey_priorities");
  const hasProgramComparisonSpec = hasGraphicSpec(specs, "g_program_comparison");
  const hasParcelSetbacksSpec = hasGraphicSpec(specs, "g_parcel_setbacks");
  const hasParcelOrPlanningData =
    hasText(areaDisplay) ||
    hasText(normalized.parcel.topography) ||
    hasText(normalized.parcel.slope_description) ||
    hasCadastreReference ||
    hasParcelGeometry ||
    hasPlanningData(normalized);
  const hasSurveyLayoutData =
    hasSurveyData(normalized) || hasSurveyPrioritiesSpec;
  const hasProgramLayoutData =
    hasProgramData(normalized) || hasProgramComparisonSpec;
  const knownLayoutSections = new Set([
    "cover",
    "analysis_parcel",
    "survey_results",
    "program_strategies",
    "implantation_strategies",
  ]);
  const preservedCustomPages =
    normalized.indesign.layout_plan.page_sequence.filter(
      (page) => !knownLayoutSections.has(page),
    );
  const pageSequence = appendUnique(
    [
      "cover",
      ...(hasParcelOrPlanningData ? ["analysis_parcel"] : []),
      ...(hasSurveyLayoutData ? ["survey_results"] : []),
      ...(hasProgramLayoutData ? ["program_strategies"] : []),
      ...preservedCustomPages,
      "implantation_strategies",
    ],
    [],
  );
  const graphicSlots = {
    ...normalized.indesign.layout_plan.graphic_slots,
    analysis_parcel: appendUnique(
      normalized.indesign.layout_plan.graphic_slots.analysis_parcel ?? [],
      hasParcelSetbacksSpec ? ["g_parcel_setbacks"] : [],
    ),
    survey_results: appendUnique(
      normalized.indesign.layout_plan.graphic_slots.survey_results ?? [],
      hasSurveyPrioritiesSpec ? ["g_survey_priorities"] : [],
    ),
    program_strategies: appendUnique(
      normalized.indesign.layout_plan.graphic_slots.program_strategies ?? [],
      hasProgramComparisonSpec ? ["g_program_comparison"] : [],
    ),
    implantation_strategies:
      normalized.indesign.layout_plan.graphic_slots.implantation_strategies ??
      [],
  };
  const textBlocks = {
    ...normalized.indesign.layout_plan.text_blocks,
    analysis_parcel: includeTextBlocks(
      normalized.indesign.layout_plan.text_blocks.analysis_parcel ?? [],
      [
        "analysis.parcel.summary",
        "analysis.parcel.constraints",
        "analysis.parcel.opportunities",
      ],
    ),
    survey_results: includeTextBlocks(
      normalized.indesign.layout_plan.text_blocks.survey_results ?? [],
      [
        "analysis.survey.summary",
        "analysis.survey.key_findings",
        "analysis.survey.design_implications",
      ],
    ),
    program_strategies: includeTextBlocks(
      normalized.indesign.layout_plan.text_blocks.program_strategies ?? [],
      [
        "analysis.program.summary",
        "analysis.program.surface_balance",
        "analysis.program.recommended_adjustments",
      ],
    ),
    implantation_strategies:
      normalized.indesign.layout_plan.text_blocks.implantation_strategies ?? [],
  };

  return {
    ...normalized,
    workflow: {
      ...normalized.workflow,
      current_step: "analysis_engine_completed",
      next_action: "review_analysis_graphics_and_layout",
      warnings: appendUnique(normalized.workflow.warnings, workflowWarnings),
    },
    analysis,
    graphics: {
      ...normalized.graphics,
      specs,
    },
    indesign: {
      ...normalized.indesign,
      layout_plan: {
        ...normalized.indesign.layout_plan,
        status: "needs_review",
        page_sequence: pageSequence,
        section_layouts: {
          ...normalized.indesign.layout_plan.section_layouts,
          ...LAYOUTS,
        },
        graphic_slots: graphicSlots,
        text_blocks: textBlocks,
        overflow_policy: "add_page_if_needed",
        requires_human_review: true,
      },
    },
  };
}
