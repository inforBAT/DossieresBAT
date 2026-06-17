"use client";

import { useState } from "react";
import { normalizeUploadedFile } from "@/lib/normalizeUploadedFile";
import {
  applyAcceptedPlanningRulesProposal,
  applyPlanningExtractionProposal,
  hasClearPlanningSourceArticles,
  hasPlanningReviewNotesNeedingComplementaryDocuments,
  needsComplementaryPlanningDocuments,
  type PlanningExtractionResult,
} from "@/lib/planningTextExtractor";
import type { PlanningLinkCandidate } from "@/lib/planningUrlCandidates";
import type {
  AssetsBlock,
  PlanningBlock,
  PlanningListRuleProposal,
  PlanningNumericRuleProposal,
  PlanningRuleProposalStatus,
  PlanningRules,
  PlanningRulesProposal,
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
  candidates?: PlanningLinkCandidate[];
  warnings?: string[];
  error?: string;
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

function shouldShowPlanningGuidance(planning: PlanningBlock): boolean {
  return hasPlanningReviewNotesNeedingComplementaryDocuments(
    planning.review_notes,
  );
}

function statusLabel(status: PlanningRuleProposalStatus): string {
  switch (status) {
    case "accepted":
      return "Aceptada";
    case "rejected":
      return "Rechazada";
    case "edited":
      return "Editada";
    default:
      return "Propuesta";
  }
}

function nextEditedStatus(
  current: PlanningRuleProposalStatus,
): PlanningRuleProposalStatus {
  return current === "accepted" ? "accepted" : "edited";
}

function hasNumericProposalValue(proposal: PlanningNumericRuleProposal): boolean {
  return typeof proposal.value === "number";
}

function hasListProposalValue(proposal: PlanningListRuleProposal): boolean {
  return proposal.values.length > 0;
}

function countApplicableAcceptedRules(
  proposal: PlanningRulesProposal,
): number {
  let count = 0;

  if (proposal.max_floors.status === "accepted" && hasNumericProposalValue(proposal.max_floors)) {
    count += 1;
  }

  if (
    proposal.occupancy_percent.status === "accepted" &&
    hasNumericProposalValue(proposal.occupancy_percent)
  ) {
    count += 1;
  }

  if (
    proposal.setbacks.front_m.status === "accepted" &&
    hasNumericProposalValue(proposal.setbacks.front_m)
  ) {
    count += 1;
  }

  return count;
}

function proposalMissingValueMessage(): string {
  return "No se ha podido determinar este parametro. Requiere ficha urbanistica o documento complementario.";
}

export function PlanningForm({
  assets,
  planning,
  site,
  onChange,
}: PlanningFormProps) {
  const acceptedApplicableRulesCount = countApplicableAcceptedRules(
    planning.rules_proposal,
  );
  const [message, setMessage] = useState("");
  const [planningSourceFile, setPlanningSourceFile] = useState<File | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [extractingUrl, setExtractingUrl] = useState(false);
  const [discoveringPlanning, setDiscoveringPlanning] = useState(false);
  const [processingCandidateUrl, setProcessingCandidateUrl] = useState("");
  const [linkCandidates, setLinkCandidates] = useState<PlanningLinkCandidate[]>([]);
  const planningGuidance = shouldShowPlanningGuidance(planning);

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

  function updateRulesProposal(nextRulesProposal: PlanningRulesProposal) {
    onChange({
      planning: {
        ...planning,
        status: "processed_needs_review",
        rules_confirmed_by_user: false,
        rules_proposal: nextRulesProposal,
      },
    });
  }

  function changeRulesProposal(patch: Partial<PlanningRulesProposal>) {
    updateRulesProposal({
      ...planning.rules_proposal,
      ...patch,
      setbacks: {
        ...planning.rules_proposal.setbacks,
        ...patch.setbacks,
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
        status:
          patch.status ??
          nextEditedStatus(planning.rules_proposal[key].status),
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
          status:
            patch.status ??
            nextEditedStatus(planning.rules_proposal.setbacks[key].status),
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
        status:
          patch.status ??
          nextEditedStatus(planning.rules_proposal[key].status),
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

  function applyExtractionResult(
    sourceLabel: string,
    extraction: PlanningExtractionResult,
    planningBase: PlanningBlock = planning,
  ) {
    const applied = applyPlanningExtractionProposal(planningBase, extraction);
    changePlanning(applied.planning);

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

    if (extraction.confidence === "low" && !hasClearSources) {
      setMessage(
        "La lectura del PDF es de confianza baja y no aporta citas claras. Revisa las notas y busca documentacion complementaria.",
      );
      return;
    }

    setMessage(
      `Normativa extraida desde ${sourceLabel}. Revisa, acepta o rechaza las reglas detectadas antes de aplicarlas a la normativa final.`,
    );
  }

  function applyAcceptedRules() {
    const applied = applyAcceptedPlanningRulesProposal(planning);
    changePlanning(applied.planning);

    if (applied.appliedFields.length > 0) {
      setMessage(
        `Se aplicaron reglas aceptadas: ${applied.appliedFields.join(", ")}.`,
      );
      return;
    }

    setMessage(
      applied.warnings[0] ||
        "No habia reglas aceptadas con equivalencias seguras para aplicar.",
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
      throw new Error(
        payload.error || "No se pudo extraer normativa desde la URL.",
      );
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

  async function discoverComplementaryDocuments() {
    setDiscoveringPlanning(true);
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
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      const payload = (await response.json()) as DiscoverPlanningResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "No se pudieron buscar documentos complementarios.",
        );
      }

      setLinkCandidates(payload.candidates ?? []);
      setMessage(
        (payload.candidates?.length ?? 0) > 0
          ? "Se han encontrado posibles documentos complementarios. Revisa y elige la fuente mas fiable."
          : payload.warnings?.[0] ||
              "No se han encontrado documentos complementarios automaticamente. Sube manualmente ficha urbanistica, PGOU o plano de zonificacion.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron buscar documentos complementarios.",
      );
    } finally {
      setDiscoveringPlanning(false);
    }
  }

  function useLinkCandidate(candidate: PlanningLinkCandidate) {
    changePlanning({
      planning_url: candidate.url,
      status: "processed_needs_review",
      rules_confirmed_by_user: false,
    });
    setMessage(
      "Se ha seleccionado un documento candidato. Revisa la URL y ejecuta Extraer normativa de URL cuando quieras analizarlo.",
    );
  }

  async function processLinkCandidate(candidate: PlanningLinkCandidate) {
    setProcessingCandidateUrl(candidate.url);
    try {
      const planningBase: PlanningBlock = {
        ...planning,
        planning_url: candidate.url,
      };
      changePlanning({ planning_url: candidate.url });
      const payload = await requestUrlExtraction(candidate.url);
      setLinkCandidates(payload.linkCandidates ?? []);
      applyExtractionResult(candidate.title, payload.extraction!, planningBase);
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

  function renderProposalActions(
    title: string,
    status: PlanningRuleProposalStatus,
    canAccept: boolean,
    onAccept: () => void,
    onReject: () => void,
  ) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-line bg-white px-2 py-1 text-xs font-semibold text-ink">
          {title}: {statusLabel(status)}
        </span>
        <button
          className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={!canAccept}
          onClick={onAccept}
        >
          Aceptar
        </button>
        <button
          className="rounded-md border border-line bg-soft px-3 py-1.5 text-xs font-semibold text-ink"
          type="button"
          onClick={onReject}
        >
          Rechazar
        </button>
        {!canAccept && (
          <span className="text-xs text-ink/70">
            {proposalMissingValueMessage()}
          </span>
        )}
      </div>
    );
  }

  function renderNumericProposalMeta(proposal: PlanningNumericRuleProposal) {
    return (
      <>
        <span className="mt-1 block text-xs font-semibold text-ink/75">
          {hasNumericProposalValue(proposal)
            ? `Valor detectado: ${proposal.value}`
            : "Sin valor aplicable detectado"}
        </span>
        <span className="mt-1 block text-xs text-ink/60">
          Confianza: {proposal.confidence}
        </span>
        <span className="mt-1 block text-xs text-ink/70">
          Extracto: {proposal.source_excerpt || "Sin extracto"}
        </span>
        {proposal.reason && (
          <span className="mt-1 block text-xs text-amber-800">
            Motivo: {proposal.reason}
          </span>
        )}
      </>
    );
  }

  function renderListProposalMeta(proposal: PlanningListRuleProposal) {
    return (
      <>
        <span className="mt-1 block text-xs font-semibold text-ink/75">
          {hasListProposalValue(proposal)
            ? `Valores detectados: ${proposal.values.join(", ")}`
            : "Sin valor aplicable detectado"}
        </span>
        <span className="mt-1 block text-xs text-ink/60">
          Confianza: {proposal.confidence}
        </span>
        <span className="mt-1 block text-xs text-ink/70">
          Extracto: {proposal.source_excerpt || "Sin extracto"}
        </span>
        {proposal.reason && (
          <span className="mt-1 block text-xs text-amber-800">
            Motivo: {proposal.reason}
          </span>
        )}
      </>
    );
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">
                Reglas detectadas para revision humana
              </p>
              <p className="mt-1 text-xs text-ink/70">
                Revisa cada propuesta, acepta o rechaza, y luego aplica solo las equivalencias seguras a la normativa final.
              </p>
            </div>
            <button
              className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={acceptedApplicableRulesCount === 0}
              onClick={applyAcceptedRules}
            >
              {acceptedApplicableRulesCount > 0
                ? `Aplicar ${acceptedApplicableRulesCount} reglas aceptadas`
                : "No hay reglas aceptadas aplicables"}
            </button>
          </div>

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
                    reason: "",
                  })
                }
              />
              {renderNumericProposalMeta(planning.rules_proposal.buildability_m2_m2)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.buildability_m2_m2.status,
                hasNumericProposalValue(planning.rules_proposal.buildability_m2_m2),
                () => changeNumericProposal("buildability_m2_m2", { status: "accepted" }),
                () => changeNumericProposal("buildability_m2_m2", { status: "rejected" }),
              )}
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
                    reason: "",
                  })
                }
              />
              {renderNumericProposalMeta(planning.rules_proposal.occupancy_percent)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.occupancy_percent.status,
                hasNumericProposalValue(planning.rules_proposal.occupancy_percent),
                () => changeNumericProposal("occupancy_percent", { status: "accepted" }),
                () => changeNumericProposal("occupancy_percent", { status: "rejected" }),
              )}
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
                    reason: "",
                  })
                }
              />
              {renderNumericProposalMeta(planning.rules_proposal.max_height_m)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.max_height_m.status,
                hasNumericProposalValue(planning.rules_proposal.max_height_m),
                () => changeNumericProposal("max_height_m", { status: "accepted" }),
                () => changeNumericProposal("max_height_m", { status: "rejected" }),
              )}
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
                    reason: "",
                  })
                }
              />
              {renderNumericProposalMeta(planning.rules_proposal.max_floors)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.max_floors.status,
                hasNumericProposalValue(planning.rules_proposal.max_floors),
                () => changeNumericProposal("max_floors", { status: "accepted" }),
                () => changeNumericProposal("max_floors", { status: "rejected" }),
              )}
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
                    reason: "",
                  })
                }
              />
              {renderNumericProposalMeta(planning.rules_proposal.setbacks.front_m)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.setbacks.front_m.status,
                hasNumericProposalValue(planning.rules_proposal.setbacks.front_m),
                () => changeSetbackProposal("front_m", { status: "accepted" }),
                () => changeSetbackProposal("front_m", { status: "rejected" }),
              )}
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
                    reason: "",
                  })
                }
              />
              {renderNumericProposalMeta(planning.rules_proposal.setbacks.rear_m)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.setbacks.rear_m.status,
                hasNumericProposalValue(planning.rules_proposal.setbacks.rear_m),
                () => changeSetbackProposal("rear_m", { status: "accepted" }),
                () => changeSetbackProposal("rear_m", { status: "rejected" }),
              )}
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
                    reason: "",
                  })
                }
              />
              {renderNumericProposalMeta(planning.rules_proposal.setbacks.side_m)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.setbacks.side_m.status,
                hasNumericProposalValue(planning.rules_proposal.setbacks.side_m),
                () => changeSetbackProposal("side_m", { status: "accepted" }),
                () => changeSetbackProposal("side_m", { status: "rejected" }),
              )}
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
                    reason: "",
                  })
                }
              />
              {renderListProposalMeta(planning.rules_proposal.uses_allowed)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.uses_allowed.status,
                hasListProposalValue(planning.rules_proposal.uses_allowed),
                () => changeListProposal("uses_allowed", { status: "accepted" }),
                () => changeListProposal("uses_allowed", { status: "rejected" }),
              )}
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
                    reason: "",
                  })
                }
              />
              {renderListProposalMeta(planning.rules_proposal.uses_forbidden)}
              {renderProposalActions(
                "Estado",
                planning.rules_proposal.uses_forbidden.status,
                hasListProposalValue(planning.rules_proposal.uses_forbidden),
                () => changeListProposal("uses_forbidden", { status: "accepted" }),
                () => changeListProposal("uses_forbidden", { status: "rejected" }),
              )}
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
            disabled={
              extractingUrl || discoveringPlanning || !planning.planning_url.trim()
            }
            onClick={() => void extractFromUrl()}
          >
            {extractingUrl ? "Extrayendo URL..." : "Extraer normativa de URL"}
          </button>
        </div>

        {planningGuidance && (
          <div className="md:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-ink">
              El PDF se ha leido con IA, pero parece ser una ordenanza general. Falta la ficha urbanistica o el ambito aplicable a la parcela.
            </p>
            <p className="mt-2 text-sm text-ink/80">
              Siguiente paso recomendado: usa direccion, municipio y referencia catastral para buscar documentos complementarios, o sube manualmente la ficha urbanistica, PGOU o plano de zonificacion.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={discoveringPlanning || extractingUrl}
                onClick={() => void discoverComplementaryDocuments()}
              >
                {discoveringPlanning
                  ? "Buscando documentos..."
                  : "Buscar ficha urbanistica / documento complementario"}
              </button>
              <span className="text-sm text-ink/70">
                Tambien puedes subir manualmente ficha urbanistica, PGOU o plano de zonificacion en Archivo normativa.
              </span>
            </div>
          </div>
        )}

        {linkCandidates.length > 0 && (
          <div className="md:col-span-2 rounded-md border border-line bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-ink">
              Se han encontrado documentos candidatos. Revisa y elige el que mejor encaje con la parcela.
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
                      {candidate.kind} · {candidate.confidence} · {candidate.reason}
                    </p>
                    <p className="mt-1 text-xs text-ink/60">
                      Fuente: {candidate.source}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      disabled={processingCandidateUrl === candidate.url}
                      onClick={() => useLinkCandidate(candidate)}
                    >
                      Usar este documento
                    </button>
                    <button
                      className="rounded-md border border-line bg-soft px-3 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      disabled={processingCandidateUrl === candidate.url}
                      onClick={() => void processLinkCandidate(candidate)}
                    >
                      {processingCandidateUrl === candidate.url
                        ? "Procesando..."
                        : "Extraer ahora"}
                    </button>
                  </div>
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
