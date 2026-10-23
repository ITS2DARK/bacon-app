// Leest alle tekst met posities uit een PDF (lokaal in de browser, met pdf.js).
import * as pdfjs from "./vendor/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;

export async function readPdfItems(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    content.items.forEach((it) => items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str }));
  }
  return items;
}
