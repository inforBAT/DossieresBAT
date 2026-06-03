import "server-only";

function normalizePdfParsingError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error("No se pudo inicializar el extractor PDF del servidor.");
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("cannot find module") ||
    message.includes("not found") ||
    message.includes("worker")
  ) {
    return new Error(
      "El extractor PDF del servidor no se pudo inicializar correctamente. Reinicia el servidor y revisa la instalacion de dependencias PDF.",
    );
  }

  if (message.includes("node")) {
    return new Error(
      "La version actual de Node no es compatible con el extractor PDF configurado.",
    );
  }

  return error;
}

async function extractTextFromPdfData(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
  });

  try {
    const result = await parser.getText();
    return result.text.replace(/\s+\n/g, "\n").trim();
  } finally {
    await parser.destroy();
  }
}
export async function extractTextFromPdfBytes(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  try {
    return await extractTextFromPdfData(data);
  } catch (error) {
    throw normalizePdfParsingError(error);
  }
}
