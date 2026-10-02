// Leest de tekst van Bacon-werkbladen (PDF) uit en zet die om naar reserveringen.
// Werkt puur op tekstposities; gebruikt in de browser (werkblad.html) en in tests (Node).
(function (root) {
  "use strict";

  var HEADER_LABELS = [
    "Betreft", "Contactpersoon", "Telefoon", "Aanvang", "Einde",
    "Eventverantwoordelijke", "Gereserveerd door", "Accountmanager",
    "Deelnemers", "Intern contactpersoon reservering", "Relatie",
  ];
  var SECTIONS = [
    "Zalen", "Arrangementen", "Producten buiten arrangement", "Werkblad",
    "Werkblad Reeks", "Klantpreferenties", "Opmerkingen bij bestellingen",
  ];
  var START = "Werkblad reservering:";

  // items: [{page, x, y, str}] -> regels (op volgorde van boven naar beneden), items per regel op x.
  function toLines(items) {
    var sorted = items
      .filter(function (it) { return it.str && it.str.trim(); })
      .map(function (it) { return { page: it.page, x: it.x, y: it.y, str: it.str.trim() }; })
      .sort(function (a, b) { return a.page - b.page || b.y - a.y || a.x - b.x; });
    var lines = [];
    sorted.forEach(function (it) {
      var last = lines[lines.length - 1];
      if (last && last.page === it.page && Math.abs(last.y - it.y) < 3) {
        last.items.push(it);
      } else {
        lines.push({ page: it.page, y: it.y, items: [it] });
      }
    });
    lines.forEach(function (l) {
      l.items.sort(function (a, b) { return a.x - b.x; });
      l.text = l.items.map(function (i) { return i.str; }).join(" ");
    });
    return lines;
  }

  function isSection(line) {
    return line.items.length === 1 && SECTIONS.indexOf(line.text) !== -1;
  }

  // Kopblok: labels met de waarde op de regel eronder, in de kolom tot het volgende label.
  function parseHeader(lines, res) {
    for (var i = 0; i < lines.length - 1; i++) {
      var line = lines[i];
      var labels = line.items.filter(function (it) { return HEADER_LABELS.indexOf(it.str) !== -1; });
      if (!labels.length || labels.length !== line.items.length) continue;
      var next = lines[i + 1];
      labels.forEach(function (label, k) {
        var end = k + 1 < labels.length ? labels[k + 1].x - 2 : Infinity;
        var value = next.items
          .filter(function (it) { return it.x >= label.x - 2 && it.x < end; })
          .map(function (it) { return it.str; })
          .join(" ");
        if (value && !(label.str in res.velden)) res.velden[label.str] = value;
      });
    }
  }

  // Tabel: kopregel direct na de sectietitel; elk item hoort bij de dichtstbijzijnde kolom.
  function parseTable(lines) {
    if (!lines.length) return [];
    var cols = lines[0].items.map(function (it) { return { x: it.x, name: it.str }; });
    var firstX = cols[0].x;
    var rows = [];
    var started = false;
    lines.slice(1).forEach(function (line) {
      var startsInFirstCol = Math.abs(line.items[0].x - firstX) < 6;
      if (!started && !startsInFirstCol) {
        // Vervolg van de kopregel, bijv. "Prijs per" / "persoon".
        line.items.forEach(function (it) {
          var c = nearest(cols, it.x);
          c.name += " " + it.str;
        });
        return;
      }
      started = true;
      var row = {};
      line.items.forEach(function (it) {
        var c = nearest(cols, it.x);
        row[c.name] = row[c.name] ? row[c.name] + " " + it.str : it.str;
      });
      // Alleen tekst in de eerste kolom (en geen opsommingsteken): afgebroken omschrijving
      // van de vorige regel, bijv. "... inclusief" + "lunchbuffet".
      var keys = Object.keys(row);
      var first = cols[0].name;
      if (rows.length && keys.length === 1 && keys[0] === first && !/^•/.test(row[first])) {
        var prev = rows[rows.length - 1];
        prev[first] = (prev[first] ? prev[first] + " " : "") + row[first];
        return;
      }
      rows.push(row);
    });
    return rows;
  }

  function nearest(cols, x) {
    var best = cols[0];
    cols.forEach(function (c) { if (Math.abs(c.x - x) < Math.abs(best.x - x)) best = c; });
    return best;
  }

  function pick(row, prefix) {
    for (var k in row) if (k.indexOf(prefix) === 0) return row[k];
    return "";
  }

  // "ma 05-10-2026 (09:30)" -> { datum: "05-10-2026", tijd: "09:30" }
  function splitDateTime(value) {
    var m = /(\d{2}-\d{2}-\d{4})\s*\((\d{1,2}:\d{2})\)/.exec(value || "");
    return m ? { datum: m[1], tijd: m[2] } : { datum: "", tijd: "" };
  }

  function parseReservation(lines) {
    var head = lines[0].items;
    var res = {
      id: head[1] ? head[1].str : "",
      locatie: head[2] ? head[2].str : "",
      velden: {},
      zalen: [],
      arrangementen: [],
      producten: [],
      notities: [],
      opmerkingen: [],
      referentie: "",
    };

    // Kopblok loopt tot de eerste sectie.
    var firstSection = lines.findIndex(isSection);
    var headerLines = lines.slice(1, firstSection === -1 ? lines.length : firstSection);
    parseHeader(headerLines, res);
    headerLines.forEach(function (l) {
      if (l.items[0].str === "Referentienummer:" && l.items[1]) res.referentie = l.items[1].str;
    });

    // Secties opdelen.
    var sections = {};
    var current = null;
    lines.slice(firstSection === -1 ? lines.length : firstSection).forEach(function (l) {
      if (isSection(l)) {
        current = l.text;
        sections[current] = [];
      } else if (current) {
        sections[current].push(l);
      }
    });

    res.zalen = parseTable(sections["Zalen"] || []).map(function (r) {
      return {
        status: pick(r, "Status"),
        zaal: pick(r, "Zaal"),
        aankomst: pick(r, "Aankomst"),
        vertrek: pick(r, "Vertrek"),
        opstelling: pick(r, "Opstelling"),
        deelnemers: pick(r, "Deelnemers"),
      };
    });

    function items(rows) {
      var list = [];
      rows.forEach(function (r) {
        var oms = pick(r, "Omschrijving");
        if (/^•/.test(oms) && list.length) {
          list[list.length - 1].onderdelen.push({ omschrijving: oms.replace(/^•\s*/, ""), aantal: pick(r, "Aantal") });
          return;
        }
        var tijd = pick(r, "Tijd");
        // Soms plakt de tijd aan een lange omschrijving vast: "... zonder lunch 14:00".
        var m = /^(.*\S)\s+(\d{1,2}:\d{2})$/.exec(oms);
        if (m && !tijd) {
          oms = m[1];
          tijd = m[2];
        }
        list.push({
          omschrijving: oms,
          tijd: tijd,
          aantal: pick(r, "Aantal"),
          prijsPerStuk: pick(r, "Prijs per"),
          prijs: r["Prijs"] || "",
          onderdelen: [],
        });
      });
      return list;
    }
    res.arrangementen = items(parseTable(sections["Arrangementen"] || []));
    res.producten = items(parseTable(sections["Producten buiten arrangement"] || []));

    // Werkblad-notities (ook van de reeks), zonder regels als "17-09-2026 16:01 - naam@bcn.nl".
    res.notities = (sections["Werkblad"] || []).concat(sections["Werkblad Reeks"] || [])
      .map(function (l) { return l.text; })
      .filter(function (t) { return !/^\d{2}-\d{2}-\d{2,4} \d{1,2}:\d{2} - \S+$/.test(t); });

    // Opmerkingen: tekst in de kolom "Opmerking" loopt vaak over meerdere regels; samenvoegen.
    var opm = sections["Opmerkingen bij bestellingen"] || [];
    var opmCol = opm.length && opm[0].items.filter(function (it) { return it.str === "Opmerking"; })[0];
    if (opmCol) {
      var namen = res.arrangementen.concat(res.producten).map(function (a) { return a.omschrijving; });
      var tekst = opm.slice(1)
        .map(function (l) {
          return l.items.filter(function (it) { return it.x >= opmCol.x - 5; })
            .map(function (it) { return it.str; }).join(" ");
        })
        .filter(Boolean).join(" ");
      // Namen van bestellingen eruit halen; die staan al bij het arrangement.
      namen.sort(function (a, b) { return b.length - a.length; }).forEach(function (n) {
        if (n) tekst = tekst.split(n).join(" ");
      });
      tekst = tekst.replace(/\s+/g, " ").trim();
      if (tekst.length > 3) res.opmerkingen = [tekst];
    }

    var v = res.velden;
    var aanvang = splitDateTime(v["Aanvang"]);
    var einde = splitDateTime(v["Einde"]);
    return {
      id: res.id,
      locatie: res.locatie,
      betreft: v["Betreft"] || "",
      relatie: v["Relatie"] || "",
      contactpersoon: v["Contactpersoon"] || "",
      telefoon: v["Telefoon"] || "",
      datum: aanvang.datum,
      aanvang: aanvang.tijd,
      einddatum: einde.datum,
      einde: einde.tijd,
      deelnemers: v["Deelnemers"] || "",
      eventverantwoordelijke: v["Eventverantwoordelijke"] || "",
      accountmanager: v["Accountmanager"] || "",
      gereserveerdDoor: v["Gereserveerd door"] || "",
      internContact: v["Intern contactpersoon reservering"] || "",
      referentie: res.referentie,
      zalen: res.zalen,
      arrangementen: res.arrangementen,
      producten: res.producten,
      notities: res.notities,
      opmerkingen: res.opmerkingen,
    };
  }

  // Eén PDF kan meerdere werkbladen bevatten; elk begint met "Werkblad reservering:".
  function parseWerkbladen(items) {
    var lines = toLines(items);
    var groups = [];
    lines.forEach(function (l) {
      if (l.items[0].str === START) groups.push([l]);
      else if (groups.length) groups[groups.length - 1].push(l);
    });
    return groups.map(parseReservation);
  }

  var api = { parseWerkbladen: parseWerkbladen };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WerkbladParser = api;
})(this);
