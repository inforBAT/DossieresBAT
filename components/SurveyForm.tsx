"use client";

import { useState } from "react";
import { normalizeUploadedFile } from "@/lib/normalizeUploadedFile";
import {
  normalizeTypeformSurvey,
  readTypeformWorkbook,
} from "@/lib/typeformSurvey";
import type { ProjectInputV2, UploadedAsset } from "@/lib/projectInputSchema";

interface SurveyFormProps {
  projectInput: ProjectInputV2;
  onChange: (next: ProjectInputV2) => void;
}

export function SurveyForm({ projectInput, onChange }: SurveyFormProps) {
  const [message, setMessage] = useState("");

  async function registerSurveyFile(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const normalized: UploadedAsset = normalizeUploadedFile(file, {
        category: "survey_files",
        index: projectInput.assets.survey_files.length + 1,
      });

      const withRegisteredAsset: ProjectInputV2 = {
        ...projectInput,
        assets: {
          ...projectInput.assets,
          survey_files: [...projectInput.assets.survey_files, normalized],
        },
        survey: {
          ...projectInput.survey,
          status: "pending_normalization",
          source_file: normalized.path,
        },
      };

      try {
        const workbookData = await readTypeformWorkbook(file);
        onChange(normalizeTypeformSurvey(withRegisteredAsset, workbookData));
        setMessage("Encuesta registrada y normalizada.");
      } catch {
        onChange(withRegisteredAsset);
        setMessage("Encuesta registrada, pero no se pudo normalizar automáticamente.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Archivo invÃ¡lido.");
    }
  }

  return (
    <section className="section" id="survey">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-muted">
            04
          </p>
          <h2 className="text-2xl font-semibold text-ink">Encuesta / briefing</h2>
        </div>
        <div className="rounded-md border border-line bg-soft px-3 py-2 text-sm font-semibold text-ink">
          {projectInput.survey.status}
        </div>
      </div>

      <label>
        <span className="label">Archivo XLSX / CSV</span>
        <input
          className="field file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
          type="file"
          accept=".xlsx,.csv"
          onChange={(event) => void registerSurveyFile(event.target.files?.[0])}
        />
      </label>

      {message && <p className="mt-3 text-sm font-semibold text-ink">{message}</p>}

      {projectInput.assets.survey_files.length > 0 && (
        <div className="mt-5 rounded-md border border-line bg-white">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            Survey files
          </div>
          <div className="divide-y divide-line">
            {projectInput.assets.survey_files.map((asset) => (
              <div className="px-4 py-3" key={asset.id}>
                <p className="text-sm font-semibold text-ink">
                  {asset.normalized_name}
                </p>
                <p className="font-mono text-xs text-ink/55">{asset.path}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
