import { buildProjectInput } from "./buildProjectInput";
import type { ProjectInputV2, SurveySummary } from "./projectInputSchema";

export interface TypeformWorkbookData {
  rows: string[][];
}

interface TypeformCell {
  column: string;
  index: number;
  header: string;
  value: string;
}

function indexToColumn(index: number): string {
  let current = index + 1;
  let column = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }

  return column;
}

function columnToIndex(column: string): number {
  return column
    .toUpperCase()
    .split("")
    .reduce((result, character) => result * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "234"
  );
}

function isSelectedValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (isPlaceholderValue(normalized)) {
    return false;
  }

  return !["0", "false", "no"].includes(normalized);
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLocaleLowerCase("es");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}

function appendText(base: string, additions: string[]): string {
  return uniqueStrings(
    [base, ...additions]
      .flatMap((item) => item.split("\n"))
      .map((item) => item.trim()),
  ).join("\n");
}

function extractFirstNumber(value: string): number | null {
  const matches = value.match(/\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const first = Number(matches[0].replace(",", "."));
  return Number.isFinite(first) ? first : null;
}

function extractNumericRangeAverage(value: string): number | null {
  const matches = value.match(/\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const numbers = matches
    .map((item) => Number(item.replace(",", ".")))
    .filter((item) => Number.isFinite(item));

  if (numbers.length === 0) {
    return null;
  }

  if (numbers.length === 1) {
    return numbers[0];
  }

  return Math.round((numbers[0] + numbers[numbers.length - 1]) / 2);
}

function firstNonPlaceholder(values: string[]): string {
  return values.find((value) => !isPlaceholderValue(value)) ?? "";
}

function keywordPriority(values: string[]): string[] {
  const text = values.join(" ").toLocaleLowerCase("es");
  const priorities: string[] = [];

  if (/(vista|panoram|paisaje)/.test(text)) {
    priorities.push("Vistas");
  }
  if (/(orientaci|sur|este|oeste)/.test(text)) {
    priorities.push("Orientación");
  }
  if (/(luz|luminos|solead)/.test(text)) {
    priorities.push("Luz natural");
  }
  if (/(jardin|terraza|porche|exterior)/.test(text)) {
    priorities.push("Exterior");
  }
  if (/(confort|comod|bienestar)/.test(text)) {
    priorities.push("Confort");
  }
  if (/(relax|calma|descanso|tranquil)/.test(text)) {
    priorities.push("Relax");
  }
  if (/(piscina|pool)/.test(text)) {
    priorities.push("Piscina");
  }

  return priorities;
}

function workbookCells(data: TypeformWorkbookData): TypeformCell[] {
  const [headerRow = [], ...bodyRows] = data.rows;
  const firstRow =
    bodyRows.find((row) => row.some((value) => !isPlaceholderValue(value))) ?? [];
  const width = Math.max(headerRow.length, firstRow.length);

  return Array.from({ length: width }, (_, index) => ({
    column: indexToColumn(index),
    index,
    header: normalizeCellValue(headerRow[index]),
    value: normalizeCellValue(firstRow[index]),
  }));
}

function getByColumns(cells: TypeformCell[], columns: string[]): string[] {
  return columns
    .map((column) =>
      cells.find((cell) => cell.column === column.toUpperCase())?.value ?? "",
    )
    .filter((value) => !isPlaceholderValue(value));
}

function getByHeader(cells: TypeformCell[], header: string): string[] {
  return cells
    .filter((cell) => cell.header === header)
    .map((cell) => cell.value)
    .filter((value) => !isPlaceholderValue(value));
}

function selectedLabelsInRange(
  cells: TypeformCell[],
  startColumn: string,
  endColumn: string,
): string[] {
  const startIndex = columnToIndex(startColumn);
  const endIndex = columnToIndex(endColumn);

  return uniqueStrings(
    cells
      .filter((cell) => cell.index >= startIndex && cell.index <= endIndex)
      .flatMap((cell) => {
        if (!isSelectedValue(cell.value)) {
          return [];
        }

        const genericHeader = ["other", "otro", "otra"].includes(
          cell.header.trim().toLowerCase(),
        );
        return [genericHeader ? cell.value : cell.header];
      }),
  );
}

function valuesInRange(
  cells: TypeformCell[],
  startColumn: string,
  endColumn: string,
): string[] {
  const startIndex = columnToIndex(startColumn);
  const endIndex = columnToIndex(endColumn);

  return uniqueStrings(
    cells
      .filter((cell) => cell.index >= startIndex && cell.index <= endIndex)
      .flatMap((cell) => {
        if (isPlaceholderValue(cell.value)) {
          return [];
        }

        if (isSelectedValue(cell.value) && cell.header && cell.value !== cell.header) {
          return [`${cell.header}: ${cell.value}`];
        }

        return [cell.value];
      }),
  );
}

function addBulletSection(
  title: string,
  values: string[],
  current: string[],
): string[] {
  if (values.length === 0) {
    return current;
  }

  return [...current, `${title}: ${values.join(", ")}`];
}

function mergeSummary(
  current: SurveySummary,
  patch: Partial<SurveySummary>,
): SurveySummary {
  return {
    ...current,
    ...patch,
    main_priorities: uniqueStrings([
      ...current.main_priorities,
      ...(patch.main_priorities ?? []),
    ]),
    facade_materials: uniqueStrings([
      ...current.facade_materials,
      ...(patch.facade_materials ?? []),
    ]),
    exterior_paving: uniqueStrings([
      ...current.exterior_paving,
      ...(patch.exterior_paving ?? []),
    ]),
    day_area_bullets: uniqueStrings([
      ...current.day_area_bullets,
      ...(patch.day_area_bullets ?? []),
    ]),
    night_area_bullets: uniqueStrings([
      ...current.night_area_bullets,
      ...(patch.night_area_bullets ?? []),
    ]),
    interior_flooring: uniqueStrings([
      ...current.interior_flooring,
      ...(patch.interior_flooring ?? []),
    ]),
    wall_finishes: uniqueStrings([
      ...current.wall_finishes,
      ...(patch.wall_finishes ?? []),
    ]),
    extra_uses: uniqueStrings([
      ...current.extra_uses,
      ...(patch.extra_uses ?? []),
    ]),
  };
}

function hasUsefulSurveyData(
  summary: SurveySummary,
  desiredTotalBuiltM2: number | null,
): boolean {
  return (
    summary.use_type.trim().length > 0 ||
    typeof summary.household_size === "number" ||
    summary.main_priorities.length > 0 ||
    summary.day_area_bullets.length > 0 ||
    summary.night_area_bullets.length > 0 ||
    summary.extra_uses.length > 0 ||
    typeof desiredTotalBuiltM2 === "number"
  );
}

export async function readTypeformWorkbook(
  file: File,
): Promise<TypeformWorkbookData> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    worksheet,
    {
      header: 1,
      defval: "",
      raw: false,
    },
  );

  return {
    rows: rows.map((row) => row.map((value) => normalizeCellValue(value))),
  };
}

