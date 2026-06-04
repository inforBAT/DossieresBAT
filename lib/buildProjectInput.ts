import {
  ANALYSIS_STATUSES,
  ASSET_CATEGORIES,
  EMPTY_PROJECT_INPUT_V2,
  GRAPHIC_FORMATS,
  GRAPHIC_STATUSES,
  GRAPHIC_TYPES,
  LAYOUT_PLAN_STATUSES,
  OVERFLOW_POLICIES,
  PLANNING_RULE_CONFIDENCES,
  PLANNING_RULE_PROPOSAL_STATUSES,
  WORKFLOW_STATUSES,
  type AssetCategory,
  type AssetsBlock,
  type PlanningListRuleProposal,
  type PlanningNumericRuleProposal,
  type PlanningRuleConfidence,
  type PlanningRuleProposalStatus,
  type DossieresWebhookPayload,
  type AnalysisStatus,
  type GraphicFormat,
  type GraphicSpec,
  type GraphicStatus,
  type GraphicType,
  type LayoutPlanStatus,
  type OverflowPolicy,
  type PlanningRulesProposal,
  type PlanningSourceArticle,
  type PlanningStatus,
  type ProjectInputV2,
  type SurveyStatus,
  type WorkflowStatus,
} from "./projectInputSchema";

const TEMPLATE_VERSION = "dossieres_indesign_v01";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function cloneEmptyProjectInput(): ProjectInputV2 {
  return JSON.parse(JSON.stringify(EMPTY_PROJECT_INPUT_V2)) as ProjectInputV2;
}

function normalizeIdSegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function compactDate(value: string): string {
  return value.replace(/[^0-9]/g, "") || "SIN_FECHA";
}

function buildTitleSegment(title: string, municipality: string): string {
  const municipalitySegment = normalizeIdSegment(municipality);

  const stopWords = new Set([
    "UNIFAMILIAR",
    "VIVIENDA",
    "CASA",
    "EN",
    "DE",
    "DEL",
    "LA",
    "EL",
    "LOS",
    "LAS",
    "Y",
    "BIDEA",
    "CALLE",
    "AVENIDA",
    "PASEO",
    "CAMINO",
  ]);

  const words = normalizeIdSegment(title)
    .split("_")
    .filter(Boolean)
    .filter((word) => !stopWords.has(word))
    .filter((word) => word !== municipalitySegment)
    .slice(0, 3);

  return words.join("_") || "DOSSIER";
}

function isPlaceholderProjectId(id: string): boolean {
  const normalized = normalizeIdSegment(id);

  if (!normalized) {
    return true;
  }

  const segments = normalized.split("_").filter(Boolean);

  return (
    segments.includes("MUNICIPIO") ||
    segments.includes("DOSSIER") ||
    normalized.endsWith("_SIN_FECHA")
  );
}

function normalizeWorkflowStatus(status: unknown): WorkflowStatus {
  return WORKFLOW_STATUSES.includes(status as WorkflowStatus)
    ? (status as WorkflowStatus)
    : "draft";
}

function normalizeAnalysisStatus(status: unknown): AnalysisStatus {
  return ANALYSIS_STATUSES.includes(status as AnalysisStatus)
    ? (status as AnalysisStatus)
    : "not_started";
}

function normalizeSurveyStatus(status: unknown): SurveyStatus {
  if (status === "normalized") {
    return "processed_needs_review";
  }

  if (
    status === "empty" ||
    status === "pending_normalization" ||
    status === "processed_needs_review" ||
    status === "reviewed" ||
    status === "confirmed"
  ) {
    return status;
  }

  return "empty";
}

function normalizePlanningStatus(status: unknown): PlanningStatus {
  if (status === "empty") {
    return "not_started";
  }

  if (
    status === "not_started" ||
    status === "needs_user_input" ||
    status === "needs_human_review" ||
    status === "processed_needs_review" ||
    status === "reviewed" ||
    status === "confirmed"
  ) {
    return status;
  }

  return "not_started";
}

function normalizeLayoutPlanStatus(status: unknown): LayoutPlanStatus {
  return LAYOUT_PLAN_STATUSES.includes(status as LayoutPlanStatus)
    ? (status as LayoutPlanStatus)
    : "pending";
}

function normalizeOverflowPolicy(policy: unknown): OverflowPolicy {
  if (OVERFLOW_POLICIES.includes(policy as OverflowPolicy)) {
    return policy as OverflowPolicy;
  }

  if (
    typeof policy === "object" &&
    policy !== null &&
    "mode" in policy
  ) {
    return normalizeOverflowPolicy(
      (policy as { mode?: unknown }).mode,
    );
  }

  return "add_page_if_needed";
}

function normalizeGraphicType(type: unknown): GraphicType {
  return GRAPHIC_TYPES.includes(type as GraphicType)
    ? (type as GraphicType)
    : "strategy_diagram";
}

