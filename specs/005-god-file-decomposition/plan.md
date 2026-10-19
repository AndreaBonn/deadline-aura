# 005 - Scomposizione dei god-file: piano

Stato: proposto, 2026-10-19. Requisiti in `spec.md`, scomposizione in `tasks.md`.

## Obiettivo

A fine lavoro nessun file del repo supera 300 righe (con `main.js` come unica eccezione dichiarata se la Fase 7 non viene approvata), la logica pura oggi chiusa dentro script DOM ed Electron vive in moduli coperti da test comportamentali, e l'app si comporta come prima.

## Baseline (misurata dal chiamante e dal planner, 2026-10-19, commit `78281c2`)

- 96 file di test, 1395 test verdi, coverage 96.53 lines / 95.28 branches, eslint pulito (misura del chiamante).
- 0 test marcati `skip`/`todo`/`only` (misura del planner).
- Righe: `renderer/sidebar.js` 1829, `main.js` 1179, `renderer/settings.js` 962, `renderer/settings-fields.js` 593, `store/db.js` 526, `integrations/google-calendar.js` 517. `core/deadline-engine.js` 321 (fuori scope, vedi `spec.md`).
- Nessun test di backfill delle migrazioni 005b/007b: `grep -n "backfill\|start_at" test/store/*.js` trova solo schemi e fixture. BASIS: inferred, da confermare in T003.
- Nessun test DOM nel repo, nessun ambiente DOM nelle devDependencies. I test renderer esistenti usano oggetti finti al posto degli elementi (`test/renderer/settings-ai-capture.test.js`).

## Definition of Done

- [ ] `npm test`, `npm run lint`, `npm run format:check`, `npm run test:coverage` verdi, soglie invariate (95/97/94/95).
- [ ] Test totali > 1395, nessun test rimosso, 0 `skip`/`todo`/`only`.
- [ ] `wc -l` sotto 300 per `store/db.js`, `integrations/google-calendar.js`, `renderer/settings-fields.js` (Fasi 2 e 6), `renderer/sidebar.js` (Fase 5), `renderer/settings.js` (Fase 6), `main.js` (Fase 7). Se la Fase 7 non si fa, `main.js` scende a non più di 900 righe (Fase 3) e la deroga è scritta nel report.
- [ ] Ogni file nuovo e ogni file riportato sotto soglia è nel blocco dimensionale di `eslint.config.js` (R5) e il lint è verde.
- [ ] Ogni nuovo modulo renderer con test di modulo è in `coverage.include`.
- [ ] Il test di contratto degli script (T001) è verde su tutte le pagine di `renderer/*.html`.
- [ ] Le migrazioni producono lo stesso schema e gli stessi backfill (T003 verde prima e dopo T011).
- [ ] `npm run dist` produce il pacchetto e `npx asar list` contiene ogni file nuovo (i file stanno in directory già nei `build.files`, oppure la Fase 7 aggiunge `main-process/**`).
- [ ] Click-through manuale a fine Fase 5, 6 e 7 con l'esito di ogni controllo (lista in "Zone non testabili in Node").
- [ ] Un commit per task, Conventional Commits, push non eseguito.

Esempio concreto (Given/When/Then) del criterio di non regressione, sul punto più fragile:
Given un DB creato con lo schema pre-008 e una riga `gcal` con `raw_json` che ha `start.date = "2026-03-01"` e `start_at` nullo, When parte `getDb()`, Then `start_at` vale `new Date("2026-03-01T00:00:00").getTime()` (mezzanotte locale) e la riga di `pinned_tasks` collegata esiste ancora. Stesso esito prima e dopo T011.

## Assunzioni

- Commit su `main` approvati dall'utente (riferito dal chiamante). Push escluso.
- Node 20 per test e CI, Electron 36 per l'app. Nessun cambio di versione.
- Nessun cambiamento di comportamento voluto, tranne D3 se approvata.
- Il runner è `npm run <script>`: nessun `Makefile` da introdurre.
- I file nuovi del processo principale stanno in `core/` (già in `build.files` e in `coverage.include`). Un file in una directory nuova non finirebbe nel `.deb`: è il motivo per cui D2 tocca `package.json`.
- happy-dom supporta ciò che le pagine usano (`<details>`, `HTMLDialogElement.showModal/close`, `localStorage`, `setSelectionRange`). UNVERIFIED: da verificare in T040 con context7 e con il primo test, prima di scrivere gli altri.
- Il caricamento degli script classici in un test con `vm.runInThisContext` riproduce la semantica del browser (dichiarazioni top-level condivise fra script, `typeof module === 'undefined'`). UNVERIFIED in combinazione con happy-dom: T041 è a tempo (30 minuti) con un ripiego dichiarato.