export function normalizeTypeformSurvey(
  projectInput: ProjectInputV2,
  workbookData: TypeformWorkbookData,
): ProjectInputV2 {
  const normalized = buildProjectInput(projectInput);
  const cells = workbookCells(workbookData);

  if (cells.length === 0) {
    return normalized;
  }

  const clientName = firstNonPlaceholder([
    normalized.project.client_name,
    `${firstNonPlaceholder(getByColumns(cells, ["B"]))} ${firstNonPlaceholder(getByColumns(cells, ["C"]))}`.trim(),
  ]);
  const siteAddress = firstNonPlaceholder([
    normalized.site.address,
    ...getByColumns(cells, ["E"]),
  ]);

  const desiredSurfaceDisplay = firstNonPlaceholder([
    ...getByColumns(cells, ["T"]),
    ...getByHeader(cells, "¿Cuál crees que sería el tamaño ideal de tu vivienda?"),
  ]);
  const desiredSurface = extractNumericRangeAverage(desiredSurfaceDisplay);

  const mainPrioritySource = uniqueStrings([
    ...getByColumns(cells, ["I", "J", "AK", "AM", "HS", "IY", "JD"]),
    ...selectedLabelsInRange(cells, "HT", "IL"),
  ]);
  const mainPriorities = uniqueStrings(keywordPriority(mainPrioritySource));

  const exteriorStyle = firstNonPlaceholder([
    ...getByColumns(cells, ["AS"]),
    ...getByHeader(cells, "¿Qué imagen exterior prefieres para tu hogar?"),
  ]);
  const exteriorTones = firstNonPlaceholder(getByColumns(cells, ["BM"]));
  const interiorStyles = selectedLabelsInRange(cells, "FQ", "FX");
  const spaceType = firstNonPlaceholder(getByColumns(cells, ["FY"]));
  const useType = firstNonPlaceholder(getByColumns(cells, ["K"]));
  const householdSize = extractFirstNumber(firstNonPlaceholder(getByColumns(cells, ["L"])));

  const facadeMaterials = uniqueStrings([
    ...selectedLabelsInRange(cells, "AV", "BJ"),
    ...selectedLabelsInRange(cells, "BA", "BK"),
  ]);
  const exteriorPaving = selectedLabelsInRange(cells, "BT", "CB");
  const interiorFlooring = selectedLabelsInRange(cells, "GB", "GK");
  const wallFinishes = selectedLabelsInRange(cells, "GL", "GR");
  const extraUses = uniqueStrings([
    ...selectedLabelsInRange(cells, "U", "AC"),
    ...selectedLabelsInRange(cells, "HT", "IL"),
  ]);

  const dayAreaBullets = addBulletSection(
    "Relación cocina-salón-comedor",
    getByColumns(cells, ["CE"]),
    [],
  );
  const dayAreaWithCharacteristics = addBulletSection(
    "Características deseadas",
    getByColumns(cells, ["CF"]),
    dayAreaBullets,
  );
  const dayAreaWithKitchen = addBulletSection(
    "Cocina y equipamiento",
    valuesInRange(cells, "CG", "DC"),
    dayAreaWithCharacteristics,
  );
  const dayAreaWithLiving = addBulletSection(
    "Salón",
    valuesInRange(cells, "DN", "DZ"),
    dayAreaWithKitchen,
  );
  const completeDayAreaBullets = addBulletSection(
    "Comedor",
    valuesInRange(cells, "EA", "EG"),
    dayAreaWithLiving,
  );

  const nightAreaBullets = addBulletSection(
    "Dormitorio principal",
    valuesInRange(cells, "EH", "FC"),
    [],
  );
  const nightAreaWithSecondaryRooms = addBulletSection(
    "Dormitorios secundarios",
    valuesInRange(cells, "FD", "FJ"),
    nightAreaBullets,
  );
  const completeNightAreaBullets = addBulletSection(
    "Baños",
    valuesInRange(cells, "FK", "FP"),
    nightAreaWithSecondaryRooms,
  );

  const freeNotes = appendText(normalized.survey.summary.free_notes, uniqueStrings([
    `Teléfono: ${firstNonPlaceholder(getByColumns(cells, ["F"]))}`,
    `Email: ${firstNonPlaceholder(getByColumns(cells, ["G"]))}`,
    `Profesión: ${firstNonPlaceholder(getByColumns(cells, ["H"]))}`,
    `Niveles preferidos: ${firstNonPlaceholder(getByColumns(cells, ["AD"]))}`,
    `Plazas de párking: ${firstNonPlaceholder(getByColumns(cells, ["AF"]))}`,
    `Estética exterior: ${firstNonPlaceholder(getByColumns(cells, ["CD"]))}`,
    `Elementos decorativos: ${firstNonPlaceholder(getByColumns(cells, ["GA"]))}`,
    `Recuerdo a 10 años: ${firstNonPlaceholder(getByColumns(cells, ["JC"]))}`,
    `Vivienda de tus sueños: ${firstNonPlaceholder(getByColumns(cells, ["JD"]))}`,
    `Comentarios finales: ${firstNonPlaceholder(getByColumns(cells, ["JE"]))}`,
  ]));

  const nextSummary = mergeSummary(normalized.survey.summary, {
    use_type: useType || normalized.survey.summary.use_type,
    household_size: householdSize ?? normalized.survey.summary.household_size,
    main_priorities: mainPriorities,
    exterior_style: exteriorStyle || normalized.survey.summary.exterior_style,
    exterior_tones: exteriorTones || normalized.survey.summary.exterior_tones,
    facade_materials: facadeMaterials,
    exterior_paving: exteriorPaving,
    interior_style: uniqueStrings([
      normalized.survey.summary.interior_style,
      ...interiorStyles,
    ]).join(", "),
    space_type: spaceType || normalized.survey.summary.space_type,
    interior_flooring: interiorFlooring,
    wall_finishes: wallFinishes,
    day_area_bullets: completeDayAreaBullets,
    night_area_bullets: completeNightAreaBullets,
    extra_uses: extraUses,
    free_notes: freeNotes,
  });

  const normalizedSomething =
    clientName !== normalized.project.client_name ||
    siteAddress !== normalized.site.address ||
    desiredSurface !== normalized.program.desired_total_built_m2 ||
    desiredSurfaceDisplay !== normalized.program.desired_total_built_m2_display ||
    JSON.stringify(nextSummary) !== JSON.stringify(normalized.survey.summary);
  const extractedUsefulSurveyData = hasUsefulSurveyData(
    nextSummary,
    desiredSurface ?? normalized.program.desired_total_built_m2,
  );
  const nextSurveyStatus =
    normalized.survey.status === "reviewed" ||
    normalized.survey.status === "confirmed"
      ? normalized.survey.status
      : extractedUsefulSurveyData
        ? "processed_needs_review"
        : normalized.survey.status;

  return {
    ...normalized,
    project: {
      ...normalized.project,
      client_name: clientName,
    },
    site: {
      ...normalized.site,
      address: siteAddress,
    },
    program: {
      ...normalized.program,
      desired_total_built_m2:
        desiredSurface ?? normalized.program.desired_total_built_m2,
      desired_total_built_m2_display:
        desiredSurfaceDisplay || normalized.program.desired_total_built_m2_display,
      initial: {
        ...normalized.program.initial,
        above_areas_lines: appendText(
          normalized.program.initial.above_areas_lines,
          uniqueStrings([
            `Niveles preferidos: ${firstNonPlaceholder(getByColumns(cells, ["AD"]))}`,
          ]),
        ),
      },
    },
    survey: {
      ...normalized.survey,
      status: nextSurveyStatus,
      summary: nextSummary,
    },
    workflow: {
      ...normalized.workflow,
      warnings: uniqueStrings([
        ...normalized.workflow.warnings.filter(
          (warning) => warning !== "survey.status_pending_review",
        ),
        ...(normalized.survey.status === "pending_normalization" &&
        !extractedUsefulSurveyData
          ? ["survey.status_pending_review"]
          : []),
      ]),
    },
  };
}
