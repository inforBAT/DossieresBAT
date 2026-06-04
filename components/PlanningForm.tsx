"use client";

import { useState } from "react";
import { normalizeUploadedFile } from "@/lib/normalizeUploadedFile";
import {
  applyPlanningExtractionProposal,
  hasClearPlanningSourceArticles,
  needsComplementaryPlanningDocuments,
  type PlanningExtractionResult,
} from "@/lib/planningTextExtractor";
import type { PlanningDiscoveryCandidate } from "@/lib/planningDiscovery";
import type { PlanningLinkCandidate } from "@/lib/planningUrlCandidates";
import type {
  AssetsBlock,
  PlanningBlock,
  PlanningListRuleProposal,
  PlanningNumericRuleProposal,
  PlanningRulesProposal,
  PlanningRules,
  SiteBlock,
  UploadedAsset,
} from "@/lib/projectInputSchema";
import type { PlanningPdfErrorCode } from "@/lib/planningPdfPipeline";

interface PlanningFormProps {
  assets: AssetsBlock;
  planning: PlanningBlock;
  site: SiteBlock;
  onChange: (next: { assets?: AssetsBlock; planning?: PlanningBlock }) => void;
}

interface ExtractFromUrlResponse {
  extraction?: PlanningExtractionResult;
  linkCandidates?: PlanningLinkCandidate[];
  error?: string;
}

interface ExtractFromPdfResponse {
  extraction?: PlanningExtractionResult;
  error?: {
    code: PlanningPdfErrorCode;
    message: string;
    details?: string;
  };
}

interface DiscoverPlanningResponse {
  candidates: PlanningDiscoveryCandidate[];
  warnings: string[];
}

interface PlanningGuidanceState {
  title: string;
  description: string;
}

function normalizeHtmlError(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "El endpoint de extraccion PDF devolvio una respuesta no JSON. Revisa la consola del servidor.";
  }

  return `El endpoint de extraccion PDF devolvio una respuesta no JSON. ${text.slice(0, 180)}`;
}

async function readPdfExtractionResponse(
  response: Response,
): Promise<ExtractFromPdfResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as ExtractFromPdfResponse;
  }

  const body = await response.text();
  return {
    error: {
      code: "pdf_parser_failed",
      message: body.trim().startsWith("<")
        ? normalizeHtmlError(body)
        : body.trim() ||
          "El endpoint de extraccion PDF devolvio una respuesta no JSON. Revisa la consola del servidor.",
    },
  };
}

function buildPlanningGuidance(
  extraction: PlanningExtractionResult,
): PlanningGuidanceState | null {
  if (!needsComplementaryPlanningDocuments(extraction)) {
    return null;
  }

  return {
    title:
      "El PDF se ha leido con IA, pero parece ser una ordenanza general. Falta la ficha urbanistica o el ambito aplicable a la parcela.",
    description:
      "Siguiente paso recomendado: usa direccion, municipio y referencia catastral para buscar documentos complementarios, o sube manualmente la ficha urbanistica, PGOU o plano de zonificacion.",
  };
}