## Disambiguazione

Tre decisioni strutturali. Le Fasi 1-4 non dipendono da nessuna delle tre e possono partire subito.

**D1 - Ambiente DOM per i test** (blocca Fasi 5 e 6)

- Opzione A: happy-dom come devDependency, attivato per file con `// @vitest-environment happy-dom`, più un harness che carica la pagina HTML vera con i suoi script nell'ordine reale e un fake del bridge IPC.
- Opzione B: nessun ambiente DOM. Si estrae solo la logica pura; il resto di `sidebar.js` e `settings.js` resta oltre 300 righe con deroga scritta.
- Opzione C: jsdom al posto di happy-dom.

Implicazioni. A: circa 3.300 righe di renderer oggi a copertura zero diventano verificabili a scatola nera, e soprattutto lo split del DOM glue ha una rete di caratterizzazione prima di essere fatto (R2). Costa una dipendenza dev, un harness da mantenere e il rischio di API non supportate. B: costo minimo, ma lo split del DOM glue diventerebbe uno spostamento di righe senza rete, quindi non si fa; i file restano grossi. C: come A, più lento e più pesante, nessun vantaggio specifico per queste pagine.

Raccomandata: **A**. Il motivo concreto: i difetti renderer già corretti nel repo stanno nel DOM glue, non nella logica pura (`a72dfcb` bottone del time-log non riutilizzabile, `c04aa0c` XSS via `innerHTML`), e senza ambiente DOM non c'è modo di scrivere il test che li avrebbe presi. happy-dom con una versione che chiude CVE-2025-61927 (UNVERIFIED: controllare con `npm audit` e context7 in T040).

**D2 - Dove vivono le shell Electron estratte da `main.js`** (blocca Fase 7)

- Opzione A: nuova directory `main-process/` per finestre e registrazione IPC legate alle finestre, aggiunta ai `build.files`, fuori da `coverage.include` come oggi `main.js`. La geometria pura va in `core/`.
- Opzione B: in `core/` con `require('electron')` pigro dentro le funzioni (precedente: `core/meeting-flyby.js`). Entra nel coverage, quindi servono mock di `BrowserWindow` per non far cadere le soglie.
- Opzione C: le finestre restano in `main.js`, che si ferma a circa 800-900 righe.

Raccomandata: **A**. B porterebbe test che asseriscono le opzioni passate al costruttore di `BrowserWindow`, cioè test tautologici che l'utente ha chiesto di non scrivere. C lascia il file più grande del processo principale fuori standard.

**D3 - Sync seguita da refresh unificata (T023)**

Oggi tre siti fanno sync, `summarizeSync`, refresh: la sync manuale e quella all'avvio loggano `syncResult.errors`, quella periodica no; la manuale chiama `runUpdateCycle()` senza `force`. Unificare in `core/sync-runner.js` con logging degli errori anche nella periodica è un cambio di comportamento (una riga di log in più quando una fonte fallisce). Raccomandata: unificare e loggare in tutti e tre i casi, tenendo `force` come parametro per conservare la differenza della manuale; dichiararlo nel corpo del commit. Alternativa: conservare il silenzio della periodica con un flag `logErrors`.

## Anchor incidentali (non vincoli)

- Script classici con globali e `module.exports` condizionale: è come il renderer è costruito oggi, non un vincolo. Resta perché CSP `script-src 'self'` e `contextIsolation` escludono `require` nel renderer e l'ADR 002 ha scelto CommonJS; i moduli ES nel renderer sotto `file://` sono un cambio più grosso, non valutato qui.
- Il duplicato di `isFlybySuppressed` fra `core/flyby-snooze.js` e `renderer/sidebar.js` è voluto (la sandbox non condivide moduli). Non si unifica: si aggiunge un test di parità come per lo shift countdown.