function normalizeGraphicStatus(status: unknown): GraphicStatus {
  return GRAPHIC_STATUSES.includes(status as GraphicStatus)
    ? (status as GraphicStatus)
    : "pending";
}

function normalizeGraphicFormat(format: unknown): GraphicFormat {
  return GRAPHIC_FORMATS.includes(format as GraphicFormat)
    ? (format as GraphicFormat)
    : "svg";
}

function normalizePlanningRuleConfidence(
  confidence: unknown,
): PlanningRuleConfidence {
  return PLANNING_RULE_CONFIDENCES.includes(confidence as PlanningRuleConfidence)
    ? (confidence as PlanningRuleConfidence)
    : "low";
}

function normalizePlanningRuleProposalStatus(
  status: unknown,
): PlanningRuleProposalStatus {
  return PLANNING_RULE_PROPOSAL_STATUSES.includes(
    status as PlanningRuleProposalStatus,
  )
    ? (status as PlanningRuleProposalStatus)
    : "proposed";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeNumericRuleProposal(
  seed: unknown,
  base: PlanningNumericRuleProposal,
): PlanningNumericRuleProposal {
  if (typeof seed !== "object" || seed === null || Array.isArray(seed)) {
    return base;
  }

  const candidate = seed as Record<string, unknown>;

  return {
    value: typeof candidate.value === "number" ? candidate.value : null,
    confidence: normalizePlanningRuleConfidence(candidate.confidence),
    source_excerpt: stringValue(candidate.source_excerpt),
    reason: stringValue(candidate.reason),
    status: normalizePlanningRuleProposalStatus(candidate.status),
  };
}

function normalizeListRuleProposal(
  seed: unknown,
  base: PlanningListRuleProposal,
): PlanningListRuleProposal {
  if (typeof seed !== "object" || seed === null || Array.isArray(seed)) {
    return base;
  }

  const candidate = seed as Record<string, unknown>;

  return {
    values: stringArray(candidate.values),
    confidence: normalizePlanningRuleConfidence(candidate.confidence),
    source_excerpt: stringValue(candidate.source_excerpt),
    reason: stringValue(candidate.reason),
    status: normalizePlanningRuleProposalStatus(candidate.status),
  };
}

function normalizePlanningRulesProposal(
  seed: unknown,
  base: PlanningRulesProposal,
): PlanningRulesProposal {
  const candidate =
    typeof seed === "object" && seed !== null && !Array.isArray(seed)
      ? (seed as Record<string, unknown>)
      : {};
  const candidateSetbacks =
    typeof candidate.setbacks === "object" &&
    candidate.setbacks !== null &&
    !Array.isArray(candidate.setbacks)
      ? (candidate.setbacks as Record<string, unknown>)
      : {};

  return {
    max_height_m: normalizeNumericRuleProposal(
      candidate.max_height_m,
      base.max_height_m,
    ),
    max_floors: normalizeNumericRuleProposal(
      candidate.max_floors,
      base.max_floors,
    ),
    buildability_m2_m2: normalizeNumericRuleProposal(
      candidate.buildability_m2_m2,
      base.buildability_m2_m2,
    ),
    occupancy_percent: normalizeNumericRuleProposal(
      candidate.occupancy_percent,
      base.occupancy_percent,
    ),
    setbacks: {
      front_m: normalizeNumericRuleProposal(
        candidateSetbacks.front_m,
        base.setbacks.front_m,
      ),
      rear_m: normalizeNumericRuleProposal(
        candidateSetbacks.rear_m,
        base.setbacks.rear_m,
      ),
      side_m: normalizeNumericRuleProposal(
        candidateSetbacks.side_m,
        base.setbacks.side_m,
      ),
    },
    uses_allowed: normalizeListRuleProposal(
      candidate.uses_allowed,
      base.uses_allowed,
    ),
    uses_forbidden: normalizeListRuleProposal(
      candidate.uses_forbidden,
      base.uses_forbidden,
    ),
  };
}

function normalizePlanningSourceArticles(
  value: unknown,
): PlanningSourceArticle[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      return [
        {
          source_label: "",
          article: "",
          page: null,
          excerpt: item,
        },
      ];
    }

    if (typeof item !== "object" || item === null) {
      return [];
    }

    return [
      {
        source_label: stringValue((item as Record<string, unknown>).source_label),
        article: stringValue((item as Record<string, unknown>).article),
        page:
          typeof (item as Record<string, unknown>).page === "number"
            ? ((item as Record<string, unknown>).page as number)
            : null,
        excerpt: stringValue((item as Record<string, unknown>).excerpt),
      },
    ];
  });
}

