// Combineert de Bacon-export (lijst) met werkbladen (details) en bouwt het Excel-bestand.
// Gebruikt in de browser (werkblad.html) en in tests (Node).
(function (root) {
  "use strict";

  var STATUSSEN = ["Open", "Klaargezet", "Afgerond"];
  var BRAND = "FF0B6A63";

  function clean(v) {
    return v == null ? "" : String(v).trim();
  }

  // Bacon-export (rijen als arrays, eerste rij = kolomnamen) -> reserveringen.
  function rowsFromExport(aoa) {
    if (!aoa || !aoa.length) return [];
    var head = aoa[0].map(clean);
    function col(name) { return head.indexOf(name); }
    var c = {
      id: col("ID"), locatie: col("Locatie"), relatie: col("Relatie"),
      naam: col("Reserveringsnaam"), datum: col("Datum"), aankomst: col("Aankomst"),
      vertrek: col("Vertrek"), personen: col("Personen"),
      referentie: col("Referentienummer"), status: col("Status"),
    };
    if (c.id === -1) throw new Error("Geen kolom 'ID' gevonden. Is dit een export uit Bacon?");
    return aoa.slice(1)
      .filter(function (r) { return clean(r[c.id]); })
      .map(function (r) {
        function get(i) { return i === -1 ? "" : clean(r[i]); }
        return {
          id: get(c.id), locatie: get(c.locatie), relatie: get(c.relatie),
          naam: get(c.naam), datum: get(c.datum), aankomst: get(c.aankomst),
          vertrek: get(c.vertrek), personen: get(c.personen),
          referentie: get(c.referentie), status: get(c.status),
        };
      });
  }

  function summary(list) {
    return list.map(function (a) {
      var parts = [a.omschrijving];
      if (a.tijd) parts.push("(" + a.tijd + ")");
      if (a.aantal) parts.push("x" + a.aantal);
      var line = parts.join(" ");
      if (a.onderdelen.length) {
        line += ": " + a.onderdelen.map(function (o) { return o.omschrijving; }).join(", ");
      }
      return line;
    }).join("\n");
  }

  // Export-rijen aanvullen met werkbladen (op ID); werkbladen zonder export-rij komen er ook bij.
  function combine(exportRows, werkbladen) {
    var byId = {};
    werkbladen.forEach(function (w) { byId[w.id] = w; });
    var seen = {};
    var out = exportRows.map(function (r) {
      seen[r.id] = true;
      return merge(r, byId[r.id]);
    });
    werkbladen.forEach(function (w) {
      if (!seen[w.id]) out.push(merge(null, w));
    });
    out.sort(function (a, b) {
      return sortKey(a).localeCompare(sortKey(b));
    });
    return out;
  }

  function sortKey(r) {
    var m = /(\d{2})-(\d{2})-(\d{4})/.exec(r.datum) || ["", "99", "99", "9999"];
    return m[3] + m[2] + m[1] + " " + (r.aankomst || "99:99") + " " + r.zaal;
  }

  function merge(r, w) {
    r = r || {};
    w = w || null;
    var zalen = w ? w.zalen : [];
    return {
      id: r.id || (w && w.id) || "",
      datum: r.datum || (w && w.datum) || "",
      aankomst: r.aankomst || (w && w.aanvang) || "",
      vertrek: r.vertrek || (w && w.einde) || "",
      zaal: zalen.map(function (z) { return z.zaal; }).join(", "),
      opstelling: zalen.map(function (z) { return z.opstelling; }).filter(Boolean).join(", "),
      personen: r.personen || (w && w.deelnemers) || "",
      naam: r.naam || (w && w.betreft) || "",
      relatie: r.relatie || (w && w.relatie) || "",
      contactpersoon: w ? w.contactpersoon : "",
      telefoon: w ? w.telefoon : "",
      eventverantwoordelijke: w ? w.eventverantwoordelijke : "",
      arrangement: w ? summary(w.arrangementen.concat(w.producten)) : "",
      notities: w ? w.notities.concat(w.opmerkingen).join("\n") : "",
      referentie: r.referentie || (w && w.referentie) || "",
      status: r.status || (w && w.zalen[0] && w.zalen[0].status) || "",
      locatie: r.locatie || (w && w.locatie) || "",
      heeftWerkblad: !!w,
      catering: w ? w.arrangementen.concat(w.producten) : [],
    };
  }

  var COLUMNS = [
    { header: "Klaar?", key: "klaar", width: 13 },
    { header: "Datum", key: "datum", width: 11 },
    { header: "Aankomst", key: "aankomst", width: 9 },
    { header: "Vertrek", key: "vertrek", width: 9 },
    { header: "Zaal", key: "zaal", width: 12 },
    { header: "Opstelling", key: "opstelling", width: 12 },
    { header: "Pers.", key: "personen", width: 6 },
    { header: "Reservering", key: "naam", width: 34 },
    { header: "Relatie", key: "relatie", width: 26 },
    { header: "Contactpersoon", key: "contactpersoon", width: 18 },
    { header: "Telefoon", key: "telefoon", width: 13 },
    { header: "Eventverantw.", key: "eventverantwoordelijke", width: 15 },
    { header: "Arrangement", key: "arrangement", width: 42 },
    { header: "Notities werkblad", key: "notities", width: 32 },
    { header: "Referentie", key: "referentie", width: 13 },
    { header: "ID", key: "id", width: 9 },
    { header: "Status Bacon", key: "status", width: 12 },
  ];

  function styleHeader(row) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    row.alignment = { vertical: "middle" };
    row.height = 22;
  }

  function addStatusList(ws, last) {
    ws.dataValidations.add("A2:A" + last, {
      type: "list",
      allowBlank: true,
      formulae: ['"' + STATUSSEN.join(",") + '"'],
    });
    for (var i = 2; i <= last; i++) ws.getCell("A" + i).font = { bold: true };
  }

  // Bouwt het werkboek met ExcelJS (meegegeven, zodat dit in browser en Node werkt).
  function buildWorkbook(ExcelJS, rows) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "Bacon-app";

    var ws = wb.addWorksheet("Overzicht", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
    ws.columns = COLUMNS;
    rows.forEach(function (r) {
      var row = ws.addRow(Object.assign({ klaar: "Open" }, r, {
        personen: /^\d+$/.test(r.personen) ? Number(r.personen) : r.personen,
      }));
      row.alignment = { vertical: "top", wrapText: true };
    });
    styleHeader(ws.getRow(1));
    var last = Math.max(rows.length + 1, 2);
    ws.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };

    // Klikbare keuzelijst in kolom A.
    addStatusList(ws, last);

    // Hele regel kleurt mee met de keuze.
    var range = "A2:" + ws.getColumn(COLUMNS.length).letter + last;
    ws.addConditionalFormatting({
      ref: range,
      rules: [
        { type: "expression", formulae: ['$A2="Afgerond"'], priority: 1,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC8E6C9" } } } },
        { type: "expression", formulae: ['$A2="Klaargezet"'], priority: 2,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE9B3" } } } },
      ],
    });

    // Catering: één regel per arrangement/product, gesorteerd op tijd.
    var cs = wb.addWorksheet("Catering", { views: [{ state: "frozen", ySplit: 1 }] });
    cs.columns = [
      { header: "Klaar?", key: "klaar", width: 13 },
      { header: "Datum", key: "datum", width: 11 },
      { header: "Tijd", key: "tijd", width: 8 },
      { header: "Zaal", key: "zaal", width: 12 },
      { header: "Reservering", key: "naam", width: 34 },
      { header: "Omschrijving", key: "omschrijving", width: 40 },
      { header: "Onderdelen", key: "onderdelen", width: 34 },
      { header: "Aantal", key: "aantal", width: 8 },
      { header: "Notities werkblad", key: "notities", width: 32 },
    ];
    var catering = [];
    rows.forEach(function (r) {
      r.catering.forEach(function (a) {
        catering.push({
          klaar: "Open", datum: r.datum, tijd: a.tijd, zaal: r.zaal, naam: r.naam,
          omschrijving: a.omschrijving,
          onderdelen: a.onderdelen.map(function (o) { return o.omschrijving; }).join(", "),
          aantal: /^\d+$/.test(a.aantal) ? Number(a.aantal) : a.aantal,
          notities: r.notities,
        });
      });
    });
    catering.sort(function (a, b) {
      return sortKey({ datum: a.datum, aankomst: a.tijd, zaal: a.zaal })
        .localeCompare(sortKey({ datum: b.datum, aankomst: b.tijd, zaal: b.zaal }));
    });
    catering.forEach(function (c) {
      cs.addRow(c).alignment = { vertical: "top", wrapText: true };
    });
    styleHeader(cs.getRow(1));
    var lastC = Math.max(catering.length + 1, 2);
    addStatusList(cs, lastC);
    cs.addConditionalFormatting({
      ref: "A2:I" + lastC,
      rules: [
        { type: "expression", formulae: ['$A2="Afgerond"'], priority: 1,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC8E6C9" } } } },
        { type: "expression", formulae: ['$A2="Klaargezet"'], priority: 2,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE9B3" } } } },
      ],
    });
    cs.autoFilter = { from: "A1", to: { row: 1, column: 9 } };

    return wb;
  }

  var api = { rowsFromExport: rowsFromExport, combine: combine, buildWorkbook: buildWorkbook };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WerkbladExcel = api;
})(this);
