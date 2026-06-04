import assert from "node:assert/strict";
import { buildProjectInput } from "./buildProjectInput";
import {
  applyAcceptedPlanningRulesProposal,
  applyPlanningExtractionProposal,
  extractPlanningRulesFromText,
} from "./planningTextExtractor";

const sampleText = `
Edificabilidad total: 295,29 m2
Edificabilidad: 0,35 m2/m2
Edificabilidad sobre rasante: 196,86 m2
Edificabilidad bajo rasante: 98,43 m2
Retranqueo a linderos: 4 m
Retranqueo a calle: 5 m
Retranqueo posterior: 6 m
Altura al alero: 6,5 m
Altura a cumbrera: 9 m
Ocupacion maxima: 30 %
Usos permitidos: residencial, dotacional
Zona urbanistica: UAD-5
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
assert.equal(extraction.rulesProposal.buildability_m2_m2.value, 0.35);
assert.equal(extraction.rulesProposal.occupancy_percent.value, 30);
assert.equal(extraction.rulesProposal.occupancy_percent.status, "proposed");
assert.equal(extraction.rulesProposal.setbacks.front_m.value, 5);
assert.equal(extraction.rulesProposal.setbacks.rear_m.value, 6);
assert.equal(extraction.rulesProposal.setbacks.side_m.value, 4);
assert.deepEqual(extraction.rulesProposal.uses_allowed.values, [
  "residencial",
  "dotacional",
]);

const base = buildProjectInput({
  planning: {
    review_notes: "Nota previa",
  },
});

const applied = applyPlanningExtractionProposal(base.planning, extraction);

assert.equal(applied.planning.rules.buildability_total_m2, null);
assert.equal(applied.planning.rules.setback_boundary_m, null);
assert.equal(applied.planning.rules.max_height_eaves_m, null);
assert.equal(applied.planning.zone, "UAD-5");
assert.equal(applied.planning.rules_confirmed_by_user, false);
assert.equal(applied.planning.rules_proposal.occupancy_percent.value, 30);
assert.equal(applied.planning.status, "processed_needs_review");

const accepted = buildProjectInput({
  planning: {
    rules_proposal: {
      max_floors: {
        value: 2,
        confidence: "high",
        source_excerpt: "maximo 2 plantas",
        status: "accepted",
      },
      occupancy_percent: {
        value: 30,
        confidence: "high",
        source_excerpt: "ocupacion maxima 30%",
        status: "accepted",
      },
      setbacks: {
        front_m: {
          value: 5,
          confidence: "high",
          source_excerpt: "retranqueo a calle 5 m",
          status: "accepted",
        },
      },
    },
  },
});

const acceptedApplied = applyAcceptedPlanningRulesProposal(accepted.planning);
assert.equal(acceptedApplied.planning.rules.max_floors, "2");
assert.equal(acceptedApplied.planning.rules.occupancy, "30%");
assert.equal(acceptedApplied.planning.rules.setback_street_m, 5);
assert.equal(acceptedApplied.planning.rules_confirmed_by_user, false);
assert.equal(acceptedApplied.planning.status, "processed_needs_review");

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