function normalizeGraphicSpecs(specs: unknown): GraphicSpec[] {
  if (!Array.isArray(specs)) {
    return [];
  }

  return specs
    .filter((spec): spec is Record<string, unknown> =>
      typeof spec === "object" && spec !== null,
    )
    .map((spec) => ({
      id: stringValue(spec.id),
      type: normalizeGraphicType(spec.type),
      status: normalizeGraphicStatus(spec.status),
      title: stringValue(spec.title),
      description: stringValue(spec.description),
      inputs: stringArray(spec.inputs),
      output_path: stringValue(spec.output_path),
      format: normalizeGraphicFormat(spec.format),
      layout_role: stringValue(spec.layout_role),
      requires_human_review:
        typeof spec.requires_human_review === "boolean"
          ? spec.requires_human_review
          : true,
    }));
}

function mergeStringRecord(
  base: Record<string, string>,
  seed: unknown,
): Record<string, string> {
  if (typeof seed !== "object" || seed === null || Array.isArray(seed)) {
    return base;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(seed)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }
  return merged;
}

function mergeStringArrayRecord(
  base: Record<string, string[]>,
  seed: unknown,
): Record<string, string[]> {
  if (typeof seed !== "object" || seed === null || Array.isArray(seed)) {
    return base;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(seed)) {
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      merged[key] = value;
    }
  }
  return merged;
}

export function buildProjectId(input: ProjectInputV2): string {
  const municipality = normalizeIdSegment(input.site.municipality) || "MUNICIPIO";
  const titleSegment = buildTitleSegment(
    input.project.title,
    input.site.municipality,
  );
  const dateSegment = compactDate(input.project.date);

  const generatedId = `${municipality}_${titleSegment}_${dateSegment}`;
  const existingId = normalizeIdSegment(input.project.id);

  if (!existingId || isPlaceholderProjectId(existingId)) {
    return generatedId;
  }

  return existingId;
}

export function emptyAssets(): AssetsBlock {
  return {
    site_photos: [],
    cad_files: [],
    survey_files: [],
    planning_files: [],
    reference_images: [],
    other_files: [],
    generated: [],
  };
}

export function ensureAssetsBlock(assets?: DeepPartial<AssetsBlock>): AssetsBlock {
  const base = emptyAssets();

  if (!assets) {
    return base;
  }

  for (const category of ASSET_CATEGORIES) {
    base[category] = (assets[category] as AssetsBlock[AssetCategory]) ?? [];
  }

  return base;
}