## Analisi dei file

### `renderer/sidebar.js` (1829)

| Gruppo                                                                                                                                                       | Righe oggi                    | Logica pura estraibile                                                                                                              | Decisione                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Spiegazione del punteggio (`SOURCE_LABEL_KEYS`, `formatHoursRemaining`, `build*Section`, `buildBlendFooter`, `renderScoreBreakdown`, `toggleScoreBreakdown`) | 1508-1717                     | Tutti i builder sono funzioni da dati a stringa; dipendono solo da `t` ed `escapeHtml`                                              | Coeso. Nuovo `renderer/sidebar-score-breakdown.js`, `t` passato come parametro (pattern di `settings-helpers.js`). T030, DOM in T050 |
| Raggruppamento task per sezione (dentro `renderTaskList`, `filterJiraTasks`)                                                                                 | 253-380                       | Filtro del task in attesa di undo, ordinamento per `due_at` (null come 0), preferiti Jira esclusi dalla lista Jira, filtro testuale | Coeso. `renderer/sidebar-task-groups.js`. T031                                                                                       |
| Timer live (`saveTimerState`...`stopTimer`, picker calendario, bottone)                                                                                      | 24-172, 945-979, 1076-1150    | Validazione dello stato salvato (oggi: JSON corrotto o campi mancanti), costruzione dello stato                                     | Coeso, macchina a stati con storage e IPC. Modello puro in T032, controller con storage/IPC/orologio iniettati in T047               |
| Form di time-log, picker chiave Jira, select calendario                                                                                                      | 481-792                       | Arrotondamento dell'ora di inizio a 15 minuti, validazione durata/calendario/data                                                   | Coeso. Helper puri in T033, DOM in `renderer/sidebar-time-log.js` T046                                                               |
| Form di modifica e aggiunta rapida                                                                                                                           | 381-480, 1239-1409            | Lettura e validazione dei valori (stesso codice due volte: gemello), conversione `due_at` per `datetime-local`                      | Coeso, un solo modulo per i due form. Helper puri in T033, DOM in `renderer/sidebar-task-forms.js` T045                              |
| Card del task, azioni, menu                                                                                                                                  | 793-1037                      | Quali voci di menu mostrare dati sorgente, pin, preferito, Google pronto                                                            | Coeso. `renderer/sidebar-task-card.js` con modello del menu puro. T048                                                               |
| Sezioni e undo della cancellazione                                                                                                                           | 1038-1075, 1151-1307, 263-380 | Nessuna oltre al raggruppamento                                                                                                     | Coeso. `renderer/sidebar-sections.js`. T049                                                                                          |
| Pannello AI: nota, previsione stress, toggle                                                                                                                 | 1410-1500, 1719-1770          | Colonne della previsione (massimo 5, colore, etichetta, oggi)                                                                       | Coeso. `renderer/sidebar-ai-panel.js`, puro in T035, DOM in T050                                                                     |
| Icona e menu del flyby                                                                                                                                       | 173-226, 1430-1494            | `isFlybySuppressed`                                                                                                                 | Coeso, file piccolo `renderer/sidebar-flyby.js` in T050. Predicato in `sidebar-utils.js` con test di parità (T034)                   |
| Bootstrap, orologio, barra urgenza, `onUpdate`, stato sync, binding dei bottoni                                                                              | resto                         | Nessuna nuova (`formatSyncStatus` è già in `sidebar-utils.js`)                                                                      | Resta in `sidebar.js`, che diventa la shell (T051)                                                                                   |

Contratto necessario prima di spostare il DOM glue: oggi 14 `let` di stato a livello di file sono lette e scritte da quasi tutti i gruppi. T044 le raccoglie in un solo oggetto `sidebarState` e introduce `rerender()`; i moduli di feature ricevono `ctx = { state, api, t, rerender }` invece di leggere globali, così si richiedono da Node senza setup.

### `main.js` (1179)

