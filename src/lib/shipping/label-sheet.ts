import { PDFDocument } from "pdf-lib";

/**
 * One PDF with every InPost label of a batch (owner, 2026-11-18: "spedizioni in blocco").
 *
 * - `a6`: each label on its own A6 page, as InPost sends it, for a label printer.
 * - `a4`: four labels per A4 sheet in a 2×2 grid, for a home printer; A6 is exactly a quarter
 *   of A4, so each label keeps its size and is only cut along the middle lines.
 */
export type LabelSheetFormat = "a4" | "a6";

/** A4 in PDF points (1/72 inch). */
const A4 = { width: 595.28, height: 841.89 } as const;

export function labelSheetFormat(value: string | null | undefined): LabelSheetFormat {
  return value === "a6" ? "a6" : "a4";
}

export async function labelSheet(labels: readonly ArrayBuffer[], format: LabelSheetFormat): Promise<Uint8Array> {
  const sheet = await PDFDocument.create();
  sheet.setTitle("Etichette InPost");

  if (format === "a6") {
    for (const label of labels) {
      const source = await PDFDocument.load(label);
      const pages = await sheet.copyPages(source, source.getPageIndices());
      for (const page of pages) sheet.addPage(page);
    }
    return sheet.save();
  }

  const cell = { width: A4.width / 2, height: A4.height / 2 };
  let page = null as ReturnType<typeof sheet.addPage> | null;
  let slot = 0;
  for (const label of labels) {
    const source = await PDFDocument.load(label);
    const embedded = await sheet.embedPdf(source, source.getPageIndices());
    for (const part of embedded) {
      if (!page || slot === 4) {
        page = sheet.addPage([A4.width, A4.height]);
        slot = 0;
      }
      // Slots 0-1 on the top row, 2-3 on the bottom row; PDF y grows upwards.
      const column = slot % 2;
      const row = Math.floor(slot / 2);
      const scale = Math.min(cell.width / part.width, cell.height / part.height, 1);
      const width = part.width * scale;
      const height = part.height * scale;
      page.drawPage(part, {
        x: column * cell.width + (cell.width - width) / 2,
        y: A4.height - (row + 1) * cell.height + (cell.height - height) / 2,
        width,
        height,
      });
      slot += 1;
    }
  }
  return sheet.save();
}
