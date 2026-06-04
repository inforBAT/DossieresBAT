import assert from "node:assert/strict";
import { buildProjectInput } from "./buildProjectInput";
import {
  applyPlanningExtractionProposal,
  extractPlanningRulesFromText,
} from "./planningTextExtractor";

const sampleText = `
Edificabilidad total: 295,29 m²
Edificabilidad sobre rasante: 196,86 m²
Edificabilidad bajo rasante: 98,43 m²
Retranqueo a linderos: 4 m
Retranqueo a calle: 5 m
Altura al alero: 6,5 m
Altura a cumbrera: 9 m
Zona urbanística: UAD-5
Ordenanza: Residencial extensiva
`;

const extraction = extractPlanningRulesFromText(sampleText, {
  sourceType: "pdf",
  sourceLabel: "sample.pdf",
});

assert.equal(extraction.rules.buildability_total_m2, 295.29);
assert.equal(extraction.rules.buildability_above_ground_m2, 196.86);
assert.equal(extraction.rules.buildability_below_ground_m2, 98.43);
assert.equal(extraction.rules.setback_boundary_m, 4);
assert.equal(extraction.rules.setback_street_m, 5);
assert.equal(extraction.rules.max_height_eaves_m, 6.5);
assert.equal(extraction.rules.max_height_ridge_m, 9);
assert.equal(extraction.zone, "UAD-5");
assert.equal(extraction.ordinance, "Residencial extensiva");

const base = buildProjectInput({
  planning: {
    review_notes: "Nota previa",
  },
});

const applied = applyPlanningExtractionProposal(base.planning, extraction);

assert.equal(applied.planning.rules.buildability_total_m2, 295.29);
assert.equal(applied.planning.rules.setback_boundary_m, 4);
assert.equal(applied.planning.rules.max_height_eaves_m, 6.5);
assert.equal(applied.planning.zone, "UAD-5");
assert.equal(applied.planning.rules_confirmed_by_user, false);

const candidateBase = buildProjectInput({
  planning: {
    planning_url: "https://example.com/ficha-urbanistica.pdf",
  },
});
const candidateApplied = applyPlanningExtractionProposal(
  candidateBase.planning,
  extraction,
);
assert.equal(
  candidateApplied.planning.planning_url,
  "https://example.com/ficha-urbanistica.pdf",
);

const confirmed = buildProjectInput({
  planning: {
    rules_confirmed_by_user: true,
    rules: {
      setback_boundary_m: 3,
      setback_boundary_m_display: "3 m",
    },
  },
});

const confirmedApplied = applyPlanningExtractionProposal(
  confirmed.planning,
  extraction,
);

assert.equal(confirmedApplied.planning.rules.setback_boundary_m, 3);
assert.ok(
  confirmedApplied.planning.review_notes.includes(
    "No se han sobrescrito valores.",
  ),
);
