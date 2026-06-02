"use client";

import { useState } from "react";
import { normalizeUploadedFile } from "@/lib/normalizeUploadedFile";
import type {
  AssetsBlock,
  PlanningBlock,
  PlanningRules,
  UploadedAsset,
} from "@/lib/projectInputSchema";

interface PlanningFormProps {
  assets: AssetsBlock;
  planning: PlanningBlock;
  onChange: (next: { assets?: AssetsBlock; planning?: PlanningBlock }) => void;
}

export function PlanningForm({ assets, planning, onChange }: PlanningFormProps) {
  const [message, setMessage] = useState("");

  function changePlanning(patch: Partial<PlanningBlock>) {
    onChange({
      planning: {
        ...planning,
        ...patch,
      },
    });
  }

  function changeRules(patch: Partial<PlanningRules>) {
    onChange({
      planning: {
        ...planning,
        rules: {
          ...planning.rules,
          ...patch,
        },
      },
    });
  }

  function registerFile(file: File | undefined, target: "planning_files" | "cad_files") {
    if (!file) {
      return;
    }

    try {
      const normalized: UploadedAsset = normalizeUploadedFile(file, {
        category: target,
        index: assets[target].length + 1,
      });
      onChange({
        assets: {
          ...assets,
          [target]: [...assets[target], normalized],
        },
      });
      setMessage("Archivo registrado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Archivo invÃ¡lido.");
    }
  }

  return (
    <section className="section" id="planning">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-muted">
            05
          </p>
          <h2 className="text-2xl font-semibold text-ink">Normativa y catastro</h2>
        </div>
        <div className="rounded-md border border-line bg-soft px-3 py-2 text-sm font-semibold text-ink">
          {planning.status}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="label">Planning URL</span>
          <input
            className="field"
            type="url"
            value={planning.planning_url}
            onChange={(event) =>
              changePlanning({ planning_url: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Planning document</span>
          <input
            className="field"
            value={planning.planning_document}
            onChange={(event) =>
              changePlanning({ planning_document: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Zona</span>
          <input
            className="field"
            value={planning.zone}
            onChange={(event) => changePlanning({ zone: event.target.value })}
          />
        </label>

        <label>
          <span className="label">Ordenanza</span>
          <input
            className="field"
            value={planning.ordinance}
            onChange={(event) =>
              changePlanning({ ordinance: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Edificabilidad total</span>
          <input
            className="field"
            value={planning.rules.buildability_total_m2_display}
            onChange={(event) =>
              changeRules({
                buildability_total_m2_display: event.target.value,
              })
            }
          />
        </label>

        <label>
          <span className="label">Edificabilidad sobre rasante</span>
          <input
            className="field"
            value={planning.rules.buildability_above_ground_m2_display}
            onChange={(event) =>
              changeRules({
                buildability_above_ground_m2_display: event.target.value,
              })
            }
          />
        </label>

        <label>
          <span className="label">Edificabilidad bajo rasante</span>
          <input
            className="field"
            value={planning.rules.buildability_below_ground_m2_display}
            onChange={(event) =>
              changeRules({
                buildability_below_ground_m2_display: event.target.value,
              })
            }
          />
        </label>

        <label>
          <span className="label">Ocupación</span>
          <input
            className="field"
            value={planning.rules.occupancy}
            onChange={(event) =>
              changeRules({ occupancy: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Número máximo de plantas</span>
          <input
            className="field"
            value={planning.rules.max_floors}
            onChange={(event) =>
              changeRules({ max_floors: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Altura al alero</span>
          <input
            className="field"
            value={planning.rules.max_height_eaves_m_display}
            onChange={(event) =>
              changeRules({
                max_height_eaves_m_display: event.target.value,
              })
            }
          />
        </label>

        <label>
          <span className="label">Altura a cumbrera</span>
          <input
            className="field"
            value={planning.rules.max_height_ridge_m_display}
            onChange={(event) =>
              changeRules({
                max_height_ridge_m_display: event.target.value,
              })
            }
          />
        </label>

        <label>
          <span className="label">Retranqueo a linderos</span>
          <input
            className="field"
            value={planning.rules.setback_boundary_m_display}
            onChange={(event) =>
              changeRules({
                setback_boundary_m_display: event.target.value,
              })
            }
          />
        </label>

        <label>
          <span className="label">Retranqueo a calle</span>
          <input
            className="field"
            value={planning.rules.setback_street_m_display}
            onChange={(event) =>
              changeRules({
                setback_street_m_display: event.target.value,
              })
            }
          />
        </label>

        <label className="md:col-span-2">
          <span className="label">Review notes</span>
          <textarea
            className="field min-h-28"
            value={planning.review_notes}
            onChange={(event) =>
              changePlanning({ review_notes: event.target.value })
            }
          />
        </label>

        <label className="flex items-center gap-3 rounded-md border border-line bg-white px-4 py-3 md:col-span-2">
          <input
            checked={planning.rules_confirmed_by_user}
            type="checkbox"
            onChange={(event) =>
              changePlanning({ rules_confirmed_by_user: event.target.checked })
            }
          />
          <span className="text-sm font-semibold text-ink">
            Normativa revisada y confirmada por el usuario
          </span>
        </label>

        <label>
          <span className="label">Archivo normativa</span>
          <input
            className="field file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            type="file"
            accept=".pdf,.docx,.txt,.xlsx,.csv"
            onChange={(event) =>
              registerFile(event.target.files?.[0], "planning_files")
            }
          />
        </label>

        <label>
          <span className="label">Plano catastral / CAD</span>
          <input
            className="field file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            type="file"
            accept=".dwg,.dxf,.svg,.pdf"
            onChange={(event) => registerFile(event.target.files?.[0], "cad_files")}
          />
        </label>
      </div>

      {message && <p className="mt-3 text-sm font-semibold text-ink">{message}</p>}
    </section>
  );
}
