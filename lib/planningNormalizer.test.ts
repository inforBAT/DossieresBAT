import assert from "node:assert/strict";
import { buildProjectInput } from "./buildProjectInput";
import { normalizePlanningInput, parseMetricNumber } from "./planningNormalizer";

assert.equal(parseMetricNumber("4"), 4);
assert.equal(parseMetricNumber("4 m"), 4);
assert.equal(parseMetricNumber("6,5"), 6.5);
assert.equal(parseMetricNumber("6,5 m"), 6.5);
assert.equal(parseMetricNumber("295,29 m²"), 295.29);
assert.equal(parseMetricNumber("295.29 m2"), 295.29);

const normalized = normalizePlanningInput(
  buildProjectInput({
    planning: {
      rules: {
        max_height_eaves_m_display: "6,5 m",
        setback_boundary_m_display: "4 m",
        setback_street_m_display: "5 m",
      },
    },
  }),
);

assert.equal(normalized.planning.rules.max_height_eaves_m, 6.5);
assert.equal(normalized.planning.rules.setback_boundary_m, 4);
assert.equal(normalized.planning.rules.setback_street_m, 5);
