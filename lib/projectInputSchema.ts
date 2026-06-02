export const ASSET_CATEGORIES = [
  "site_photos",
  "cad_files",
  "survey_files",
  "planning_files",
  "reference_images",
  "other_files",
  "generated",
] as const;

export const WORKFLOW_STATUSES = [
  "draft",
  "needs_user_input",
  "ready_for_analysis",
  "needs_human_review",
  "ready_for_pdf",
  "pdf_generated",
  "error",
] as const;

export const REQUIREMENT_SEVERITIES = [
  "required",
  "warning",
  "optional",
] as const;

export const GRAPHIC_TYPES = [
  "parcel_base",
  "parcel_setbacks",
  "buildable_area",
  "survey_priorities",
  "survey_style",
  "program_comparison",
  "program_distribution",
  "strategy_diagram",
] as const;

export const ANALYSIS_STATUSES = [
  "not_started",
  "pending",
  "processed_needs_review",
  "reviewed",
  "confirmed",
] as const;

export const GRAPHIC_STATUSES = [
  "pending",
  "generated",
  "needs_review",
  "approved",
  "error",
] as const;

export const GRAPHIC_FORMATS = ["svg", "png", "pdf"] as const;

export const LAYOUT_PLAN_STATUSES = [
  "pending",
  "ready",
  "needs_review",
  "approved",
] as const;

