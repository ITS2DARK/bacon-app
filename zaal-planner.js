// Zaalplanner: bepaalt per zaal of de opstelling voor een doeldag al goed staat,
// wanneer hij omgebouwd kan worden, en welke verplaatsingen ombouwwerk besparen.
// Gebruikt in de browser (zalen.html) en in tests (Node).
(function (root) {
  "use strict";

  // "ma 26-10 (09:00)" + jaar uit het werkblad -> { datum: "2026-10-26", tijd: "09:00" }
  function parseMoment(text, refDatum) {
    var m = /(\d{2})-(\d{2})(?:-(\d{4}))?\s*\((\d{1,2}:\d{2})\)/.exec(text || "");
    if (!m) return null;
    var ref = /(\d{2})-(\d{2})-(\d{4})/.exec(refDatum || "");
    var jaar = m[3] ? Number(m[3]) : ref ? Number(ref[3]) : new Date().getFullYear();
    // Jaarwisseling: werkblad in december, zaal in januari (of andersom).
    if (!m[3] && ref) {
      var diff = Number(m[2]) - Number(ref[2]);
      if (diff < -6) jaar += 1;
      if (diff > 6) jaar -= 1;
    }
    var tijd = m[4].length === 4 ? "0" + m[4] : m[4];
    return { datum: jaar + "-" + m[2] + "-" + m[1], tijd: tijd };
  }

  function norm(opstelling) {
    return (opstelling || "").trim().toLowerCase().replace(/[\s-]+/g, "-");
  }

  // "4.10 (C12)" -> { verdieping: "4", grootte: 12 }
  function zaalInfo(zaal) {
    var m = /^(\d+)\.\d+.*\(([A-Z])(\d+)\)/.exec(zaal || "");
    return m ? { verdieping: m[1], klasse: m[2], grootte: Number(m[3]) } : { verdieping: "", klasse: "", grootte: 0 };
  }

  // Werkbladen -> losse zaalboekingen. Regels zonder opstelling (bijv. "Esri lunch") tellen niet mee.
  function boekingen(werkbladen) {
    var out = [];
    var seen = {};
    werkbladen.forEach(function (w) {
      w.zalen.forEach(function (z) {
        if (!z.zaal || !z.opstelling) return;
        var van = parseMoment(z.aankomst, w.datum);
        var tot = parseMoment(z.vertrek, w.datum);
        if (!van) return;
        var key = [w.id, z.zaal, van.datum, van.tijd].join("|");
        if (seen[key]) return;
        seen[key] = true;
        out.push({
          id: w.id,
          naam: w.betreft,
          zaal: z.zaal,
          datum: van.datum,
          van: van.tijd,
          tot: tot ? tot.tijd : "",
          opstelling: z.opstelling,
          personen: Number(z.deelnemers) || 0,
          notities: w.notities,
        });
      });
    });
    out.sort(function (a, b) {
      return (a.datum + a.van + a.zaal).localeCompare(b.datum + b.van + b.zaal);
    });
    return out;
  }

  function datums(lijst) {
    var d = {};
    lijst.forEach(function (b) { d[b.datum] = true; });
    return Object.keys(d).sort();
  }

  // Huidige stand per zaal na "vandaag": laatste boeking op of vóór vandaag.
  function stand(lijst, vandaag) {
    var s = {};
    lijst.forEach(function (b) {
      if (b.datum > vandaag) return;
      var cur = s[b.zaal];
      if (!cur || (b.datum + b.tot) >= (cur.datum + cur.tot)) s[b.zaal] = b;
    });
    return s;
  }

  function past(personen, vanZaal, naarZaal) {
    var a = zaalInfo(vanZaal);
    var b = zaalInfo(naarZaal);
    return b.grootte >= a.grootte || personen <= b.grootte;
  }

  function plan(werkbladen, vandaag, doeldag) {
    var lijst = boekingen(werkbladen);
    var nu = stand(lijst, vandaag);
    var vandaagBezet = {};
    lijst.forEach(function (b) {
      if (b.datum !== vandaag) return;
      if (!vandaagBezet[b.zaal] || b.tot > vandaagBezet[b.zaal]) vandaagBezet[b.zaal] = b.tot;
    });

    // Doeldag per zaal.
    var doel = {};
    lijst.forEach(function (b) {
      if (b.datum !== doeldag) return;
      (doel[b.zaal] = doel[b.zaal] || []).push(b);
    });
    var zalenDoel = Object.keys(doel).sort();
    var meerdereZalen = {};
    zalenDoel.forEach(function (z) {
      doel[z].forEach(function (b) { meerdereZalen[b.id] = (meerdereZalen[b.id] || 0) + 1; });
    });

    function nodig(z) {
      var set = {};
      doel[z].forEach(function (b) { set[norm(b.opstelling)] = b.opstelling; });
      var keys = Object.keys(set);
      return keys.length === 1 ? { key: keys[0], label: set[keys[0]] } : null;
    }

    var zalen = zalenDoel.map(function (z) {
      var n = nodig(z);
      var huidig = nu[z] || null;
      var max = Math.max.apply(null, doel[z].map(function (b) { return b.personen; }));
      var item = {
        zaal: z,
        boekingen: doel[z],
        nodig: n ? n.label : doel[z].map(function (b) { return b.opstelling; }).join(" → "),
        nodigKey: n ? n.key : null,
        personen: max,
        huidig: huidig ? huidig.opstelling : "",
        huidigDatum: huidig ? huidig.datum : "",
        huidigPersonen: huidig ? huidig.personen : 0,
        bezetTot: vandaagBezet[z] || "",
        waarschuwingen: [],
      };
      if (!n) item.waarschuwingen.push("Wisselt van opstelling op de dag zelf");
      if (huidig && n && norm(huidig.opstelling) === n.key && max > huidig.personen) {
        item.waarschuwingen.push("Plekken bijzetten: " + huidig.personen + " → " + max);
      }
      doel[z].forEach(function (b) {
        b.notities.forEach(function (t) {
          if (/per tafel|stekkerblok|laptop|banner|whiteboard|statafel|materiaal/i.test(t)) item.waarschuwingen.push(t);
        });
      });
      item.status = !huidig ? "onbekend"
        : n && norm(huidig.opstelling) === n.key ? "goed"
        : "ombouwen";
      return item;
    });

    // Verplaatsingen zoeken.
    var huidigKey = {};
    Object.keys(nu).forEach(function (z) { huidigKey[z] = norm(nu[z].opstelling); });
    var vrij = {}; // zalen zonder boeking op de doeldag, met bekende stand
    Object.keys(nu).forEach(function (z) { if (!doel[z]) vrij[z] = true; });

    var tips = [];
    var opgelost = {};
    function zoekZaal(item) { return zalen.filter(function (x) { return x.zaal === item; })[0]; }
    function moetOm(x) { return x.status === "ombouwen" && x.nodigKey && !opgelost[x.zaal]; }

    var veranderd = true;
    while (veranderd) {
      veranderd = false;

      // 1. Naar een vrije zaal die al goed staat (kan een keten vormen).
      zalen.filter(moetOm).forEach(function (x) {
        if (opgelost[x.zaal]) return;
        var kandidaten = Object.keys(vrij).filter(function (c) {
          return vrij[c] && huidigKey[c] === x.nodigKey && past(x.personen, x.zaal, c);
        });
        if (!kandidaten.length) return;
        var a = zaalInfo(x.zaal);
        kandidaten.sort(function (c1, c2) {
          var i1 = zaalInfo(c1), i2 = zaalInfo(c2);
          return (i1.verdieping !== a.verdieping) - (i2.verdieping !== a.verdieping) ||
            Math.abs(i1.grootte - a.grootte) - Math.abs(i2.grootte - a.grootte) || c1.localeCompare(c2);
        });
        var c = kandidaten[0];
        var extra = nu[c].personen && x.personen > nu[c].personen ? x.personen - nu[c].personen : 0;
        tips.push({
          soort: "verplaats",
          van: x.zaal,
          naar: c,
          boekingen: x.boekingen,
          opstelling: x.nodig,
          bespaart: 1,
          extraPlekken: extra,
          waarschuwing: x.boekingen.some(function (b) { return meerdereZalen[b.id] > 1; })
            ? "Hoort bij een reservering met meerdere zalen" : "",
        });
        opgelost[x.zaal] = true;
        delete vrij[c];
        vrij[x.zaal] = true; // oude zaal komt vrij, in zijn huidige opstelling
        veranderd = true;
      });
      if (veranderd) continue;

      // 2. Twee zalen die precies andersom staan: ruilen (liefst op dezelfde verdieping).
      var open = zalen.filter(moetOm);
      var paren = [];
      for (var i = 0; i < open.length; i++) {
        for (var j = i + 1; j < open.length; j++) {
          var p = open[i], q = open[j];
          if (huidigKey[p.zaal] === q.nodigKey && huidigKey[q.zaal] === p.nodigKey &&
              past(p.personen, p.zaal, q.zaal) && past(q.personen, q.zaal, p.zaal)) {
            var ip = zaalInfo(p.zaal), iq = zaalInfo(q.zaal);
            paren.push({ p: p, q: q, score: (ip.verdieping === iq.verdieping ? 0 : 100) + Math.abs(ip.grootte - iq.grootte) });
          }
        }
      }
      paren.sort(function (a, b) { return a.score - b.score; });
      if (paren.length) {
        var pq = paren[0];
        var w = pq.p.boekingen.concat(pq.q.boekingen).some(function (b) { return meerdereZalen[b.id] > 1; });
        tips.push({
          soort: "ruil",
          van: pq.p.zaal,
          naar: pq.q.zaal,
          boekingenA: pq.p.boekingen,
          boekingenB: pq.q.boekingen,
          bespaart: 2,
          waarschuwing: w ? "Hoort bij een reservering met meerdere zalen" : "",
        });
        opgelost[pq.p.zaal] = opgelost[pq.q.zaal] = true;
        veranderd = true;
      }
    }

    // Kleinere zaal bij een ruil of verplaatsing: let op de ruimte.
    tips.forEach(function (t) {
      var naar = zaalInfo(t.naar);
      var van = zaalInfo(t.van);
      if (t.soort === "verplaats" && naar.grootte < van.grootte) {
        t.waarschuwing = (t.waarschuwing ? t.waarschuwing + ". " : "") + "Kleinere zaal: controleer of het past";
      }
      if (t.soort === "ruil") {
        var maxA = Math.max.apply(null, t.boekingenA.map(function (b) { return b.personen; }));
        var maxB = Math.max.apply(null, t.boekingenB.map(function (b) { return b.personen; }));
        if (maxA >= naar.grootte - 1 || maxB >= van.grootte - 1) {
          t.waarschuwing = (t.waarschuwing ? t.waarschuwing + ". " : "") + "Krap: controleer of het past";
        }
      }
    });

    var ombouwen = zalen.filter(function (x) { return x.status === "ombouwen"; }).length;
    var onbekend = zalen.filter(function (x) { return x.status === "onbekend"; }).length;
    var bespaard = tips.reduce(function (s, t) { return s + t.bespaart; }, 0);
    return {
      vandaag: vandaag,
      doeldag: doeldag,
      zalen: zalen,
      vrijOpDoeldag: Object.keys(nu).filter(function (z) { return !doel[z]; }).sort(),
      tips: tips,
      ombouwen: ombouwen,
      onbekend: onbekend,
      naTips: ombouwen - bespaard,
      opgelost: opgelost,
    };
  }

  var api = { boekingen: boekingen, datums: datums, plan: plan, zaalInfo: zaalInfo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ZaalPlanner = api;
})(this);
