import { readPdfItems } from "./pdf-tekst.js";

const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
let werkbladen = [];

const $ = (id) => document.getElementById(id);
const fileList = $("file-list");
const uitkomst = $("uitkomst");
const selVandaag = $("vandaag");
const selDoel = $("doeldag");

function dagLabel(iso) {
  const [j, m, d] = iso.split("-").map(Number);
  return `${DAGEN[new Date(j, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}`;
}

function vandaagIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Afvinken wordt alleen op dit toestel bewaard.
function gedaanKey(doeldag, zaal) { return `zaal-gedaan:${doeldag}:${zaal}`; }
function isGedaan(k) { try { return localStorage.getItem(k) === "1"; } catch (e) { return false; } }
function zetGedaan(k, v) { try { v ? localStorage.setItem(k, "1") : localStorage.removeItem(k); } catch (e) {} }

function addFileLine(name, text, isError) {
  const li = el("li");
  li.append(el("span", "", name), el("span", isError ? "err" : "ok", text));
  fileList.append(li);
}

async function handle(files) {
  for (const file of files) {
    try {
      const found = WerkbladParser.parseWerkbladen(await readPdfItems(file));
      if (!found.length) throw new Error("Geen Bacon-werkblad herkend");
      const ids = new Set(found.map((w) => w.id + "|" + w.datum));
      werkbladen = werkbladen.filter((w) => !ids.has(w.id + "|" + w.datum)).concat(found);
      addFileLine(file.name, `✓ ${found.length} werkblad${found.length === 1 ? "" : "en"}`);
    } catch (e) {
      addFileLine(file.name, "✗ " + (e.message || "kon niet gelezen worden"), true);
    }
  }
  vulDatums();
}

function vulDatums() {
  const datums = ZaalPlanner.datums(ZaalPlanner.boekingen(werkbladen));
  $("kies").hidden = datums.length < 1;
  $("reset").hidden = !fileList.children.length;
  if (!datums.length) {
    uitkomst.replaceChildren();
    return;
  }
  const vorigDoel = selDoel.value;
  const vorigVandaag = selVandaag.value;
  const opties = (sel, waarden) => {
    sel.replaceChildren(...waarden.map((d) => {
      const o = el("option", "", dagLabel(d));
      o.value = d;
      return o;
    }));
  };
  opties(selDoel, datums);
  opties(selVandaag, datums);

  const nu = vandaagIso();
  const doel = datums.includes(vorigDoel) ? vorigDoel : datums.find((d) => d > nu) || datums[datums.length - 1];
  selDoel.value = doel;
  const eerder = datums.filter((d) => d < doel);
  const vandaag = datums.includes(vorigVandaag) && vorigVandaag < doel ? vorigVandaag
    : eerder.includes(nu) ? nu : eerder[eerder.length - 1] || doel;
  selVandaag.value = vandaag;
  render();
}

function boekingTekst(b) {
  return `${b.van}–${b.tot} · ${b.personen} p · ${b.naam}`;
}

function zaalKaart(z, doeldag, tipVoor) {
  const k = gedaanKey(doeldag, z.zaal);
  const kaart = el("div", "zaal" + (isGedaan(k) ? " gedaan" : ""));
  const kop = el("div", "zaal-kop");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = isGedaan(k);
  cb.setAttribute("aria-label", "Gedaan: " + z.zaal);
  cb.addEventListener("change", () => {
    zetGedaan(k, cb.checked);
    kaart.classList.toggle("gedaan", cb.checked);
  });
  const titel = el("label", "zaal-titel");
  titel.append(cb, el("span", "", z.zaal));
  kop.append(titel, el("span", "opst", z.nodig));
  kaart.append(kop);

  const stand = z.huidig ? `Staat nu: ${z.huidig} (${dagLabel(z.huidigDatum)}, ${z.huidigPersonen} p)` : "Staat nu: onbekend — even kijken";
  kaart.append(el("div", "m", stand));
  z.boekingen.forEach((b) => kaart.append(el("div", "m", boekingTekst(b))));
  if (tipVoor) kaart.append(el("div", "tip-ref", "💡 Niet ombouwen als je deze tip volgt: " + tipVoor));
  z.waarschuwingen.forEach((w) => kaart.append(el("div", "warn", "⚠️ " + w)));
  return kaart;
}

function sectie(titel, uitleg, kaarten) {
  if (!kaarten.length) return null;
  const s = el("section", "card sectie");
  s.append(el("h2", "", `${titel} (${kaarten.length})`));
  if (uitleg) s.append(el("p", "note", uitleg));
  kaarten.forEach((k) => s.append(k));
  return s;
}