export const OVERFLOW_POLICIES = [
  "add_page_if_needed",
  "shrink_text",
  "manual_review",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type RequirementSeverity = (typeof REQUIREMENT_SEVERITIES)[number];
export type GraphicType = (typeof GRAPHIC_TYPES)[number];
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
export type GraphicStatus = (typeof GRAPHIC_STATUSES)[number];
export type GraphicFormat = (typeof GRAPHIC_FORMATS)[number];
export type LayoutPlanStatus = (typeof LAYOUT_PLAN_STATUSES)[number];
export type OverflowPolicy = (typeof OVERFLOW_POLICIES)[number];

export type SurveyStatus =
  | "empty"
  | "pending_normalization"
  | "processed_needs_review"
  | "reviewed"
  | "confirmed";

export type PlanningStatus =
  | "not_started"
  | "needs_user_input"
  | "needs_human_review"
  | "processed_needs_review"
  | "reviewed"
  | "confirmed";

export interface ProjectBlock {
  id: string;
  title: string;
  client_name: string;
  phase: string;
  date: string;
  language: string;
  template_version: string;
}

export interface WorkflowBlock {
  status: WorkflowStatus;
  can_generate_pdf: boolean;
  current_step: string;
  next_action: string;
  blocking_reasons: string[];
  warnings: string[];
  human_review_required: boolean;
  updated_at?: string;
}

export interface RequirementMissing {
  id: string;
  label: string;
  severity: RequirementSeverity;
  message: string;
  requested_input_type: string;
  acceptable_files: string[];
  blocks_pdf_generation: boolean;
}

export interface RequirementResolved {
  id: string;
  label: string;
  source: string;
  resolved_at: string;
}

export interface RequirementOptional {
  id: string;
  label: string;
  message: string;
  requested_input_type: string;
  acceptable_files: string[];
}

export interface RequirementsBlock {
  missing: RequirementMissing[];
  resolved: RequirementResolved[];
  optional: RequirementOptional[];
}

export interface Coordinates {
  lat: number | null;
  lng: number | null;
}

export interface SiteBlock {
  address: string;
  municipality: string;
  province: string;
  autonomous_region: string;
  country: string;
  postal_code: string;
  coordinates: Coordinates;
  cadastre_reference: string;
  cadastre_url: string;
  source: string;
}

export interface ParcelBlock {
  name: string;
  area_m2: number | null;
  area_m2_display: string;
  geometry_source: string;
  geometry_file: string;
  topography: string;
  slope_description: string;
  access: string;
  orientation: string;
  views: string;
  notes: string;
}

export interface PlanningRules {
  buildability_total_m2: number | null;
  buildability_total_m2_display: string;
  buildability_above_ground_m2: number | null;
  buildability_above_ground_m2_display: string;
  buildability_below_ground_m2: number | null;
  buildability_below_ground_m2_display: string;
  occupancy: string;
  max_floors: string;
  max_height_eaves_m: number | null;
  max_height_eaves_m_display: string;
  max_height_ridge_m: number | null;
  max_height_ridge_m_display: string;
  setback_boundary_m: number | null;
  setback_boundary_m_display: string;
  setback_street_m: number | null;
  setback_street_m_display: string;
  pool_boundary_m?: number | null;
  pool_boundary_m_display?: string;
}

export interface PlanningBlock {
  status: PlanningStatus;
  municipality: string;
  planning_document: string;
  planning_document_file: string;
  planning_url: string;
  zone: string;
  ordinance: string;
  rules_confirmed_by_user: boolean;
  rules: PlanningRules;
  source_articles: string[];
  review_notes: string;
}

export interface SurveySummary {
  use_type: string;
  household_size: number | null;
  main_priorities: string[];
  exterior_style: string;
  exterior_tones: string;
  facade_materials: string[];
  exterior_paving: string[];
  interior_style: string;
  space_type: string;
  interior_flooring: string[];
  wall_finishes: string[];
  day_area_bullets: string[];
  night_area_bullets: string[];
  extra_uses: string[];
  guest_room_location: string;
  free_notes: string;
}

export interface SurveyCharts {
  priorities_chart: string;
  style_chart: string;
  program_chart: string;
}

export interface SurveyBlock {
  status: SurveyStatus;
  source_file: string;
  summary: SurveySummary;
  charts: SurveyCharts;
}

export interface ProgramInitial {
  above_areas_lines: string;
  above_totals_lines: string;
  below_areas_lines: string;
  below_totals_lines: string;
  total_built_display: string;
}

export interface ProgramStrategy {
  id: string;
  title: string;
  status: string;
  description: string;
  diagram: string;
}

export interface ProgramBlock {
  status: string;
  desired_total_built_m2: number | null;
  desired_total_built_m2_display: string;
  allowed_total_built_m2: number | null;
  allowed_total_built_m2_display: string;
  excess_m2: number | null;
  excess_m2_display: string;
  initial: ProgramInitial;
  allowed_totals_lines: string;
  strategies: ProgramStrategy[];
}

export interface AnalysisParcel {
  summary: string;
  constraints: string[];
  opportunities: string[];
  risks: string[];
  missing_data: string[];
}

export interface AnalysisSurvey {
  summary: string;
  key_findings: string[];
  design_implications: string[];
  warnings: string[];
}

export interface AnalysisPlanning {
  summary: string;
  key_rules: string[];
  uncertainties: string[];
  requires_human_review: boolean;
}

export interface AnalysisProgram {
  summary: string;
  surface_balance: string;
  recommended_adjustments: string[];
  strategy_notes: string[];
}

export interface AnalysisBlock {
  status: AnalysisStatus;
  parcel: AnalysisParcel;
  survey: AnalysisSurvey;
  planning: AnalysisPlanning;
  program: AnalysisProgram;
}

export interface GraphicSpec {
  id: string;
  type: GraphicType;
  status: GraphicStatus;
  title: string;
  description: string;
  inputs: string[];
  output_path: string;
  format: GraphicFormat;
  layout_role: string;
  requires_human_review: boolean;
}

export interface GraphicsBlock {
  parcel_base: string;
  parcel_setbacks: string;
  buildable_area: string;
  survey_summary: string;
  program_comparison: string;
  strategy_diagrams: string[];
  specs: GraphicSpec[];
}

export interface UploadedAsset {
  id: string;
  category: AssetCategory;
  original_name: string;
  normalized_name: string;
  extension: string;
  mime_type?: string;
  size_bytes?: number;
  path: string;
  label: string;
  role: string;
  status: "accepted" | "rejected" | "pending";
  created_at?: string;
}

export type AssetsBlock = Record<AssetCategory, UploadedAsset[]>;

export interface ActiveSections {
  analysis_parcel: boolean;
  survey_results: boolean;
  program_strategies: boolean;
  implantation_strategies: boolean;
}

export interface LayoutPlan {
  status: LayoutPlanStatus;
  page_sequence: string[];
  section_layouts: Record<string, string>;
  graphic_slots: Record<string, string[]>;
  text_blocks: Record<string, string[]>;
  overflow_policy: OverflowPolicy;
  requires_human_review: boolean;
}

export interface IndesignBlock {
  template: string;
  active_sections: ActiveSections;
  labels: Record<string, unknown>;
  layout_plan: LayoutPlan;
}

export interface ProjectInputV2 {
  project: ProjectBlock;
  workflow: WorkflowBlock;
  requirements: RequirementsBlock;
  site: SiteBlock;
  parcel: ParcelBlock;
  planning: PlanningBlock;
  survey: SurveyBlock;
  program: ProgramBlock;
  analysis: AnalysisBlock;
  graphics: GraphicsBlock;
  assets: AssetsBlock;
  indesign: IndesignBlock;
}

export interface DossieresWebhookPayload {
  project_id: string;
  project_input: ProjectInputV2;
}

export const MINIMUM_REQUIREMENTS: Array<{
  path: string;
  label: string;
  requirement_id: string;
}> = [
  {
    path: "project.title",
    label: "Título del proyecto",
    requirement_id: "project_title_required",
  },
  {
    path: "project.date",
    label: "Fecha",
    requirement_id: "project_date_required",
  },
  {
    path: "site.address",
    label: "Dirección del solar",
    requirement_id: "site_address_required",
  },
  {
    path: "site.municipality",
    label: "Municipio",
    requirement_id: "site_municipality_required",
  },
];

export const EMPTY_PROJECT_INPUT_V2: ProjectInputV2 = {
  project: {
    id: "",
    title: "",
    client_name: "",
    phase: "Estudios previos",
    date: "",
    language: "es",
    template_version: "dossieres_indesign_v01",
  },
  workflow: {
    status: "draft",
    can_generate_pdf: false,
    current_step: "project_created",
    next_action: "collect_site_inputs",
    blocking_reasons: [],
    warnings: [],
    human_review_required: true,
  },
  requirements: {
    missing: [],
    resolved: [],
    optional: [],
  },
  site: {
    address: "",
    municipality: "",
    province: "",
    autonomous_region: "",
    country: "España",
    postal_code: "",
    coordinates: {
      lat: null,
      lng: null,
    },
    cadastre_reference: "",
    cadastre_url: "",
    source: "user_input",
  },
  parcel: {
    name: "",
    area_m2: null,
    area_m2_display: "",
    geometry_source: "",
    geometry_file: "",
    topography: "",
    slope_description: "",
    access: "",
    orientation: "",
    views: "",
    notes: "",
  },
  planning: {
    status: "not_started",
    municipality: "",
    planning_document: "",
    planning_document_file: "",
    planning_url: "",
    zone: "",
    ordinance: "",
    rules_confirmed_by_user: false,
    rules: {
      buildability_total_m2: null,
      buildability_total_m2_display: "",
      buildability_above_ground_m2: null,
      buildability_above_ground_m2_display: "",
      buildability_below_ground_m2: null,
      buildability_below_ground_m2_display: "",
      occupancy: "",
      max_floors: "",
      max_height_eaves_m: null,
      max_height_eaves_m_display: "",
      max_height_ridge_m: null,
      max_height_ridge_m_display: "",
      setback_boundary_m: null,
      setback_boundary_m_display: "",
      setback_street_m: null,
      setback_street_m_display: "",
    },
    source_articles: [],
    review_notes: "",
  },
  survey: {
    status: "empty",
    source_file: "",
    summary: {
      use_type: "",
      household_size: null,
      main_priorities: [],
      exterior_style: "",
      exterior_tones: "",
      facade_materials: [],
      exterior_paving: [],
      interior_style: "",
      space_type: "",
      interior_flooring: [],
      wall_finishes: [],
      day_area_bullets: [],
      night_area_bullets: [],
      extra_uses: [],
      guest_room_location: "",
      free_notes: "",
    },
    charts: {
      priorities_chart: "",
      style_chart: "",
      program_chart: "",
    },
  },
  program: {
    status: "not_started",
    desired_total_built_m2: null,
    desired_total_built_m2_display: "",
    allowed_total_built_m2: null,
    allowed_total_built_m2_display: "",
    excess_m2: null,
    excess_m2_display: "",
    initial: {
      above_areas_lines: "",
      above_totals_lines: "",
      below_areas_lines: "",
      below_totals_lines: "",
      total_built_display: "",
    },
    allowed_totals_lines: "",
    strategies: [],
  },
  analysis: {
    status: "not_started",
    parcel: {
      summary: "",
      constraints: [],
      opportunities: [],
      risks: [],
      missing_data: [],
    },
    survey: {
      summary: "",
      key_findings: [],
      design_implications: [],
      warnings: [],
    },
    planning: {
      summary: "",
      key_rules: [],
      uncertainties: [],
      requires_human_review: true,
    },
    program: {
      summary: "",
      surface_balance: "",
      recommended_adjustments: [],
      strategy_notes: [],
    },
  },
  graphics: {
    parcel_base: "",
    parcel_setbacks: "",
    buildable_area: "",
    survey_summary: "",
    program_comparison: "",
    strategy_diagrams: [],
    specs: [],
  },
  assets: {
    site_photos: [],
    cad_files: [],
    survey_files: [],
    planning_files: [],
    reference_images: [],
    other_files: [],
    generated: [],
  },
  indesign: {
    template: "estudios_previos_TEMPLATE_v01.idml",
    active_sections: {
      analysis_parcel: true,
      survey_results: true,
      program_strategies: true,
      implantation_strategies: true,
    },
    labels: {},
    layout_plan: {
      status: "pending",
      page_sequence: [
        "cover",
        "analysis_parcel",
        "survey_results",
        "program_strategies",
        "implantation_strategies",
      ],
      section_layouts: {
        analysis_parcel: "layout_analysis_parcel_v01",
        survey_results: "layout_survey_simple",
        program_strategies: "layout_program_comparison",
        implantation_strategies: "layout_implantation_skeleton",
      },
      graphic_slots: {
        analysis_parcel: [],
        survey_results: [],
        program_strategies: [],
        implantation_strategies: [],
      },
      text_blocks: {
        analysis_parcel: [],
        survey_results: [],
        program_strategies: [],
        implantation_strategies: [],
      },
      overflow_policy: "add_page_if_needed",
      requires_human_review: true,
    },
  },
};