export function buildProjectInput(
  seed?: DeepPartial<ProjectInputV2>,
): ProjectInputV2 {
  const base = cloneEmptyProjectInput();

  const merged: ProjectInputV2 = {
    ...base,

    project: {
      ...base.project,
      ...seed?.project,
      id: seed?.project?.id ?? base.project.id,
      title: seed?.project?.title ?? base.project.title,
      client_name: seed?.project?.client_name ?? base.project.client_name,
      phase: seed?.project?.phase ?? base.project.phase,
      date: seed?.project?.date ?? base.project.date,
      language: seed?.project?.language ?? base.project.language,
      template_version: TEMPLATE_VERSION,
    },

    workflow: {
      ...base.workflow,
      ...seed?.workflow,
      status: normalizeWorkflowStatus(seed?.workflow?.status),
      can_generate_pdf: seed?.workflow?.can_generate_pdf ?? false,
      current_step:
        seed?.workflow?.current_step ?? base.workflow.current_step,
      next_action:
        seed?.workflow?.next_action ?? base.workflow.next_action,
      blocking_reasons:
        seed?.workflow?.blocking_reasons ?? base.workflow.blocking_reasons,
      warnings: seed?.workflow?.warnings ?? base.workflow.warnings,
      human_review_required:
        seed?.workflow?.human_review_required ??
        base.workflow.human_review_required,
      updated_at: seed?.workflow?.updated_at,
    },

    requirements: {
      missing: seed?.requirements?.missing ?? base.requirements.missing,
      resolved: seed?.requirements?.resolved ?? base.requirements.resolved,
      optional: seed?.requirements?.optional ?? base.requirements.optional,
    },

    site: {
      ...base.site,
      ...seed?.site,
      address: seed?.site?.address ?? base.site.address,
      municipality: seed?.site?.municipality ?? base.site.municipality,
      province: seed?.site?.province ?? base.site.province,
      autonomous_region:
        seed?.site?.autonomous_region ?? base.site.autonomous_region,
      country: seed?.site?.country ?? base.site.country,
      postal_code: seed?.site?.postal_code ?? base.site.postal_code,
      coordinates: {
        lat: seed?.site?.coordinates?.lat ?? base.site.coordinates.lat,
        lng: seed?.site?.coordinates?.lng ?? base.site.coordinates.lng,
      },
      cadastre_reference:
        seed?.site?.cadastre_reference ?? base.site.cadastre_reference,
      cadastre_url: seed?.site?.cadastre_url ?? base.site.cadastre_url,
      source: seed?.site?.source ?? base.site.source,
    },

    parcel: {
      ...base.parcel,
      ...seed?.parcel,
    },

    planning: {
      ...base.planning,
      ...seed?.planning,
      status: normalizePlanningStatus(seed?.planning?.status),
      municipality:
        seed?.planning?.municipality ??
        seed?.site?.municipality ??
        base.planning.municipality,
      planning_document:
        seed?.planning?.planning_document ?? base.planning.planning_document,
      planning_document_file:
        seed?.planning?.planning_document_file ??
        base.planning.planning_document_file,
      planning_url: seed?.planning?.planning_url ?? base.planning.planning_url,
      zone: seed?.planning?.zone ?? base.planning.zone,
      ordinance: seed?.planning?.ordinance ?? base.planning.ordinance,
      rules_confirmed_by_user:
        seed?.planning?.rules_confirmed_by_user ??
        base.planning.rules_confirmed_by_user,
      rules: {
        ...base.planning.rules,
        ...seed?.planning?.rules,
      },
      rules_proposal: normalizePlanningRulesProposal(
        seed?.planning?.rules_proposal,
        base.planning.rules_proposal,
      ),
      source_articles: normalizePlanningSourceArticles(
        seed?.planning?.source_articles ?? base.planning.source_articles,
      ),
      review_notes:
        seed?.planning?.review_notes ?? base.planning.review_notes,
    },

    survey: {
      ...base.survey,
      ...seed?.survey,
      status: normalizeSurveyStatus(seed?.survey?.status),
      source_file: seed?.survey?.source_file ?? base.survey.source_file,
      summary: {
        ...base.survey.summary,
        ...seed?.survey?.summary,
      },
      charts: {
        ...base.survey.charts,
        ...seed?.survey?.charts,
      },
    },

    program: {
      ...base.program,
      ...seed?.program,
      initial: {
        ...base.program.initial,
        ...seed?.program?.initial,
      },
      strategies: seed?.program?.strategies ?? base.program.strategies,
    },

    analysis: {
      ...base.analysis,
      ...seed?.analysis,
      status: normalizeAnalysisStatus(seed?.analysis?.status),
      parcel: {
        ...base.analysis.parcel,
        ...seed?.analysis?.parcel,
      },
      survey: {
        ...base.analysis.survey,
        ...seed?.analysis?.survey,
      },
      planning: {
        ...base.analysis.planning,
        ...seed?.analysis?.planning,
      },
      program: {
        ...base.analysis.program,
        ...seed?.analysis?.program,
      },
    },

    graphics: {
      ...base.graphics,
      ...seed?.graphics,
      strategy_diagrams:
        seed?.graphics?.strategy_diagrams ?? base.graphics.strategy_diagrams,
      specs: normalizeGraphicSpecs(seed?.graphics?.specs ?? base.graphics.specs),
    },

    assets: ensureAssetsBlock(seed?.assets),

    indesign: {
      ...base.indesign,
      ...seed?.indesign,
      template:
        seed?.indesign?.template ??
        base.indesign.template ??
        "estudios_previos_TEMPLATE_v01.idml",
      active_sections: {
        ...base.indesign.active_sections,
        ...seed?.indesign?.active_sections,
      },
      labels: {
        ...base.indesign.labels,
        ...seed?.indesign?.labels,
      },
      layout_plan: {
        ...base.indesign.layout_plan,
        ...seed?.indesign?.layout_plan,
        status: normalizeLayoutPlanStatus(seed?.indesign?.layout_plan?.status),
        page_sequence:
          seed?.indesign?.layout_plan?.page_sequence ??
          base.indesign.layout_plan.page_sequence,
        section_layouts: mergeStringRecord(
          base.indesign.layout_plan.section_layouts,
          seed?.indesign?.layout_plan?.section_layouts,
        ),
        graphic_slots: mergeStringArrayRecord(
          base.indesign.layout_plan.graphic_slots,
          seed?.indesign?.layout_plan?.graphic_slots,
        ),
        text_blocks: mergeStringArrayRecord(
          base.indesign.layout_plan.text_blocks,
          seed?.indesign?.layout_plan?.text_blocks,
        ),
        overflow_policy: normalizeOverflowPolicy(
          seed?.indesign?.layout_plan?.overflow_policy ??
            base.indesign.layout_plan.overflow_policy,
        ),
      },
    },
  };

  merged.project.id = buildProjectId(merged);

  return merged;
}

export function buildWebhookPayload(
  projectInput: ProjectInputV2,
): DossieresWebhookPayload {
  const normalizedProjectInput = buildProjectInput(projectInput);

  return {
    project_id: normalizedProjectInput.project.id,
    project_input: normalizedProjectInput,
  };
}