| Gruppo                                                                            | Decisione                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apertura link esterni (righe 787-808 e 876-895, identiche a parte `buildMeetUrl`) | Gemello. `core/open-external.js` con `which`/`spawn` iniettati e controllo `isSafeExternalUrl` dentro. T020                                                                                                                                                                        |
| Pulizia del turno all'avvio (72-93)                                               | Pura, appartiene al dominio turno. `cleanupWorkShiftConfig` in `core/work-shift.js` (257 righe, resta sotto 300). T021                                                                                                                                                             |
| `collectSourceFacts` (142-163)                                                    | Coeso con `describeSourceStatus`. In `core/source-status.js`. T022                                                                                                                                                                                                                 |
| Sync seguita da refresh (127-140, 165-182, 1156-1170)                             | Tre gemelli. `core/sync-runner.js`. T023, D3                                                                                                                                                                                                                                       |
| Opzioni del motore dal config (608-616 e 903-910), note AI dalla cache            | Gemello più lettura pura. `core/update-payload.js`. T024                                                                                                                                                                                                                           |
| Handler IPC (779-1155)                                                            | Raggruppati per dominio in `core/ipc/`: task locali, calendario, impostazioni, flyby. Fabbriche con dipendenze iniettate e `getConfig()` letto a ogni chiamata (il `config` di `main.js` viene riassegnato dopo ogni salvataggio: catturarlo per valore sarebbe un bug). T025-T029 |
| Finestre: strisce, dock riunioni, sidebar, overlay, impostazioni                  | Shell Electron, non testabili in Node. Geometria pura in `core/window-geometry.js`, lifecycle in `main-process/` (D2). T071-T075                                                                                                                                                   |
| `app.whenReady`, intervalli, burnout check                                        | Resta in `main.js` come bootstrap                                                                                                                                                                                                                                                  |

### `renderer/settings.js` (962) e `renderer/settings-fields.js` (593)

| Gruppo                                                                        | Decisione                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tab Sorgenti + gruppo Jira (216-483)                                          | Coeso, `renderer/settings-tab-sources.js` (circa 270 righe). T063                                                                                                                                                              |
| Tab Turno + `ensureWorkShift` (825-930)                                       | `renderer/settings-tab-shift.js`. T064                                                                                                                                                                                         |
| Tab AI + Limiti (484-562, 645-660)                                            | `renderer/settings-tab-ai.js`. T065                                                                                                                                                                                            |
| Tab Wallpaper, Sidebar, UI (563-644, 661-693, 745-792)                        | `renderer/settings-tab-display.js`. T065                                                                                                                                                                                       |
| Tab Generale, Notifiche, Avanzate (191-215, 694-744, 793-824)                 | `renderer/settings-tab-general.js`. T066                                                                                                                                                                                       |
| Stato dirty, navigazione, salvataggio, reset, `renderTab`                     | Resta in `settings.js` (shell). `describeSaveError` diventa puro con la lettura dell'etichetta della tab iniettata, in `settings-helpers.js` (T036)                                                                            |
| Griglia del mese variabile + editor del giorno (`settings-fields.js` 378-593) | Coeso: l'editor non esiste senza la griglia. `renderer/settings-month-grid.js`; il calcolo delle celle (offset lunedì-primo, righe, giorni con turno) diventa `buildMonthGridCells` puro in `settings-helpers.js` (T036). T061 |
| `createDateList`, `createTimeSlotList` (262-377)                              | Widget del turno usati da regolare e variabile: `renderer/settings-shift-fields.js`. T061                                                                                                                                      |
| Factory generiche (1-261)                                                     | Restano in `settings-fields.js`, che riceve `module.exports` per i test                                                                                                                                                        |

### `store/db.js` (526)

`runMigrations` (36-282) con `rebuildTasksTable` e `sourceCheckAccepts` va in `store/migrations.js`, un modulo solo: i passi condividono l'ordine e il rebuild della tabella. Gli schemi SQL delle tre ricostruzioni diventano costanti nominate, i passi diventano funzioni nominate sotto 30 righe. Il percorso del backup oggi è la costante `DB_PATH` del modulo: passa come argomento (`runMigrations(database, { dbPath })`). Il backfill 005b riusa il parser di inizio evento di `google-calendar.js` (T010), come il 007b riusa già `extractMeetUrl`. T003 (rete) poi T011.

### `integrations/google-calendar.js` (517)

