"use client";

import { useState } from "react";
import { normalizeUploadedFile } from "@/lib/normalizeUploadedFile";
import {
  applyPlanningExtractionProposal,
  type PlanningExtractionResult,
} from "@/lib/planningTextExtractor";
import type { PlanningLinkCandidate } from "@/lib/planningUrlCandidates";
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

interface ExtractFromUrlResponse {
  extraction?: PlanningExtractionResult;
  linkCandidates?: PlanningLinkCandidate[];
  error?: string;
}

interface ExtractFromPdfResponse {
  extraction?: PlanningExtractionResult;
  error?: string;
}

export function PlanningForm({ assets, planning, onChange }: PlanningFormProps) {
  const [message, setMessage] = useState("");
  const [planningSourceFile, setPlanningSourceFile] = useState<File | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [extractingUrl, setExtractingUrl] = useState(false);
  const [processingCandidateUrl, setProcessingCandidateUrl] = useState("");
  const [linkCandidates, setLinkCandidates] = useState<PlanningLinkCandidate[]>([]);

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

  function registerFile(
    file: File | undefined,
    target: "planning_files" | "cad_files",
  ) {
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
      if (target === "planning_files") {
        setPlanningSourceFile(file);
      }
      setMessage("Archivo registrado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Archivo invalido.");
    }
  }

  function applyExtractionResult(
    sourceLabel: string,
    extraction: PlanningExtractionResult,
  ) {
    const applied = applyPlanningExtractionProposal(planning, extraction);
    changePlanning(applied.planning);

    if (!extraction.hasUsefulData) {
      setMessage(
        "No se detectaron reglas claras. Introduce la normativa manualmente o revisa la fuente.",
      );
      return;
    }

    if (applied.appliedFields.length > 0) {
      setMessage(
        `Normativa extraida desde ${sourceLabel}. Revisa los valores antes de confirmar.`,
      );
      return;
    }

    if (applied.conflictFields.length > 0 || planning.rules_confirmed_by_user) {
      setMessage(
        "Se detectaron valores, pero se han mantenido los existentes. Revisa las notas de normativa.",
      );
      return;
    }

    setMessage("Se analizo la normativa, pero no habia campos nuevos que aplicar.");
  }

  async function extractFromPdf() {
    if (!planningSourceFile) {
      setMessage("Sube un PDF de normativa en esta sesion para poder extraer texto.");
      return;
    }

    if (!planningSourceFile.name.toLowerCase().endsWith(".pdf")) {
      setMessage("El extractor PDF solo esta disponible para archivos .pdf.");
      return;
    }

    setExtractingPdf(true);
    try {
      const formData = new FormData();
      formData.set("file", planningSourceFile);
      formData.set(
        "sourceLabel",
        assets.planning_files[assets.planning_files.length - 1]?.path ??
          planningSourceFile.name,
      );

      const response = await fetch("/api/planning/extract-from-pdf", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ExtractFromPdfResponse;

      if (!response.ok || !payload.extraction) {
        throw new Error(payload.error || "No se pudo extraer texto del PDF.");
      }

      setLinkCandidates([]);
      applyExtractionResult("PDF", payload.extraction);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo extraer texto del PDF.",
      );
    } finally {
      setExtractingPdf(false);
    }
  }

  async function requestUrlExtraction(selectedUrl?: string) {
    const response = await fetch("/api/planning/extract-from-url", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: planning.planning_url,
        ...(selectedUrl
          ? {
              selectedUrl,
              selectedSourceType: linkCandidates.find(
                (candidate) => candidate.url === selectedUrl,
              )?.sourceType,
            }
          : {}),
      }),
    });
    const payload = (await response.json()) as ExtractFromUrlResponse;

    if (!response.ok || !payload.extraction) {
      throw new Error(payload.error || "No se pudo extraer normativa desde la URL.");
    }

    return payload;
  }

  async function extractFromUrl() {
    if (!planning.planning_url.trim()) {
      setMessage("Introduce primero una URL de normativa.");
      return;
    }

    setExtractingUrl(true);
    try {
      const payload = await requestUrlExtraction();
      setLinkCandidates(payload.linkCandidates ?? []);
      applyExtractionResult("URL", payload.extraction!);

      if ((payload.linkCandidates?.length ?? 0) > 0) {
        setMessage(
          "No se encontraron reglas claras en esta página. Se han encontrado documentos candidatos para revisar.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo extraer normativa desde la URL.",
      );
    } finally {
      setExtractingUrl(false);
    }
  }

  async function processLinkCandidate(candidate: PlanningLinkCandidate) {
    setProcessingCandidateUrl(candidate.url);
    try {
      const payload = await requestUrlExtraction(candidate.url);
      setLinkCandidates(payload.linkCandidates ?? []);
      applyExtractionResult(candidate.title, payload.extraction!);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo procesar el documento candidato.",
      );
    } finally {
      setProcessingCandidateUrl("");
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
          <span className="label">Ocupacion</span>
          <input
            className="field"
            value={planning.rules.occupancy}
            onChange={(event) =>
              changeRules({ occupancy: event.target.value })
            }
          />
        </label>

        <label>
          <span className="label">Numero maximo de plantas</span>
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

        <div className="md:col-span-2 flex flex-wrap gap-3">
          <button
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={extractingPdf || !planningSourceFile}
            onClick={() => void extractFromPdf()}
          >
            {extractingPdf ? "Extrayendo PDF..." : "Extraer normativa del PDF"}
          </button>
          <button
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={extractingUrl || !planning.planning_url.trim()}
            onClick={() => void extractFromUrl()}
          >
            {extractingUrl ? "Extrayendo URL..." : "Extraer normativa de URL"}
          </button>
        </div>

        {linkCandidates.length > 0 && (
          <div className="md:col-span-2 rounded-md border border-line bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-ink">
              No se encontraron reglas claras en la página inicial. Documentos candidatos:
            </p>
            <div className="space-y-3">
              {linkCandidates.map((candidate) => (
                <div
                  className="flex flex-col gap-3 rounded-md border border-line px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                  key={candidate.url}
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{candidate.title}</p>
                    <p className="text-xs text-ink/60">{candidate.url}</p>
                    <p className="mt-1 text-xs text-ink/70">
                      {candidate.sourceType} · {candidate.confidence} · {candidate.reason}
                    </p>
                  </div>
                  <button
                    className="rounded-md border border-line bg-soft px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    disabled={processingCandidateUrl === candidate.url}
                    onClick={() => void processLinkCandidate(candidate)}
                  >
                    {processingCandidateUrl === candidate.url
                      ? "Procesando..."
                      : "Procesar"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
