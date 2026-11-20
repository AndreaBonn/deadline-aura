# 006 - Modalità di sfondo del desktop: piano

Stato: proposto, 2026-11-20. Requisiti in `spec.md`, scomposizione in `tasks.md`.

## Obiettivo

L'utente sceglie nelle Impostazioni fra sfondi dinamici, solo gradiente e immagine propria; la scelta si vede sul desktop appena salvata, sopravvive al riavvio, e le config già esistenti si caricano senza perdere la preferenza espressa col vecchio toggle.

## Baseline (commit `fa2b206`, misurata dal planner)

- `core/wallpaper-renderer.js` 216 righe, `core/wallpaper-changer.js` 283, `renderer/settings-tab-display.js` 278, `config/loader.js` 61, `core/ipc/config-applier.js` 46.
- `use_backgrounds` letto solo da `renderer/settings-tab-display.js:56` e dal test `test/renderer/settings-tab-display.test.js:84`; `show_text` idem (fuori scope).
- Lo schema zod usa `z.object` senza `.strict()`: una chiave sconosciuta viene scartata, non rifiutata. Le config salvate con `use_backgrounds` continuano quindi a validare anche dopo la rimozione della chiave; serve solo leggerla prima del merge per migrarla.
- `config/loader.js` fa `deepMerge(DEFAULTS, userConfig)`: la migrazione deve girare sul `userConfig` **prima** del merge, altrimenti il default `dynamic` copre l'assenza della chiave.
- Nessun `dialog.showOpenDialog` nel progetto. `SettingsWindow` (`main-process/settings-window.js`) non espone la finestra: serve un getter per usarla come parent del dialog.
- La CSP di `renderer/settings.html` è `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`: niente `img-src data:`.
- `coverage.include` copre già `renderer/settings*.js` e `core/**`; il blocco dimensionale di `eslint.config.js` è un elenco di file, i file nuovi vanno aggiunti a mano.
- `cleanupOldWallpapers` rimuove solo file che iniziano con `wallpaper-`.

## Definition of Done

- [ ] Con `background_mode: 'gradient'` il wallpaper scritto è il solo gradiente della palette e `loadImage` non viene chiamato per lo sfondo.
- [ ] Con `background_mode: 'custom'` e una copia valida, il pixel al centro di ogni regione è quello dell'immagine scurito del 15%, identico con score 0 e score 1; agenda, banda AI e post-it compaiono sopra.
- [ ] Con `custom` e copia assente o corrotta, il wallpaper è quello di `dynamic` e la console mostra `[wallpaper] custom background unavailable (<motivo>), falling back to dynamic`.
- [ ] Given una config su disco `{ "wallpaper": { "use_backgrounds": false, ... } }`, When l'app la carica, Then `config.wallpaper.background_mode === 'gradient'` e le altre sezioni sono quelle del file (non i default).
- [ ] Given il dialog restituisce `/home/u/Foto/mare.JPG` da 3 MB, When l'utente conferma, Then esiste `~/.local/share/deadlineaura/custom-background.jpg`, la config salvata ha `custom_background: 'custom-background.jpg'`, il wallpaper si ridisegna subito. Con un file da 25 MB + 1 byte: errore `TOO_LARGE`, nessun file copiato, config invariata.
- [ ] Salvare le Impostazioni provoca un ridisegno forzato (R9).
- [ ] Un `custom_background: '../../etc/passwd'` scritto a mano nel file di config si carica come `null` senza resettare il resto.
- [ ] `npm test`, `npm run lint`, `npm run format:check`, `npm run test:coverage` verdi; test di contratto IPC e di pagina verdi.
- [ ] Click-through manuale (T010) con l'esito di ogni controllo; `npx asar list` del `.deb` contiene i file nuovi.

```
SIGNAL: n/a, perché è un'app desktop locale senza telemetria né ambiente di rilascio osservabile da remoto. Diagnostica locale (prodotta da T003): la riga `[wallpaper] custom background unavailable (<motivo>), falling back to dynamic` sulla console del main, attesa 0 volte con un'immagine valida e 1 per render quando manca.
```

## Assunzioni

