# Bacon-app (SharePoint → Bacon)

Een kleine app die je op je telefoon of computer installeert. Tik op het icoon,
log in met je werkaccount (Microsoft/SharePoint) en je komt direct in **Bacon**,
het FMIS-reserveringssysteem in SharePoint.

## Hoe werkt het?

1. De app opent de link naar Bacon in SharePoint.
2. Ben je nog niet ingelogd, dan toont Microsoft het normale werk-inlogscherm
   (inclusief MFA/Authenticator). Kies **"Aangemeld blijven"**, dan hoeft dit
   daarna bijna nooit meer.
3. Na het inloggen stuurt SharePoint je automatisch door naar Bacon.

De app slaat **geen wachtwoorden** op en heeft geen toegang tot je account; het
inloggen gebeurt volledig door Microsoft. Alleen de Bacon-link wordt lokaal op
je toestel bewaard.

## Bestanden

| Bestand | Wat |
| --- | --- |
| `index.html` | De app (start-, doorstuur- en instelscherm) |
| `app.js` | Logica: link bewaren, doorsturen |
| `config.js` | Hier kun je de Bacon-link vast invullen voor iedereen |
| `manifest.webmanifest`, `sw.js`, `icons/` | Maken de app installeerbaar |

## Instellen

De Bacon-link (`https://bcn.opleidingsgroep.nl/`) staat al vast in `config.js`,
dus de app werkt direct zonder instellen. Wil je dat iedereen zelf een link
invult, zet `BACON_URL` dan op `""`.

**Optie A – iedereen vult zelf de link in.** Bij de eerste start
vraagt de app om de link. Open Bacon in je browser, kopieer de adresbalk en
plak die in de app.

**Optie B – link vast inbouwen.** Zet de link in `config.js`:

```js
BACON_URL: "https://bcn.opleidingsgroep.nl/",
```

Collega's hoeven dan niets in te stellen.

**Optie C – link meesturen.** Stuur collega's de app-link met de Bacon-link erachter:

```
https://<waar-de-app-staat>/?bacon=https%3A%2F%2Fjouwbedrijf.sharepoint.com%2Fsites%2F...
```

Link wijzigen kan altijd via **Instellingen** tijdens het doorsturen, of door de
app te openen met `?setup` achter de link.

## Online zetten (hosting)

De app staat via GitHub Pages online op:

**https://its2dark.github.io/bacon-app/**

Het is een statische website, dus elke andere https-hosting werkt ook.

Https is nodig om de app te kunnen installeren.

## Installeren op je telefoon

- **iPhone (Safari):** open de app-link → deelknop → *Zet op beginscherm*.
- **Android (Chrome):** open de app-link → menu (⋮) → *App installeren* /
  *Toevoegen aan startscherm*.
- **Windows/Mac (Edge/Chrome):** installatie-icoon rechts in de adresbalk.

## Lokaal testen

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
