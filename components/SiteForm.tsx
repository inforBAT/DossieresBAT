"use client";

import type { SiteBlock } from "@/lib/projectInputSchema";

interface SiteFormProps {
  site: SiteBlock;
  onChange: (site: SiteBlock) => void;
}

export function SiteForm({ site, onChange }: SiteFormProps) {
  return (
    <section className="section" id="site">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-normal text-muted">
          02
        </p>
        <h2 className="text-2xl font-semibold text-ink">Dirección del solar</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="label">Dirección</span>
          <input
            className="field"
            value={site.address}
            onChange={(event) =>
              onChange({ ...site, address: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Municipio</span>
          <input
            className="field"
            value={site.municipality}
            onChange={(event) =>
              onChange({ ...site, municipality: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Provincia</span>
          <input
            className="field"
            value={site.province}
            onChange={(event) =>
              onChange({ ...site, province: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Comunidad autónoma</span>
          <input
            className="field"
            value={site.autonomous_region}
            onChange={(event) =>
              onChange({ ...site, autonomous_region: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Código postal</span>
          <input
            className="field"
            value={site.postal_code}
            onChange={(event) =>
              onChange({ ...site, postal_code: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Referencia catastral</span>
          <input
            className="field"
            value={site.cadastre_reference}
            onChange={(event) =>
              onChange({ ...site, cadastre_reference: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">URL catastro</span>
          <input
            className="field"
            type="url"
            value={site.cadastre_url}
            onChange={(event) =>
              onChange({ ...site, cadastre_url: event.target.value })
            }
          />
        </label>
      </div>
    </section>
  );
}