Il gruppo OAuth (`resolveGoogleOAuth`, `createOAuthClient`, `loadSavedToken`, `startAuthFlow`, `runSharedAuthFlow`, `getAuthenticatedClient`, `authorizeGoogle`, `isGoogleCalendarReady`, `deleteToken`, percorsi del token) va in `integrations/google-auth.js`. Non è uno split forzato: `integrations/google-tasks.js` importa già l'autenticazione da `google-calendar.js`, quindi il confine esiste e oggi è nel posto sbagliato. `google-calendar.js` riesporta le funzioni di auth che `main.js` e `core/sync-daemon.js` usano, così i consumatori non cambiano. T012.

## Candidati scartati

| Candidato                                                                                                                   | Perché no                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spezzare `core/deadline-engine.js` (321) separando la spiegazione (`describeMechanicalScore`, `pickTopDrivers`) dal calcolo | Separa una regola dalla sua spiegazione: le soglie devono cambiare insieme. 21 righe oltre il limite non giustificano il rischio. Piano a parte sulle funzioni lunghe |
| Un file per migrazione (`store/migrations/006.js`...)                                                                       | I passi condividono `rebuildTasksTable` e un ordine obbligato; un file per passo sparpaglia un invariante (ordine) che oggi si legge in un punto                      |
| Spezzare `google-calendar.js` fra normalizzazione eventi e chiamate API                                                     | Normalizzazione e fetch cambiano insieme quando cambia l'API; dopo T012 il file è sotto 300 senza farlo                                                               |
| Unificare `isFlybySuppressed` renderer e core in un modulo                                                                  | Impossibile nella sandbox del renderer; test di parità al suo posto (T034)                                                                                            |
| Un file per ogni tab di Impostazioni (10 file, alcuni da 16 righe)                                                          | Granularità senza guadagno; tab raggruppate per tema in 5 file                                                                                                        |
| Test sulle opzioni passate a `new BrowserWindow(...)`                                                                       | Tautologici: ripeterebbero il codice nel test                                                                                                                         |
| Spostare `formatSyncStatus`, `escapeHtml` e gli altri helper di `sidebar-utils.js`                                          | Già estratti e testati; `sidebar-utils.js` resta a circa 266 righe dopo T034                                                                                          |
| Ratchet dimensionale con `.size-baseline.json`                                                                              | Lo script `~/.claude/scripts/size-ratchet.py` misura solo Python (ruff): su questo repo non controllerebbe niente. Il gate è il blocco eslint di T002                 |

## Fasi

Ogni fase lascia l'app usabile e si può fermare lì. Ordine per rischio crescente.

1. **Rete di sicurezza** (T001-T003): solo test e lint, zero codice di produzione.
2. **Store e integrations** (T010-T012): moduli già molto testati, rischio basso-medio, dati utente protetti da T003.
3. **Processo principale, logica pura e IPC** (T020-T029): `main.js` scende verso 900 righe; gli handler diventano testabili.
4. **Renderer, logica pura** (T030-T036): solo Node, nessun ambiente DOM. `sidebar.js` perde circa 300 righe.
5. **Ambiente DOM e sidebar** (T040-T051, se D1 = A): rete di caratterizzazione a pagina intera, poi split per feature.
6. **Impostazioni** (T060-T066, se D1 = A).
7. **Shell Electron** (T071-T075, se D2 = A).
8. **Gate finali** (T080).

## Rischi e mitigazioni