- Node 20-23 ed Electron della versione in `package.json`. Premessa smentita in T006: il node-canvas `^3.2.3` installato NON decodifica WebP (misurato), quindi WebP è escluso (risposta Q1 A). T006 lo verifica con una fixture `.webp` reale; se fallisce, la premessa di D7 cade e si torna al piano (togliere webp o decodificarlo diversamente), non si aggira.
- La scelta dell'immagine è un'azione committata come l'autorizzazione Google: il canale di pick copia il file **e** salva subito `custom_background` (via `applySettings`, che forza il ridisegno). Il cambio di modalità passa invece dal normale Salva. Il renderer rispecchia il nome restituito nel proprio oggetto config, così un Salva successivo non lo sovrascrive con il valore vecchio. Alternativa scartata: copiare al pick e salvare solo al Salva; se l'utente chiude senza salvare, la copia con estensione diversa è già stata rimossa e la config punta a un file che non c'è.
- Selezionare `custom` senza immagine e salvare è permesso: il render ricade su `dynamic` (D5) e le Impostazioni dicono "nessuna immagine scelta". Nessun `refine` sullo schema, perché una config rifiutata dal loader ricade per intero sui default.
- Il velo neutro è nero: `rgba(0, 0, 0, CUSTOM_VEIL_ALPHA)` con `CUSTOM_VEIL_ALPHA = 0.15`.
- In modalità `custom` il ridisegno resta guidato anche dal cambio di tinta (`decideRerender` invariato). Lo sfondo non cambia, ma l'agenda del giorno mostra solo eventi futuri e oggi si aggiorna proprio su quei ridisegni: toglierli lascerebbe l'agenda vecchia. In `gradient` la tinta serve comunque. Nessuna ottimizzazione senza misura (`performance.md`).
- Il warning di fallback si ripete a ogni render in fallback (pochi all'ora: cambio tinta, banda AI ogni 15 minuti). Nessuna deduplicazione finché non risulta un problema.
- Downgrade a 1.8.0 dopo 006: il vecchio schema richiede `use_backgrounds`, ma il merge con i vecchi default lo rimette a `true`, quindi la config valida. Si perde solo una preferenza `gradient`. Accettato.

## Domande aperte (non bloccanti, default dichiarato)

- **Q1, immagini molto grandi in pixel.** 25 MB di JPEG possono essere 100+ megapixel, cioè oltre 400 MB di RGBA decodificati a ogni render, dentro il processo main. Opzioni:
  - A. Rifiutare all'importazione oltre `MAX_CUSTOM_BACKGROUND_PIXELS` (proposta 40 MP, errore `TOO_MANY_PIXELS`). **Default**: una costante e un controllo sulle dimensioni già lette per validare il file.
  - B. Nessun limite oltre i 25 MB di D7.
  - C. Ridimensionare alla copia alla risoluzione del desktop: modifica D3 ("copiata"), aggiunge una ricodifica.
- **Q2, anteprima.** Default: nome della copia e dimensioni in pixel. La miniatura richiede `img-src 'self' data:` nella CSP delle Impostazioni: allargamento piccolo ma da decidere, quindi fuori scope.

## Rilievi del security-reviewer (integrati)

- **P1, limite sui pixel prima della decodifica.** In node-canvas le dimensioni esistono solo dopo `loadImage`, che alloca già l'intero RGBA: un PNG o WebP sotto i 25 MB può dichiarare gigapixel e mandare in OOM il processo main. Larghezza, altezza e formato si leggono dall'header (senza decodificare) e il rifiuto `TOO_MANY_PIXELS` avviene prima di `loadImage`, sia all'import sia a ogni render e in `describeCustomBackground`. Fixture reale con header gigante, mai decodificata.
- **P2, formato dal contenuto, non dall'estensione.** Allowlist dei magic bytes (PNG, JPEG, WebP) coerente con l'estensione, prima di `loadImage`: un GIF o SVG rinominato `.png` va in `UNREADABLE`.
- **P2, validazione sulla copia, non sul sorgente.** Ordine: copia su `.tmp`, poi `stat`, header e `loadImage` sul `.tmp`, infine `rename`; su errore `unlink` del `.tmp`. Un `.tmp` orfano di un crash si rimuove all'inizio dell'import.
- **Note di hardening:** rimozione delle copie solo per nomi esatti di `CUSTOM_BACKGROUND_FILES` (mai glob o `readdir` con prefisso); `.jpeg` mappato su `.jpg`; copia scritta con modo `0o600`; `lstat` che rifiuta un symlink prima del render; gli errori IPC restituiscono solo il codice, mai `err.message` (contiene path assoluti).
- Conformi: canale `pick-background` senza payload, nome in enum risolto dentro DATA_DIR, `contextIsolation`/`nodeIntegration` già corretti, CSP invariata.

## Approccio

Disambiguazione dell'approccio di caricamento (titoli, poi valutazione):

- A. Il main risolve il path dal nome salvato in config (enum ristretto) dentro la cartella dati.
- B. La config salva il path assoluto della copia e il main lo legge.
- C. Nessun riferimento in config: il main cerca `custom-background.*` nella cartella dati.

A è la scelta: rispetta D3 (riferimento in config) e rende impossibile per costruzione che un valore inviato da `settings:save-config` punti fuori dalla cartella dati. B lascia al renderer la possibilità di scrivere in config un path qualsiasi che il main poi apre. C viola D3 e rende ambiguo quale file vale se ne restano due.

Flusso:

1. `core/update-cycle.js` legge `getConfig().wallpaper` e passa a `wallpaperChanger.update` un `background: { mode, customFile }`.
2. `core/wallpaper-changer.js` risolve `customPath = path.join(DATA_DIR, customFile)` (solo se `customFile` è un nome ammesso) e inoltra `background: { mode, customPath }` a `render`.
3. `core/wallpaper-background.js` (nuovo) decide cosa disegnare: `planBackground({ mode, customPath, score })` puro, `loadBackground(plan, { loadImage, log })` con il fallback D5. Restituisce `{ image, veil: 'tint' | 'neutral' | 'none' }`.
4. `core/wallpaper-renderer.js` usa quel risultato in `drawRegion`: `tint` -> `drawTintOverlay` di oggi; `neutral` -> velo nero costante; senza immagine -> `drawFallbackGradient`. L'immagine si carica una volta e si disegna su ogni regione (D6).
5. `core/custom-background.js` (nuovo) importa e descrive la copia: validazione (estensione, dimensione, decodifica, pixel), copia atomica (`.tmp` + `rename`), rimozione delle copie con altra estensione, `describeCustomBackground(file)` per lo stato.
6. `core/ipc/wallpaper-handlers.js` (nuovo): `wallpaper:pick-background` (nessun payload accettato; dialog nel main, import, salvataggio di `custom_background`) e `wallpaper:background-status`.
7. `core/ipc/config-applier.js`: `applySettings` chiama `refresh({ force: true })` dopo `notifySidebar`. `applyFlyby` no, il flyby non tocca lo sfondo.
8. Renderer: `renderer/settings-background-field.js` (nuovo, perché `settings-tab-display.js` è già a 278 righe) con selettore, bottone "Scegli immagine…" e riga di stato; caricato in `settings.html` prima di `settings-tab-display.js`.

## Complessità introdotta

- `core/wallpaper-background.js` -> R3-R5, R8 | più semplice scartata: tutto dentro `wallpaper-renderer.js`, perché il file sale verso 280-300 righe e la logica di scelta (pura) resta mescolata al disegno su canvas.
- `core/custom-background.js` -> R6, R8 | più semplice scartata: logica dentro l'handler IPC, perché fs e decodifica reali vanno testati senza Electron (il dialog è l'unica parte che richiede Electron, ed è iniettato).
- `core/ipc/wallpaper-handlers.js` -> R6 | segue il pattern esistente un gruppo di handler per dominio (`ai-usage-handlers.js`, `flyby-handlers.js`); scartata l'aggiunta a `settings-handlers.js`, che mescolerebbe config e file system.
- `renderer/settings-background-field.js` -> R1, R8 | obbligato dal limite di 300 righe su `settings-tab-display.js` (278).
- Getter `getWindow()` su `SettingsWindow` -> R6 (parent del dialog, modale sopra le Impostazioni) | scartato il dialog senza parent, che può aprirsi dietro la finestra delle Impostazioni.
- `image-size` 2.0.4 (pinnata) -> R6, rilievi P1/P2 del security-reviewer | legge dimensioni e formato dall'header senza decodificare, così il limite dei 40 MP scatta prima di allocare l'immagine | più semplice scartata: parser a mano di PNG/JPEG/WebP, dove la scansione dei marker JPEG è il punto in cui un controllo di sicurezza scritto in casa sbaglia (decisione D8 dell'utente).

## Operazioni

- nessuna, perché è codice dell'app desktop che arriva con il rilascio normale (tag -> CI -> `.deb`); la migrazione della config gira da sola al primo caricamento. Unica traccia su disco fuori dal codice: `~/.local/share/deadlineaura/custom-background.<ext>`, creata solo da un'azione dell'utente.

## Sub-task

Dettaglio in `tasks.md`. Ordine e parallelismo:

- T001 (config) e T002 (contratto `planBackground`) partono in parallelo.
- T003 (renderer) dipende da T002; T004 (changer + update-cycle) da T001 e T002; T005 (applier) è indipendente.
- T006 (import) dipende da T001; T007 (IPC) da T005 e T006.
- T008 (selettore) da T001; T009 (picker e stato in UI) da T007 e T008.
- T010 (click-through e pacchetto) chiude.

Fasi mergiabili: dopo T001-T005 + T008 le modalità `dynamic` e `gradient` funzionano da sole (il selettore offre `custom` solo da T009). Fino a T009 `custom` non compare nell'elenco del selettore.

## Zone non testabili in Node

- `dialog.showOpenDialog` reale e la finestra parent: iniettati come funzione nei test, verificati nel click-through.
- Applicazione su GNOME (`gsettings`) e resa reale su due monitor: click-through.

## Integrazioni dopo la code review

- `wallpaper:pick-background` restituisce `COPY_FAILED` o `SAVE_FAILED` invece di una rejection IPC con path nel messaggio; il dettaglio va nel log del main.
- `createUpdateCycle` ricorda un `{ force: true }` arrivato durante un ciclo in corso e lo riesegue una volta a fine ciclo: senza, R9 falliva quando il Salva cadeva durante un aggiornamento.
- Remediation di `/analyze` (A2, A5, A8): log con codice d'errore nei catch dell'import, cleanup del `.tmp` protetto, log sulla foto dinamica mancante. A8 non applicato: `runUpdateCycle` cattura e logga ogni errore al suo interno, il rilancio non può rigettare; due test lo fissano.

## Rischi e mitigazioni

- Path dentro l'asar: la copia sta nella cartella dati, fuori dall'asar, e node-canvas la legge nativamente; `BACKGROUNDS_DIR` di `dynamic` non cambia. Verifica sul `.deb` in T010.
- Immagine enorme in pixel (Q1): limite di default 40 MP; tempo di render misurato in T010 con un JPEG da circa 24 MB. Una cache dell'immagine decodificata si aggiunge solo se la misura supera 1 s per render.
- Migrazione config: la funzione di migrazione gira prima del merge; test su file reali per `false`, `true`, chiave assente, entrambe le chiavi presenti.
- Valore manuale invalido in config: `.catch()` di zod sui due campi, così sbaglia solo il campo e non l'intera config ricade sui default.
- Cleanup che cancella la copia: nomi `custom-background.*` e `custom-background.*.tmp` non iniziano con `wallpaper-`; test di guardia in T004.
- Salva che sovrascrive il nome con un valore vecchio: il renderer rispecchia il nome restituito dal pick; test di pagina in T009.
- Ridisegno non forzato al cambio di modalità: T005 aggiunge `refresh({ force: true })` all'applier.
- WebP non supportato da node-canvas: verificato in T006 con una fixture reale.
- Test esistente che asserisce `use_backgrounds` (`test/renderer/settings-tab-display.test.js:84`): aggiornato in T008, non prima. Fra T001 e T008 il vecchio toggle scrive una chiave che lo schema scarta: innocuo.
- File oltre 300 righe: nuova logica in moduli separati; `wc -l` nei verify dei task che toccano renderer, changer e tab.

## Stima

10 task, 15-17 h di lavoro più 20% di buffer per imprevisti (decodifica WebP, harness di pagina con chiamate asincrone): 18-20 h.
