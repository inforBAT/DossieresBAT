async function extractTextFromPdfData(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data,
  } as Parameters<typeof pdfjs.getDocument>[0]).promise;

  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      pages.push(text);
    }
  }

  return pages.join("\n");
}

export async function extractTextFromPdfFile(file: File): Promise<string> {
  return extractTextFromPdfData(await file.arrayBuffer());
}

export async function extractTextFromPdfBytes(
  data: ArrayBuffer | Uint8Array,
): Promise<string> {
  return extractTextFromPdfData(data);
}
