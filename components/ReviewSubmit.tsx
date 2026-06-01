"use client";

import { useMemo, useState } from "react";
import { buildWebhookPayload } from "@/lib/buildProjectInput";
import {
  MINIMUM_REQUIREMENTS,
  type RequirementMissing,
  type ProjectInputV2,
} from "@/lib/projectInputSchema";

interface ReviewSubmitProps {
  projectInput: ProjectInputV2;
  onReset: () => void;
}

function getValue(projectInput: ProjectInputV2, path: string): string {
  const [block, key] = path.split(".") as [keyof ProjectInputV2, string];
  const value = (projectInput[block] as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function requirementSummary(requirement: RequirementMissing): string {
  return `${requirement.id} · ${requirement.message}`;
}

function copyWithTextareaFallback(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function ReviewSubmit({ projectInput, onReset }: ReviewSubmitProps) {
  const [copyMessage, setCopyMessage] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const json = useMemo(
    () => JSON.stringify(projectInput, null, 2),
    [projectInput],
  );

  const webhookUrl = process.env.NEXT_PUBLIC_DOSSIERES_INTAKE_WEBHOOK_URL;

  async function copyJson() {
    setCopyMessage("");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API no disponible.");
      }

      await navigator.clipboard.writeText(json);
      setCopyMessage("JSON copiado.");
    } catch {
      const copied = copyWithTextareaFallback(json);
      setCopyMessage(
        copied
          ? "JSON copiado."
          : "No se pudo copiar automáticamente. Selecciona el JSON y cópialo manualmente.",
      );
    }
  }

  async function sendToMake() {
    if (!webhookUrl) {
      setSubmitMessage("Webhook no configurado.");
      return;
    }

    setSubmitting(true);
    setSubmitMessage("");
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildWebhookPayload(projectInput)),
      });

      if (!response.ok) {
        throw new Error(`Make respondió ${response.status}`);
      }

      setSubmitMessage("Enviado a Make.");
    } catch (error) {
      setSubmitMessage(
        error instanceof Error ? error.message : "Error enviando a Make.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section" id="review">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-muted">
            06
          </p>
          <h2 className="text-2xl font-semibold text-ink">Revisión final</h2>
        </div>
        <div className="rounded-md border border-line bg-soft px-3 py-2 text-sm font-semibold text-ink">
          {projectInput.workflow.status}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <div className="rounded-md border border-line bg-white">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              Checklist
            </div>
            <div className="divide-y divide-line">
              {MINIMUM_REQUIREMENTS.map((requirement) => {
                const complete = getValue(projectInput, requirement.path).trim().length > 0;
                return (
                  <div
                    className="flex items-center justify-between gap-3 px-4 py-3"
                    key={requirement.path}
                  >
                    <span className="text-sm text-ink">{requirement.label}</span>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        complete
                          ? "bg-moss/15 text-moss"
                          : "bg-brick/10 text-brick"
                      }`}
                    >
                      {complete ? "OK" : "Falta"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-line bg-white">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              requirements.missing
            </div>
            {projectInput.requirements.missing.length === 0 ? (
              <p className="px-4 py-4 text-sm text-moss">Sin faltantes.</p>
            ) : (
              <ul className="divide-y divide-line">
                {projectInput.requirements.missing.map((requirement) => (
                  <li className="px-4 py-3 text-xs" key={requirement.id}>
                    <p className="font-mono font-semibold text-ink">
                      {requirement.label}
                    </p>
                    <p className="mt-1 text-muted">
                      {requirementSummary(requirement)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-line bg-white">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              Warnings
            </div>
            {projectInput.workflow.warnings.length === 0 ? (
              <p className="px-4 py-4 text-sm text-moss">Sin avisos.</p>
            ) : (
              <ul className="divide-y divide-line">
                {projectInput.workflow.warnings.map((warning) => (
                  <li className="px-4 py-3 font-mono text-xs" key={warning}>
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-line bg-white px-4 py-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-ink/55">can_generate_pdf</p>
                <p className="font-semibold text-ink">
                  {String(projectInput.workflow.can_generate_pdf)}
                </p>
              </div>
              <div>
                <p className="text-ink/55">Webhook</p>
                <p className="truncate font-semibold text-ink">
                  {webhookUrl ? "configurado" : "sin configurar"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="button-secondary" type="button" onClick={copyJson}>
              Copiar JSON
            </button>
            <button
              className="button-primary"
              type="button"
              disabled={submitting}
              onClick={sendToMake}
            >
              {submitting ? "Enviando..." : "Enviar a Make"}
            </button>
            <button className="button-secondary" type="button" onClick={onReset}>
              Reiniciar
            </button>
          </div>

          {(copyMessage || submitMessage) && (
            <p className="text-sm font-semibold text-ink">
              {copyMessage || submitMessage}
            </p>
          )}
        </div>

        <pre className="max-h-[760px] overflow-auto rounded-md border border-line bg-ink p-4 text-xs leading-relaxed text-paper shadow-soft">
          {json}
        </pre>
      </div>
    </section>
  );
}
