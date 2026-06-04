import assert from "node:assert/strict";
import { buildSearchQueries } from "./planningDiscover";

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