function tipTekst(t) {
  if (t.soort === "ruil") {
    return {
      titel: `Ruil ${t.van} ⇄ ${t.naar}`,
      regels: [
        `${t.boekingenA.map((b) => b.naam).join(", ")} → ${t.naar}`,
        `${t.boekingenB.map((b) => b.naam).join(", ")} → ${t.van}`,
        "Beide zalen staan dan al goed: 2× ombouwen bespaard.",
      ],
    };
  }
  const regels = [
    `${t.boekingen.map((b) => `${b.naam} (${b.personen} p, ${b.van}–${b.tot})`).join(", ")}`,
    `${t.naar} staat al in ${t.opstelling}: 1× ombouwen bespaard.`,
  ];
  if (t.extraPlekken) regels.push(`Wel ${t.extraPlekken} plekken bijzetten.`);
  return { titel: `Verplaats ${t.van} → ${t.naar}`, regels };
}

function render() {
  const vandaag = selVandaag.value;
  const doeldag = selDoel.value;
  uitkomst.replaceChildren();
  if (!vandaag || !doeldag) return;
  if (vandaag >= doeldag) {
    uitkomst.append(el("section", "card", "Kies bij “Stand na” een dag vóór de dag die je klaarzet."));
    return;
  }

  const r = ZaalPlanner.plan(werkbladen, vandaag, doeldag);

  const samen = el("section", "card samenvatting");
  samen.append(el("h2", "", `Klaarzetten voor ${dagLabel(doeldag)}`));
  const regels = [
    `${r.zalen.length} zalen in gebruik · ${r.zalen.filter((z) => z.status === "goed").length} staan al goed`,
    `${r.ombouwen} ombouwen${r.tips.length ? ` → nog ${r.naTips} met de tips hieronder` : ""}`,
  ];
  if (r.onbekend) regels.push(`${r.onbekend} zaal/zalen met onbekende stand: even kijken`);
  if (r.vrijOpDoeldag.length) regels.push(`Vrij op ${dagLabel(doeldag)}: ${r.vrijOpDoeldag.join(", ")}`);
  regels.forEach((t) => samen.append(el("div", "m", t)));
  uitkomst.append(samen);

  // Tips
  const tipVoor = {};
  if (r.tips.length) {
    const s = el("section", "card sectie");
    s.append(el("h2", "", `💡 Tijd besparen (${r.tips.length})`));
    s.append(el("p", "note", "Verplaatsen moet in Bacon worden aangepast (en op de bewegwijzering). Overleg even met reserveringen."));
    r.tips.forEach((t) => {
      const { titel, regels: lijnen } = tipTekst(t);
      const kaart = el("div", "zaal tip");
      kaart.append(el("div", "zaal-titel", titel));
      lijnen.forEach((l) => kaart.append(el("div", "m", l)));
      if (t.waarschuwing) kaart.append(el("div", "warn", "⚠️ " + t.waarschuwing));
      s.append(kaart);
      tipVoor[t.van] = titel;
      tipVoor[t.naar] = titel;
    });
    uitkomst.append(s);
  }

  const nuZetten = r.zalen.filter((z) => z.status !== "goed" && !z.bezetTot);
  const naVertrek = r.zalen.filter((z) => z.status !== "goed" && z.bezetTot)
    .sort((a, b) => a.bezetTot.localeCompare(b.bezetTot));
  const goed = r.zalen.filter((z) => z.status === "goed");

  const kaarten = (lijst) => lijst.map((z) => zaalKaart(z, doeldag, tipVoor[z.zaal]));
  const naKaarten = naVertrek.map((z) => {
    const k = zaalKaart(z, doeldag, tipVoor[z.zaal]);
    k.querySelector(".zaal-kop").after(el("div", "vanaf", `Vrij vanaf ${z.bezetTot} (${dagLabel(vandaag)})`));
    return k;
  });

  [
    sectie("🟢 Nu al zetten", `Op ${dagLabel(vandaag)} niet in gebruik.`, kaarten(nuZetten)),
    sectie("🟠 Na vertrek ombouwen", `Nog in gebruik op ${dagLabel(vandaag)}; op volgorde van vrijkomen.`, naKaarten),
    sectie("✅ Staat al goed", "Alleen opruimen en controleren.", kaarten(goed)),
  ].filter(Boolean).forEach((s) => uitkomst.append(s));
}

selVandaag.addEventListener("change", render);
selDoel.addEventListener("change", () => {
  const eerder = [...selVandaag.options].map((o) => o.value).filter((d) => d < selDoel.value);
  if (selVandaag.value >= selDoel.value && eerder.length) selVandaag.value = eerder[eerder.length - 1];
  render();
});
$("reset").addEventListener("click", () => {
  werkbladen = [];
  fileList.replaceChildren();
  vulDatums();
});
$("files").addEventListener("change", (e) => {
  handle([...e.target.files]);
  e.target.value = "";
});
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
  e.preventDefault();
  drop.classList.add("over");
}));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  handle([...e.dataTransfer.files]);
});
