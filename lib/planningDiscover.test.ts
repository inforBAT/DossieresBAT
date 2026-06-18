import assert from "node:assert/strict";
import { buildSearchQueries } from "./planningDiscover";
import { hasPlanningReviewNotesNeedingComplementaryDocuments } from "./planningTextExtractor";

assert.deepEqual(
  buildSearchQueries({}),
  [],
  "No debe generar queries si faltan municipio, direccion y referencia catastral.",
);

const addressOnlyQueries = buildSearchQueries({
  address: "Calle Mayor 12",
});
assert.equal(addressOnlyQueries.length > 0, true);
assert.equal(
  addressOnlyQueries.some((query) => query.includes("Calle Mayor 12")),
  true,
);
assert.equal(
  addressOnlyQueries.some((query) =>
    query.toLowerCase().includes("normas subsidiarias ficha urbanistica"),
  ),
  false,
  "Sin municipio no debe lanzar queries municipales demasiado amplias.",
);

const cadastreOnlyQueries = buildSearchQueries({
  cadastreReference: "1234567AB1234C0001DE",
});
assert.equal(cadastreOnlyQueries.length > 0, true);
assert.equal(
  cadastreOnlyQueries.some((query) => query.includes("1234567AB1234C0001DE")),
  true,
);

assert.equal(
  hasPlanningReviewNotesNeedingComplementaryDocuments(
    [
      "Extraccion PDF: ordenanzas.pdf",
      "Documento insuficiente para la parcela concreta.",
      "Documentos complementarios requeridos: ficha urbanistica, PGOU, plano de zonificacion o ambito aplicable.",
    ].join("\n"),
  ),
  true,
  "Debe reactivar la busqueda complementaria cuando la revision guardada indica que faltan documentos de parcela.",
);

assert.equal(
  hasPlanningReviewNotesNeedingComplementaryDocuments(
    "Documento de normativa leido correctamente.\nConfianza estimada: high.",
  ),
  false,
  "No debe mostrar la busqueda complementaria cuando la revision no indica carencias.",
);
