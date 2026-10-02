import * as pdfjs from "./vendor/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;

const state = { exportRows: [], werkbladen: [] };
const fileList = document.getElementById("file-list");
const preview = document.getElementById("preview");
const download = document.getElementById("download");
const reset = document.getElementById("reset");
const drop = document.getElementById("drop");
const input = document.getElementById("files");

async function readPdf(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    content.items.forEach((it) => items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str }));
  }
  const found = WerkbladParser.parseWerkbladen(items);
  if (!found.length) throw new Error("Geen Bacon-werkblad herkend");
  return found;
}

async function readExport(file) {
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()));
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  return WerkbladExcel.rowsFromExport(aoa);
}

function addFileLine(name, text, isError) {
  const li = document.createElement("li");
  const n = document.createElement("span");
  n.textContent = name;
  const t = document.createElement("span");
  t.textContent = text;
  t.className = isError ? "err" : "ok";
  li.append(n, t);
  fileList.append(li);
}

async function handle(files) {
  for (const file of files) {
    try {
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        const found = await readPdf(file);
        // Nieuwere versie van hetzelfde werkblad vervangt de oude.
        const ids = new Set(found.map((w) => w.id));
        state.werkbladen = state.werkbladen.filter((w) => !ids.has(w.id)).concat(found);
        addFileLine(file.name, `✓ ${found.length} werkblad${found.length === 1 ? "" : "en"}`);
      } else {
        const rows = await readExport(file);
        const ids = new Set(rows.map((r) => r.id));
        state.exportRows = state.exportRows.filter((r) => !ids.has(r.id)).concat(rows);
        addFileLine(file.name, `✓ ${rows.length} reserveringen`);
      }
    } catch (e) {
      addFileLine(file.name, "✗ " + (e.message || "kon niet gelezen worden"), true);
    }
  }
  render();
}

function combined() {
  return WerkbladExcel.combine(state.exportRows, state.werkbladen);
}

function render() {
  const rows = combined();
  download.disabled = !rows.length;
  reset.hidden = !rows.length && !fileList.children.length;
  preview.replaceChildren();
  rows.forEach((r) => {
    const div = document.createElement("div");
    div.className = "res";
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = `${r.aankomst || "--:--"}–${r.vertrek || "--:--"}  ${r.naam}`;
    if (r.heeftWerkblad) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "werkblad";
      t.append(tag);
    }
    const m = document.createElement("div");
    m.className = "m";
    m.textContent = [r.datum, r.zaal && `zaal ${r.zaal}`, r.personen && `${r.personen} pers.`, r.relatie]
      .filter(Boolean).join(" · ");
    div.append(t, m);
    preview.append(div);
  });
}

download.addEventListener("click", async () => {
  const rows = combined();
  const wb = WerkbladExcel.buildWorkbook(ExcelJS, rows);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const dates = [...new Set(rows.map((r) => r.datum).filter(Boolean))];
  const name = `Bacon ${dates.length === 1 ? dates[0] : "overzicht"}.xlsx`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

reset.addEventListener("click", () => {
  state.exportRows = [];
  state.werkbladen = [];
  fileList.replaceChildren();
  render();
});

input.addEventListener("change", () => {
  handle([...input.files]);
  input.value = "";
});
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
  e.preventDefault();
  drop.classList.add("over");
}));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  handle([...e.dataTransfer.files]);
});
