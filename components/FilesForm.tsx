"use client";

import { useMemo, useState } from "react";
import {
  ALLOWED_EXTENSIONS,
  normalizeUploadedFile,
} from "@/lib/normalizeUploadedFile";
import {
  ASSET_CATEGORIES,
  type AssetCategory,
  type AssetsBlock,
  type UploadedAsset,
} from "@/lib/projectInputSchema";

interface FilesFormProps {
  assets: AssetsBlock;
  onChange: (assets: AssetsBlock) => void;
}

interface PendingFile {
  file: File;
  category: AssetCategory;
  label: string;
  role: string;
  error: string;
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  site_photos: "Fotos solar",
  cad_files: "CAD / geometría",
  survey_files: "Encuesta",
  planning_files: "Normativa",
  reference_images: "Referencias",
  other_files: "Otros",
  generated: "Generados",
};

function updateAssetGroup(
  assets: AssetsBlock,
  category: AssetCategory,
  nextGroup: UploadedAsset[],
): AssetsBlock {
  return {
    ...assets,
    [category]: nextGroup,
  };
}

export function FilesForm({ assets, onChange }: FilesFormProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [defaultCategory, setDefaultCategory] =
    useState<AssetCategory>("site_photos");
  const [message, setMessage] = useState("");

  const totalAssets = useMemo(
    () => ASSET_CATEGORIES.reduce((sum, category) => sum + assets[category].length, 0),
    [assets],
  );

  function handleFilesSelected(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    setMessage("");
    setPendingFiles(
      files.map((file) => ({
        file,
        category: defaultCategory,
        label: "",
        role: "",
        error: "",
      })),
    );
  }

  function updatePending(index: number, patch: Partial<PendingFile>) {
    setPendingFiles((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch, error: "" } : item,
      ),
    );
  }

  function addPendingFiles() {
    const nextAssets: AssetsBlock = { ...assets };
    const errors: Record<number, string> = {};

    for (const [index, pending] of pendingFiles.entries()) {
      try {
        const nextIndex = nextAssets[pending.category].length + 1;
        const normalized = normalizeUploadedFile(pending.file, {
          category: pending.category,
          index: nextIndex,
          label: pending.label,
          role: pending.role,
        });
        nextAssets[pending.category] = [
          ...nextAssets[pending.category],
          normalized,
        ];
      } catch (error) {
        errors[index] = error instanceof Error ? error.message : "Archivo inválido.";
      }
    }

    if (Object.keys(errors).length > 0) {
      setPendingFiles((current) =>
        current.map((item, index) => ({
          ...item,
          error: errors[index] ?? item.error,
        })),
      );
      setMessage("Hay archivos pendientes con formato no admitido.");
      return;
    }

    onChange(nextAssets);
    setPendingFiles([]);
    setMessage("Archivos registrados.");
  }

  function removeAsset(category: AssetCategory, assetId: string) {
    onChange(
      updateAssetGroup(
        assets,
        category,
        assets[category].filter((asset) => asset.id !== assetId),
      ),
    );
  }

  return (
    <section className="section" id="files">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-muted">
            03
          </p>
          <h2 className="text-2xl font-semibold text-ink">Archivos del solar</h2>
        </div>
        <div className="rounded-md border border-line bg-soft px-3 py-2 text-sm font-semibold text-ink">
          {totalAssets} registrados
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <label>
          <span className="label">Categoría inicial</span>
          <select
            className="field"
            value={defaultCategory}
            onChange={(event) =>
              setDefaultCategory(event.target.value as AssetCategory)
            }
          >
            {ASSET_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">Seleccionar archivos</span>
          <input
            className="field file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
            onChange={(event) => handleFilesSelected(event.target.files)}
          />
        </label>
      </div>

      {pendingFiles.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-md border border-line bg-white">
          <div className="grid gap-3 border-b border-line bg-soft px-4 py-3 text-xs font-semibold uppercase tracking-normal text-muted md:grid-cols-[1fr_180px_160px_160px]">
            <span>Archivo</span>
            <span>Categoría</span>
            <span>Label</span>
            <span>Role</span>
          </div>
          <div className="divide-y divide-line">
            {pendingFiles.map((pending, index) => (
              <div
                className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_180px_160px_160px]"
                key={`${pending.file.name}-${index}`}
              >
                <div>
                  <p className="truncate text-sm font-semibold text-ink">
                    {pending.file.name}
                  </p>
                  {pending.error && (
                    <p className="mt-1 text-xs font-semibold text-brick">
                      {pending.error}
                    </p>
                  )}
                </div>
                <select
                  className="field"
                  value={pending.category}
                  onChange={(event) =>
                    updatePending(index, {
                      category: event.target.value as AssetCategory,
                    })
                  }
                >
                  {ASSET_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
                <input
                  className="field"
                  value={pending.label}
                  onChange={(event) =>
                    updatePending(index, { label: event.target.value })
                  }
                />
                <input
                  className="field"
                  value={pending.role}
                  onChange={(event) =>
                    updatePending(index, { role: event.target.value })
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
            <p className="text-sm text-ink/65">{message}</p>
            <button className="button-primary" type="button" onClick={addPendingFiles}>
              Registrar archivos
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {ASSET_CATEGORIES.map((category) => (
          <div className="rounded-md border border-line bg-white" key={category}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">
                {CATEGORY_LABELS[category]}
              </h3>
              <span className="text-xs font-semibold text-ink/55">
                {assets[category].length}
              </span>
            </div>
            <div className="divide-y divide-line">
              {assets[category].length === 0 ? (
                <p className="px-4 py-4 text-sm text-ink/55">Sin archivos.</p>
              ) : (
                assets[category].map((asset) => (
                  <div className="px-4 py-3" key={asset.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {asset.normalized_name}
                        </p>
                        <p className="truncate font-mono text-xs text-ink/55">
                          {asset.path}
                        </p>
                        <p className="truncate text-xs text-ink/55">
                          {asset.original_name}
                        </p>
                      </div>
                      <button
                        className="button-danger"
                        type="button"
                        onClick={() => removeAsset(category, asset.id)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
