# LACH Protokolu Rīks

Programma spēles protokolu (PDF) augšupielādei tieši [lach.lv](https://lach.lv)
WordPress vietnē: izvēlies PDF failu, tas tiek automātiski sasaistīts ar
īsto spēli, tu pārbaudi priekšskatījumu (rezultāts, spēlētāju statistika,
vārti, sodi) un tad vai nu saglabā, vai atver WP-Admin, lai kaut ko
izlabotu pašrocīgi. Var arī izveidot pilnīgi jaunu spēli, ja tāda
WordPress vēl nemaz nepastāv.

## Instalēšana

1. Iegūsti jaunāko instalatoru (`LACH Protokolu Rīks Setup X.X.X.exe`) — vai nu no šī repozitorija [Releases lapas](https://github.com/kikis118/lach-protocol-tool/releases), vai kā citādi tas tev tika nosūtīts.
2. Palaid to. Tas ir parasts vienkāršs instalators (nav vajadzīgas administratora tiesības) — instalē tikai tavam Windows lietotājam un pievieno saīsni Sākuma izvēlnē.
3. Atver "LACH Protokolu Rīks" no Sākuma izvēlnes.
4. **Tikai pirmajā reizē**: programma prasīs WordPress lietotājvārdu un *Application Password* (nevis tavu parasto pieslēgšanās paroli — tā ir pavisam cita, un katram cilvēkam vajadzīga sava):
   - Ielogojies [lach.lv/wp-admin](https://lach.lv/wp-admin)
   - Ej uz **Users → Profile** (savu profilu, tuvāk lapas apakšai)
   - Sadaļā **Application Passwords** ievadi kādu nosaukumu (piem., "Protokolu rīks") un uzspied **Add New Application Password**
   - Iekopē izveidoto paroli (izskatās kā `xxxx xxxx xxxx xxxx xxxx xxxx`) programmā, kopā ar savu lietotājvārdu
   - Uzspied **Saglabāt** — tas jādara tikai vienu reizi katrā datorā

   Programmā ir arī poga "Kā to atrast? Rādīt soli pa solim", kas parāda vizuālu ceļvedi šim solim.
5. Turpmāk: **Izvēlēties failu** → izvēlies protokola PDF failu → pārbaudi priekšskatījumu → **Saglabāt spēli**.

Nepieciešams tikai parasts interneta pieslēgums līdz lach.lv. Saglabāšana ieraksta datus tiešraidē, uzreiz, īstajā vietnē.

### Atjaunināšana

Galvenajā logā ir poga **"Pārbaudīt atjauninājumus"** — salīdzina tavu versiju ar jaunāko publicēto GitHub un parāda saiti lejupielādei, ja ir kaut kas jauns. Jauns instalators jāpalaiž pašrocīgi (aizvieto veco versiju uz vietas, saglabātie pieslēgšanās dati netiek ietekmēti).

### Atinstalēšana

Izmanto Windows parasto **Settings → Apps** (vai atinstalētāju Sākuma izvēlnes mapē).

## Kā darbojas spēles atrašana

Programma nolasa protokolā uzdrukāto datumu un abu komandu nosaukumus un
salīdzina tos ar lach.lv esošo spēļu sarakstu. Ja atrasta tieši viena
atbilstoša spēle, atveras priekšskatījums; ja atrastas 0 vai vairākas,
parādās saraksts, no kura izvēlēties pareizo pašrocīgi.

## Rediģēšana

Ja protokols nolasīts nepareizi, poga "Rediģēt WP-Admin" atver šīs
spēles rediģēšanas lapu WP-Admin pārlūkprogrammā.

## Jaunas spēles izveide

Ja protokols neatbilst nevienai esošai spēlei, programma piedāvā
"Izveidot jaunu spēli": izvēlies esošu sezonu/turnīru un komandas/vietu
no saraksta (jaunas komandas, vietas, sezonas vai turnīri vienmēr
jāizveido WP-Admin vispirms), un programma izveidos spēli ar visu
statistiku uzreiz.

---

## For developers

### Running from source

```bash
npm install
npm run dev:vite      # terminal 1 - Vite dev server on :5174
npm run dev:electron  # terminal 2 - Electron window loading that dev server
```

### Building the installer

```bash
npm run dist
```

Produces a Windows installer under `release/`.

### Publishing a release

Tag a version and create a GitHub Release with the built `.exe` from
`release/` attached — the "Pārbaudīt atjauninājumus" button reads the
latest release's tag via GitHub's public API. Repo must stay public for
that API call to work without an embedded token.

### WordPress-side pieces (in the main `lach-hockey-app` repo's `wp-snippets/`)

- `game-autofill.php` — read/write an existing game's stats
- `create-finished-game.php` — create a new finished game + its stats
- `protocol-tool-link.php` — adds an "Ielādēt Protokolu" button to the wp-admin bar via a `lachprotocol://` link