- Poiché gli script del renderer sono script classici, una `const`/`let` dichiarata in due file della stessa pagina lancia `SyntaxError` al caricamento e una `function` duplicata sovrascrive in silenzio la prima, quindi uno spostamento può lasciare la sidebar vuota senza che nessun test di unità lo veda. Mitigazione: T001 prima di ogni spostamento, eseguito a ogni commit.
- Poiché `build.files` elenca le directory a mano, un modulo in una directory nuova manca dal `.deb` e l'app installata crasha al `require`. Mitigazione: file nuovi in `core/`, `integrations/`, `store/`, `renderer/`; `main-process/` solo con l'aggiunta a `build.files` e il controllo `npx asar list` (T071).
- Poiché `main.js` riassegna `config` dopo ogni salvataggio, un handler estratto che cattura l'oggetto lavorerebbe su un config vecchio. Mitigazione: contratto `getConfig()` in T025, con un test che salva e poi legge.
- Poiché `runMigrations` gira sul DB reale dell'utente all'avvio, un passo riordinato o un backup saltato tocca dati non ricostruibili. Mitigazione: T003 (schema finale, backfill, idempotenza, sopravvivenza dei pin) prima di T011; nessun test fuori dalla HOME temporanea.
- Poiché happy-dom non fa layout e può non implementare `HTMLDialogElement` o la selezione nei campi, alcuni flussi di caratterizzazione possono non essere scrivibili. Mitigazione: T040-T041 a tempo, i flussi non scrivibili passano alla lista di smoke manuale invece di essere forzati con mock.
- Poiché i moduli renderer nuovi entrano in `coverage.include`, un modulo coperto male fa cadere le soglie globali. Mitigazione: il modulo entra solo insieme ai suoi test; le soglie non si abbassano.
- Poiché i test di `google-calendar` mockano moduli per percorso, lo spostamento dell'auth in T012 può rompere `vi.mock`. Mitigazione: riesportazione da `google-calendar.js`; conteggio dei test invariato come verify.

## Zone non testabili in Node

| Zona                                                                                        | Perché                                                                            | Copertura alternativa                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Creazione delle finestre (`BrowserWindow`, opzioni, `setIgnoreMouseEvents`, `showInactive`) | Richiede Electron in esecuzione; un mock produrrebbe test che ripetono le opzioni | Geometria pura testata (T071); smoke manuale                                       |
| Proprietà X11 e strut (`xprop`, `setX11Strut`)                                              | Parlano con il server X reale                                                     | Già in `core/display-controller.js` con test sui comandi; smoke manuale            |
| `preload*.js` e `contextBridge`                                                             | Richiedono il processo renderer di Electron                                       | Test di contratto sulle chiavi esposte (T041)                                      |
| Trasporto IPC reale (serializzazione, structured clone)                                     | Esiste solo fra i due processi Electron                                           | Handler testati come funzioni (T026-T029); smoke                                   |
| Layout, CSS, z-index, animazione del flyby                                                  | happy-dom non calcola layout                                                      | Render osservato a 375 e 1280 px solo se la fase tocca markup o CSS (non previsto) |
| CSP e caricamento degli script sotto `file://`                                              | Lo applica Chromium                                                               | T001 sull'ordine e i nomi; smoke                                                   |
| `better-sqlite3` compilato per l'ABI di Electron                                            | I test girano sull'ABI di Node                                                    | `npm start` (fa `electron-rebuild`)                                                |
| OAuth Google reale e apertura del browser                                                   | Rete e browser esterni                                                            | Già testato con fake; `openExternalUrl` testato con `spawn` finto                  |

Smoke manuale a fine Fase 5, 6, 7 (`npm start`, l'orchestratore o l'utente registra l'esito di ogni voce): sidebar si apre dalla striscia; sezioni popolate; aggiunta rapida crea un task; modifica salva; cancella e annulla; time-log su un calendario; timer start e stop; spiegazione del punteggio si apre e il link apre il browser; menu flyby sospende e riattiva; Impostazioni: cambio tab, modifica, salva, errore di validazione porta alla tab giusta, chiusura con modifiche chiede conferma, griglia del turno variabile apre l'editor del giorno; colore della striscia cambia al ciclo; dock riunione compare con una riunione imminente; overlay salva le posizioni.

## Stima

Somma delle righe di `tasks.md`: circa 68 ore, 82 con il buffer del 20% per imprevisti (refactor su codice esistente, harness DOM nuovo). Fasi 1-4 circa 30 ore, Fasi 5-6 circa 30 (solo con D1 = A), Fase 7 circa 8 (solo con D2 = A): se D1 o D2 vengono rifiutate, il totale scende di conseguenza.

## Handoff

Esecuzione test-first: `tdd-guide` per T001-T036 (logica pura e caratterizzazione), con delega `[DELEGATE-CODEX]` ammessa perché il piano è fissato, blocchi di 2-4 task. Fasi 5-6 a `fullstack-developer` (DOM, niente delega). Fase 7 a `senior-backend` più smoke manuale dell'orchestratore. `code-reviewer` a fine di ogni fase.
