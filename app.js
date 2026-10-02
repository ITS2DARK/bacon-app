(function () {
  "use strict";

  var STORAGE_KEY = "bacon-url";
  var config = window.BACON_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var timer = null;

  var views = {
    redirect: document.getElementById("view-redirect"),
    home: document.getElementById("view-home"),
    setup: document.getElementById("view-setup"),
  };

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  }

  function storageGet() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch (e) { return ""; }
  }

  function storageSet(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* privémodus: alleen deze sessie */ }
  }

  // Geeft een nette https-URL terug, of null als de invoer geen geldige link is.
  function normalize(input) {
    var value = (input || "").trim();
    if (!value) return null;
    if (!/^[a-z]+:\/\//i.test(value)) value = "https://" + value;
    try {
      var url = new URL(value);
      if (url.protocol !== "https:") return null;
      return url.href;
    } catch (e) {
      return null;
    }
  }

  // Een link uit config.js gaat voor; anders de link die de gebruiker zelf instelde.
  function baconUrl() {
    return normalize(config.BACON_URL) || normalize(storageGet());
  }

  function go(url) {
    clearTimeout(timer);
    // replace(): de terugknop brengt je niet steeds terug naar deze tussenpagina.
    location.replace(url);
  }

  function startRedirect(url) {
    document.getElementById("open-now").href = url;
    show("redirect");
    var delay = Number(config.REDIRECT_DELAY_MS);
    timer = setTimeout(function () { go(url); }, isFinite(delay) && delay >= 0 ? delay : 1200);
  }

  function showHome(url) {
    clearTimeout(timer);
    document.getElementById("open-home").href = url;
    show("home");
  }

  function showSetup() {
    clearTimeout(timer);
    var input = document.getElementById("bacon-url");
    input.value = baconUrl() || "";
    document.getElementById("setup-error").textContent = "";
    document.getElementById("setup-back").hidden = !baconUrl();
    show("setup");
    input.focus();
  }

  // Een link via ?bacon=... (handig om de app aan collega's te sturen).
  var shared = normalize(params.get("bacon"));
  if (shared) {
    storageSet(shared);
    history.replaceState(null, "", location.pathname);
  }

  document.getElementById("open-now").addEventListener("click", function (e) {
    e.preventDefault();
    go(baconUrl());
  });
  document.getElementById("open-home").addEventListener("click", function (e) {
    e.preventDefault();
    go(baconUrl());
  });
  document.getElementById("cancel").addEventListener("click", function () { showHome(baconUrl()); });
  document.getElementById("to-setup").addEventListener("click", showSetup);
  document.getElementById("setup-back").addEventListener("click", function () { showHome(baconUrl()); });

  document.getElementById("setup-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var url = normalize(document.getElementById("bacon-url").value);
    var error = document.getElementById("setup-error");
    if (!url) {
      error.textContent = "Dit is geen geldige https-link. Kopieer de volledige link uit de adresbalk.";
      return;
    }
    storageSet(url);
    go(normalize(config.BACON_URL) || url);
  });

  if (normalize(config.BACON_URL)) {
    document.getElementById("to-setup").hidden = true;
    document.getElementById("cancel").hidden = true;
  }

  var url = baconUrl();
  if (params.has("setup") || !url) {
    showSetup();
  } else {
    startRedirect(url);
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