export function PlanningForm({
  assets,
  planning,
  site,
  onChange,
}: PlanningFormProps) {
  const [message, setMessage] = useState("");
  const [planningSourceFile, setPlanningSourceFile] = useState<File | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [extractingUrl, setExtractingUrl] = useState(false);
  const [discoveringDocuments, setDiscoveringDocuments] = useState(false);
  const [processingCandidateUrl, setProcessingCandidateUrl] = useState("");
  const [linkCandidates, setLinkCandidates] = useState<PlanningLinkCandidate[]>([]);
  const [discoveryCandidates, setDiscoveryCandidates] = useState<
    PlanningDiscoveryCandidate[]
  >([]);
  const [planningGuidance, setPlanningGuidance] =
    useState<PlanningGuidanceState | null>(null);

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
    setPlanningGuidance(buildPlanningGuidance(extraction));

    const hasClearSources = hasClearPlanningSourceArticles(extraction);
    const needsComplementaryDocs =
      needsComplementaryPlanningDocuments(extraction);

    if (needsComplementaryDocs) {
      setMessage(
        "El PDF se ha leido con IA, pero parece ser una ordenanza general. Falta la ficha urbanistica o el ambito aplicable a la parcela.",
      );
      return;
    }

    if (!extraction.hasUsefulData) {
      setMessage(
        extraction.warnings[0] ||
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

    if (extraction.confidence === "low" && !hasClearSources) {
      setMessage(
        "La lectura del PDF es de confianza baja y no aporta citas claras. Revisa las notas y busca documentacion complementaria.",
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

  function changeRulesProposal(patch: Partial<PlanningRulesProposal>) {
    onChange({
      planning: {
        ...planning,
        rules_proposal: {
          ...planning.rules_proposal,
          ...patch,
          setbacks: {
            ...planning.rules_proposal.setbacks,
            ...patch.setbacks,
          },
        },
      },
    });
  }

  function changeNumericProposal(
    key: Exclude<
      keyof PlanningRulesProposal,
      "setbacks" | "uses_allowed" | "uses_forbidden"
    >,
    patch: Partial<PlanningNumericRuleProposal>,
  ) {
    changeRulesProposal({
      [key]: {
        ...planning.rules_proposal[key],
        ...patch,
      },
    } as Partial<PlanningRulesProposal>);
  }

  function changeSetbackProposal(
    key: keyof PlanningRulesProposal["setbacks"],
    patch: Partial<PlanningNumericRuleProposal>,
  ) {
    changeRulesProposal({
      setbacks: {
        [key]: {
          ...planning.rules_proposal.setbacks[key],
          ...patch,
        },
      },
    } as Partial<PlanningRulesProposal>);
  }

  function changeListProposal(
    key: "uses_allowed" | "uses_forbidden",
    patch: Partial<PlanningListRuleProposal>,
  ) {
    changeRulesProposal({
      [key]: {
        ...planning.rules_proposal[key],
        ...patch,
      },
    } as Partial<PlanningRulesProposal>);
  }

  function parseNumericInput(value: string): number | null {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function discoverComplementaryDocuments() {
    setDiscoveringDocuments(true);
    try {
      const response = await fetch("/api/planning/discover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          municipality: planning.municipality || site.municipality,
          address: site.address,
          cadastre_reference: site.cadastre_reference,
          planning_url: planning.planning_url,
          current_warnings: planning.review_notes
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });

      const payload = (await response.json()) as DiscoverPlanningResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "No se pudo buscar documentacion complementaria automaticamente.",
        );
      }

      const candidates = payload.candidates ?? [];
      setDiscoveryCandidates(candidates);
      setMessage(
        candidates.length > 0
          ? "Se han encontrado posibles documentos complementarios. Revisa y selecciona el que corresponda a la parcela."
          : payload.warnings[0] ||
              "No se han encontrado documentos complementarios automaticamente. Sube manualmente ficha urbanistica, PGOU o plano de zonificacion.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo buscar documentacion complementaria automaticamente.",
      );
    } finally {
      setDiscoveringDocuments(false);
    }
  }

  function useDiscoveryCandidate(candidate: PlanningDiscoveryCandidate) {
    changePlanning({
      planning_url: candidate.url,
      rules_confirmed_by_user: false,
    });
    setMessage(
      "Documento propuesto cargado en Planning URL. Revisa la URL y pulsa Extraer normativa de URL cuando quieras procesarla.",
    );
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
      formData.set("municipality", planning.municipality || site.municipality);
      formData.set("address", site.address);
      formData.set("cadastreReference", site.cadastre_reference);
      formData.set("currentZone", planning.zone);
      formData.set("currentOrdinance", planning.ordinance);

      const response = await fetch("/api/planning/extract-from-pdf", {
        method: "POST",
        body: formData,
      });
      const payload = await readPdfExtractionResponse(response);

      if (!response.ok || !payload.extraction) {
        throw new Error(
          payload.error?.message ||
            `Error ${response.status} al extraer el PDF.`,
        );
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
          "No se encontraron reglas claras en esta pagina. Se han encontrado documentos candidatos para revisar.",
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

        <div className="md:col-span-2 rounded-md border border-line bg-soft/60 p-4">
          <p className="text-sm font-semibold text-ink">
            Reglas detectadas para revision humana
          </p>
          <p className="mt-1 text-xs text-ink/70">
            La propuesta mantiene confianza y extracto por campo. Edita los valores antes de confirmar la normativa.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label>
              <span className="label">Edificabilidad m2/m2</span>
              <input
                className="field"
                type="number"
                step="0.01"
                value={planning.rules_proposal.buildability_m2_m2.value ?? ""}
                onChange={(event) =>
                  changeNumericProposal("buildability_m2_m2", {
                    value: parseNumericInput(event.target.value),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.buildability_m2_m2.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.buildability_m2_m2.source_excerpt || "Sin extracto"}
              </span>
            </label>

            <label>
              <span className="label">Ocupacion %</span>
              <input
                className="field"
                type="number"
                step="0.01"
                value={planning.rules_proposal.occupancy_percent.value ?? ""}
                onChange={(event) =>
                  changeNumericProposal("occupancy_percent", {
                    value: parseNumericInput(event.target.value),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.occupancy_percent.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.occupancy_percent.source_excerpt || "Sin extracto"}
              </span>
            </label>

            <label>
              <span className="label">Altura maxima (m)</span>
              <input
                className="field"
                type="number"
                step="0.01"
                value={planning.rules_proposal.max_height_m.value ?? ""}
                onChange={(event) =>
                  changeNumericProposal("max_height_m", {
                    value: parseNumericInput(event.target.value),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.max_height_m.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.max_height_m.source_excerpt || "Sin extracto"}
              </span>
            </label>

            <label>
              <span className="label">Numero maximo de plantas</span>
              <input
                className="field"
                type="number"
                step="1"
                value={planning.rules_proposal.max_floors.value ?? ""}
                onChange={(event) =>
                  changeNumericProposal("max_floors", {
                    value: parseNumericInput(event.target.value),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.max_floors.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.max_floors.source_excerpt || "Sin extracto"}
              </span>
            </label>

            <label>
              <span className="label">Retranqueo frontal (m)</span>
              <input
                className="field"
                type="number"
                step="0.01"
                value={planning.rules_proposal.setbacks.front_m.value ?? ""}
                onChange={(event) =>
                  changeSetbackProposal("front_m", {
                    value: parseNumericInput(event.target.value),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.setbacks.front_m.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.setbacks.front_m.source_excerpt || "Sin extracto"}
              </span>
            </label>

            <label>
              <span className="label">Retranqueo trasero (m)</span>
              <input
                className="field"
                type="number"
                step="0.01"
                value={planning.rules_proposal.setbacks.rear_m.value ?? ""}
                onChange={(event) =>
                  changeSetbackProposal("rear_m", {
                    value: parseNumericInput(event.target.value),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.setbacks.rear_m.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.setbacks.rear_m.source_excerpt || "Sin extracto"}
              </span>
            </label>

            <label>
              <span className="label">Retranqueo lateral (m)</span>
              <input
                className="field"
                type="number"
                step="0.01"
                value={planning.rules_proposal.setbacks.side_m.value ?? ""}
                onChange={(event) =>
                  changeSetbackProposal("side_m", {
                    value: parseNumericInput(event.target.value),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.setbacks.side_m.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.setbacks.side_m.source_excerpt || "Sin extracto"}
              </span>
            </label>

            <label>
              <span className="label">Usos permitidos</span>
              <textarea
                className="field min-h-24"
                value={planning.rules_proposal.uses_allowed.values.join("\n")}
                onChange={(event) =>
                  changeListProposal("uses_allowed", {
                    values: event.target.value
                      .split(/\r?\n|,/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.uses_allowed.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.uses_allowed.source_excerpt || "Sin extracto"}
              </span>
            </label>

            <label>
              <span className="label">Usos prohibidos</span>
              <textarea
                className="field min-h-24"
                value={planning.rules_proposal.uses_forbidden.values.join("\n")}
                onChange={(event) =>
                  changeListProposal("uses_forbidden", {
                    values: event.target.value
                      .split(/\r?\n|,/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
              <span className="mt-1 block text-xs text-ink/60">
                Confianza: {planning.rules_proposal.uses_forbidden.confidence}
              </span>
              <span className="mt-1 block text-xs text-ink/70">
                {planning.rules_proposal.uses_forbidden.source_excerpt || "Sin extracto"}
              </span>
            </label>
          </div>
        </div>

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

        {planningGuidance && (
          <div className="md:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-ink">{planningGuidance.title}</p>
            <p className="mt-2 text-sm text-ink/80">
              {planningGuidance.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={discoveringDocuments}
                onClick={() => void discoverComplementaryDocuments()}
              >
                {discoveringDocuments
                  ? "Buscando..."
                  : "Buscar ficha urbanistica / documento complementario"}
              </button>
              <span className="text-sm text-ink/70">
                Tambien puedes subir manualmente ficha urbanistica, PGOU o plano de zonificacion en Archivo normativa.
              </span>
            </div>
          </div>
        )}

        {discoveryCandidates.length > 0 && (
          <div className="md:col-span-2 rounded-md border border-line bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-ink">
              Posibles documentos complementarios:
            </p>
            <div className="space-y-3">
              {discoveryCandidates.map((candidate) => (
                <div
                  className="flex flex-col gap-3 rounded-md border border-line px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                  key={candidate.url}
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{candidate.title}</p>
                    <p className="text-xs text-ink/60">{candidate.url}</p>
                    <p className="mt-1 text-xs text-ink/70">
                      {candidate.kind} / {candidate.confidence} / {candidate.reason}
                    </p>
                  </div>
                  <button
                    className="rounded-md border border-line bg-soft px-3 py-2 text-sm font-semibold text-ink"
                    type="button"
                    onClick={() => useDiscoveryCandidate(candidate)}
                  >
                    Usar este documento
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {linkCandidates.length > 0 && (
          <div className="md:col-span-2 rounded-md border border-line bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-ink">
              No se encontraron reglas claras en la pagina inicial. Documentos candidatos:
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
                      {candidate.sourceType} / {candidate.confidence} / {candidate.reason}
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
