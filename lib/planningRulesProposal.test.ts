import assert from "node:assert/strict";
import { buildProjectInput } from "./buildProjectInput";
import {
  acceptPlanningRuleProposal,
  setPlanningRuleProposalStatus,
} from "./planningRulesProposal";

const base = buildProjectInput({
  planning: {
    rules_proposal: {
      occupancy_percent: {
        value: 30,
        confidence: "high",
        source_excerpt: "Ocupacion maxima: 30 %",
        status: "pending",
      },
      max_floors: {
        value: 2,
        confidence: "medium",
        source_excerpt: "Numero maximo de plantas: 2",
        status: "pending",
      },
      buildability_m2_m2: {
        value: 0.35,
        confidence: "medium",
        source_excerpt: "Edificabilidad: 0,35 m2/m2",
        status: "pending",
      },
      max_height_m: {
        value: 9,
        confidence: "medium",
        source_excerpt: "Altura maxima: 9 m",
        status: "pending",
      },
      setbacks: {
        front_m: {
          value: 5,
          confidence: "high",
          source_excerpt: "Retranqueo a calle: 5 m",
          status: "pending",
        },
        rear_m: {
          value: 6,
          confidence: "medium",
          source_excerpt: "Retranqueo posterior: 6 m",
          status: "pending",
        },
        side_m: {
          value: 4,
          confidence: "high",
          source_excerpt: "Retranqueo a linderos: 4 m",
          status: "pending",
        },
      },
      uses_allowed: {
        values: ["residencial", "dotacional"],
        confidence: "medium",
        source_excerpt: "Usos permitidos: residencial, dotacional",
        status: "pending",
      },
      uses_forbidden: {
        values: ["industrial"],
        confidence: "low",
        source_excerpt: "Usos prohibidos: industrial",
        status: "pending",
      },
    },
  },
});

const occupancyAccepted = acceptPlanningRuleProposal(
  base.planning,
  "occupancy_percent",
);
assert.equal(occupancyAccepted.planning.rules.occupancy, "30 %");
assert.equal(
  occupancyAccepted.planning.rules_proposal.occupancy_percent.status,
  "accepted",
);

const heightAccepted = acceptPlanningRuleProposal(
  base.planning,
  "max_height_m",
);
assert.equal(heightAccepted.appliedToRules, false);
assert.equal(heightAccepted.planning.rules.max_height_ridge_m, null);
assert.equal(heightAccepted.planning.rules.max_height_eaves_m, null);

const sideConflict = acceptPlanningRuleProposal(
  buildProjectInput({
    planning: {
      rules: {
        setback_boundary_m: 3,
        setback_boundary_m_display: "3 m",
      },
      rules_proposal: base.planning.rules_proposal,
    },
  }).planning,
  "setbacks.side_m",
);
assert.equal(sideConflict.planning.rules.setback_boundary_m, 3);
assert.equal(
  sideConflict.planning.rules_proposal.setbacks.side_m.status,
  "accepted",
);
assert.equal(sideConflict.appliedToRules, false);

const rejected = setPlanningRuleProposalStatus(
  base.planning,
  "uses_allowed",
  "rejected",
);
assert.equal(rejected.rules_proposal.uses_allowed.status, "rejected");
