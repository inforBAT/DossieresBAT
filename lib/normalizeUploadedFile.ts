import {
  ASSET_CATEGORIES,
  type AssetCategory,
  type UploadedAsset,
} from "./projectInputSchema";

export const ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "heic",
  "pdf",
  "docx",
  "txt",
  "xlsx",
  "csv",
  "dwg",
  "dxf",
  "svg",
] as const;

type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

const CATEGORY_PREFIX: Record<AssetCategory, string> = {
  site_photos: "site_photo",
  cad_files: "cad_file",
  survey_files: "survey_file",
  planning_files: "planning_file",
  reference_images: "reference_image",
  other_files: "other_file",
  generated: "generated",
};

export interface NormalizeUploadedFileOptions {
  category: AssetCategory;
  index: number;
  label?: string;
  role?: string;
}

function getExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() ?? "" : "";
}

function padIndex(index: number): string {
  return String(Math.max(index, 1)).padStart(3, "0");
}

function assertCategory(category: AssetCategory): void {
  if (!ASSET_CATEGORIES.includes(category)) {
    throw new Error("Categoría de archivo no válida.");
  }
}

export function normalizeUploadedFile(
  file: File,
  options: NormalizeUploadedFileOptions,
): UploadedAsset {
  assertCategory(options.category);
  const extension = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(extension as AllowedExtension)) {
    throw new Error(`Formato no admitido: ${file.name}`);
  }

  const prefix = CATEGORY_PREFIX[options.category];
  const normalizedName = `${prefix}_${padIndex(options.index)}.${extension}`;
  const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    category: options.category,
    original_name: file.name,
    normalized_name: normalizedName,
    extension,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    path: `assets/${options.category}/${normalizedName}`,
    label: options.label?.trim() || "",
    role: options.role?.trim() || "",
    status: "accepted",
    created_at: new Date().toISOString(),
  };
}
