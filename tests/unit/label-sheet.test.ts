import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { labelSheet, labelSheetFormat } from "@/lib/shipping/label-sheet";

/** A6 in PDF points: what InPost sends for each label. */
const A6 = [297.64, 419.53] as const;

async function fakeLabel(pages = 1): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  // A real label always draws something; a page without contents cannot be embedded.
  for (let index = 0; index < pages; index += 1) pdf.addPage([...A6]).drawRectangle({ x: 10, y: 10, width: 100, height: 60 });
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("labelSheet", () => {
  it("keeps one A6 page per label for a label printer", async () => {
    const sheet = await PDFDocument.load(await labelSheet([await fakeLabel(), await fakeLabel(), await fakeLabel()], "a6"));
    expect(sheet.getPageCount()).toBe(3);
    expect(sheet.getPage(0).getWidth()).toBeCloseTo(A6[0], 1);
  });

  it("puts four labels on each A4 sheet, a fifth on a new one", async () => {
    const labels = await Promise.all(Array.from({ length: 5 }, () => fakeLabel()));
    const sheet = await PDFDocument.load(await labelSheet(labels, "a4"));
    expect(sheet.getPageCount()).toBe(2);
    expect(sheet.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    expect(sheet.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
  });

  it("counts every page of a label that InPost sends in more than one page", async () => {
    const sheet = await PDFDocument.load(await labelSheet([await fakeLabel(2), await fakeLabel(3)], "a6"));
    expect(sheet.getPageCount()).toBe(5);
  });

  it("prints on A4 unless A6 is asked", () => {
    expect(labelSheetFormat("a6")).toBe("a6");
    expect(labelSheetFormat("a4")).toBe("a4");
    expect(labelSheetFormat(null)).toBe("a4");
    expect(labelSheetFormat("zpl")).toBe("a4");
  });
});
