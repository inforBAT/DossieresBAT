import assert from "node:assert/strict";
import { buildProjectInput } from "./buildProjectInput";
import { normalizeTypeformSurvey, type TypeformWorkbookData } from "./typeformSurvey";
import { updateRequirementsAndWorkflow } from "./updateRequirementsAndWorkflow";

const workbookData: TypeformWorkbookData = {
  rows: [
    ["", "", "", "", "", "", "", "", "", "", "K", "L", "", "", "", "", "", "", "", "T", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "AS"],
    ["", "", "", "", "", "", "", "", "", "", "Uso estacional", "4 personas", "", "", "", "", "", "", "", "275 m²", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Moderna"],
  ],
};

const withSurveyFile = buildProjectInput({
  assets: {
    survey_files: [
      {
        id: "survey-1",
        category: "survey_files",
        original_name: "survey.xlsx",
        normalized_name: "survey.xlsx",
        extension: ".xlsx",
        path: "assets/survey.xlsx",
        label: "Survey",
        role: "briefing",
        status: "accepted",
      },
    ],
  },
  survey: {
    status: "pending_normalization",
    source_file: "assets/survey.xlsx",
  },
});

const normalized = normalizeTypeformSurvey(withSurveyFile, workbookData);
const refreshed = updateRequirementsAndWorkflow(normalized);

assert.equal(normalized.survey.status, "processed_needs_review");
assert.equal(normalized.program.desired_total_built_m2, 275);
assert.ok(normalized.survey.summary.use_type.length > 0);
assert.ok(normalized.survey.summary.main_priorities.length === 0 || Array.isArray(normalized.survey.summary.main_priorities));
assert.ok(!normalized.workflow.warnings.includes("survey.status_pending_review"));
assert.equal(refreshed.survey.status, "processed_needs_review");
assert.ok(!refreshed.workflow.warnings.includes("survey.status_pending_review"));
