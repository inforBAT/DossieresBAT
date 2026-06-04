import assert from "node:assert/strict";
import {
  buildPlanningLinkCandidate,
  extractPlanningLinkCandidatesFromHtml,
  sortPlanningLinkCandidates,
} from "./planningUrlCandidates";

const officialBaseUrl = new URL("https://www.bergara.eus/es/urbanismo");
const officialVsCommercialHtml = `
  <html><body>
    <a href="/sites/default/files/planeamiento/pgou-ficha-urbanistica-uad5.pdf">
      Ficha urbanistica UAD-5
    </a>
    <a href="https://idealista.com/news/planeamiento-bergara">
      Guia SEO sobre urbanismo en Bergara
    </a>
    <a href="https://www.bergara.eus/es/planeamiento-detalle">
      Planeamiento de detalle
    </a>
  </body></html>
`;

const rankedCandidates = extractPlanningLinkCandidatesFromHtml(
  officialVsCommercialHtml,
  officialBaseUrl,
);

assert.equal(rankedCandidates.length >= 2, true);
assert.equal(
  rankedCandidates[0]?.url.includes("pgou-ficha-urbanistica-uad5.pdf"),
  true,
);
assert.equal(
  rankedCandidates[0]?.reason.includes("fuente oficial municipal"),
  true,
);
assert.equal(
  rankedCandidates.some(
    (candidate) =>
      candidate.url.includes("idealista.com") &&
      candidate.reason.includes("posible fuente comercial penalizada"),
  ),
  true,
);
assert.equal(
  rankedCandidates.findIndex((candidate) => candidate.url.includes("idealista.com")) >
    rankedCandidates.findIndex((candidate) =>
      candidate.url.includes("pgou-ficha-urbanistica-uad5.pdf"),
    ),
  true,
);

const geoportalCandidate = buildPlanningLinkCandidate(
  "Geoportal urbanistico municipal",
  new URL("https://geoportal.bergara.eus/visor/planeamiento"),
  "duckduckgo.com",
);
const blogCandidate = buildPlanningLinkCandidate(
  "Blog sobre urbanismo en Bergara",
  new URL("https://urbanismo-bergara-blog.example.com/post/planeamiento"),
  "duckduckgo.com",
);

assert.notEqual(geoportalCandidate, null);
assert.notEqual(blogCandidate, null);
assert.equal(
  (geoportalCandidate?.confidence ?? "low") === "high" ||
    (geoportalCandidate?.confidence ?? "low") === "medium",
  true,
);
assert.equal(
  geoportalCandidate!.reason.includes("geoportal") ||
    geoportalCandidate!.reason.includes("visor urbanistico"),
  true,
);
assert.equal(
  blogCandidate!.reason.includes("posible blog o foro penalizado"),
  true,
);
assert.equal(
  sortPlanningLinkCandidates([blogCandidate!, geoportalCandidate!])[0]?.url,
  geoportalCandidate!.url,
);

const commercialCandidate = buildPlanningLinkCandidate(
  "Planeamiento urbanistico de solar en venta",
  new URL("https://www.idealista.com/news/planeamiento-solar-urbano"),
  "duckduckgo.com",
);

assert.notEqual(commercialCandidate, null);
assert.equal(
  commercialCandidate!.reason.includes("posible fuente comercial penalizada"),
  true,
);
assert.equal(commercialCandidate!.confidence, "low");

const unrelatedCandidate = buildPlanningLinkCandidate(
  "Receta de paella tradicional",
  new URL("https://cocina.example.com/recetas/paella"),
  "duckduckgo.com",
);

assert.equal(unrelatedCandidate, null);
