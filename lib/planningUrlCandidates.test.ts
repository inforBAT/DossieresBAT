import assert from "node:assert/strict";
import { extractPlanningLinkCandidatesFromHtml } from "./planningUrlCandidates";

const baseUrl = new URL("https://www.bergara.eus/es/node/1014");
const html = `
  <html><body>
    <a href="/sites/default/files/ordenanzas-urbanisticas.pdf">Ordenanzas urbanísticas PDF</a>
    <a href="https://www.bergara.eus/es/planeamiento-detalle">Planeamiento de detalle</a>
    <a href="https://example.com/blog">Blog</a>
  </body></html>
`;

const candidates = extractPlanningLinkCandidatesFromHtml(html, baseUrl);

assert.equal(candidates.length >= 2, true);
assert.equal(candidates[0]?.sourceType, "pdf");
assert.equal(candidates[0]?.confidence, "high");
assert.ok(candidates.some((candidate) => candidate.url.includes("planeamiento-detalle")));
