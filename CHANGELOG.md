## What's Changed in v1.6.0

> La release v1.6.0 aggiunge Outlook come seconda sorgente di calendario, letta dal feed ICS pubblicato e configurabile dalle impostazioni.

### ✨ New Features

- Lettura del calendario Outlook dal feed ICS pubblicato, con espansione delle riunioni ricorrenti (2e56dd1, 9ddd558)
- Configurazione dell'URL del feed dalle impostazioni, trattato come segreto al pari degli altri token (d1ea5ed, 7416189)
- Comparsa degli eventi Outlook nel dock delle riunioni e in una sezione dedicata della barra laterale (10be3e2, 7416189)
- Conteggio degli eventi Outlook come impegni di calendario nel motore di pressione e nello scoring AI, non come backlog (c3caca9)

### 🐛 Bug Fixes

- Esclusione delle occorrenze spostate fuori dalla finestra da un'eccezione della serie (e313db3)
- Identificativi degli eventi ricorrenti ancorati alla data di calendario invece che a un timestamp, per non perdere i punteggi AI al cambio di fuso orario (e313db3)
- Innalzamento del limite di iterazioni sull'espansione delle serie, che poteva esaurirsi prima di raggiungere la finestra (e313db3)

### 🔧 Maintenance

- Aggiunta della dipendenza ical.js per il parsing iCalendar (113d6c5)
- Dichiarazione di AbortSignal e Response fra i globali Node nella configurazione ESLint (7fb0e48)
- Migrazione 008 del database eseguita dentro una transazione esplicita (10be3e2)

### 📚 Documentation

- Registrazione del piano e delle decisioni architetturali della sorgente Outlook (fa7d648)

## What's Changed in v1.5.0

> La release v1.5.0 rende gestibile l'avviso delle riunioni direttamente dal flyby.

### ✨ New Features

- Aggiunta del pulsante sul gatto per posticipare o disattivare gli avvisi delle riunioni (8482c7a)

## What's Changed in v1.4.0

> La release v1.4.0 cambia il protagonista del flyby e irrobustisce i test.

### ✨ New Features

- Sostituzione del piccione con un gatto pixel art e banner a gomitolo (621aac6)

### 🐛 Bug Fixes

- Segnalazione del punteggio come puramente meccanico quando non ci sono task (8786603)

### 🔧 Maintenance

- Isolamento dei test del daemon e del motore dalle integrazioni reali (90233de)
- Allineamento delle asserzioni di errore di Google Calendar ai messaggi delle impostazioni (9c64e17)

## What's Changed in v1.3.1

> La release v1.3.1 porta le credenziali OAuth nelle impostazioni e corregge il caricamento degli sfondi nel pacchetto.

### ✨ New Features

- Configurazione delle credenziali OAuth di Google dall'interfaccia (352ecf4)

### 🐛 Bug Fixes

- Caricamento delle immagini di sfondo da app.asar.unpacked (8bda854)

## What's Changed in v1.3.0

> La release v1.3.0 introduce il pacchetto .deb installabile, Google Tasks come sorgente sempre attiva e il flyby animato prima delle riunioni.

### ✨ New Features

- Costruzione del pacchetto .deb installabile e automazione delle release (68b060f)
- Integrazione di Google Tasks come sorgente dati sempre attiva (472f49f)
- Notifica animata prima delle riunioni, su tutti i display e in ciclo fino all'inizio (ee3fd14, 0bc947f, 4d0e5ac)
- Pannello di spiegazione del punteggio con dettaglio AI e meccanico (07f3154)
- Chiavi API dei provider AI configurabili dalle impostazioni (a58161d)
- Snapshot del database prima di ogni migrazione distruttiva (641836a)
- Pulsante per chiudere il riquadro riunione su ciascun display (18cb81d)
- Permanenza dei task appuntati scaduti sul desktop con evidenziazione rossa (9130919)
- Icona applicazione dedicata nel dock di GNOME (bf5be52)

### 🐛 Bug Fixes

- Conservazione delle righe referenzianti durante le migrazioni dei vincoli CHECK (5f39816)
- Ri-autenticazione automatica alla scadenza del token OAuth (57fcf66)
- Propagazione dell'errore quando tutte le letture di Google Calendar falliscono (42052bd)
- Esclusione degli eventi conclusi dalla query dei task attivi (930dcf7)
- Esclusione di assenze ed eventi rifiutati dal calcolo del carico cognitivo (0abf831)
- Riduzione dell'inflazione del punteggio dovuta al volume del backlog (4040297, 7fdcb8d)
- Invalidazione della cache AI al cambio di struttura del prompt (5a0de5b)
- Visualizzazione della striscia su tutti i monitor e posizionamento sul bordo destro (0511ce0, f470e13)
- Correzione dei conflitti di avvio automatico (9061781)
- Correzione del click-through del dock riunioni su Linux (3a44b7f, e3ee667)
- Punteggio global_stress come decimale invece che intero (242ceed)
- Disattivazione della pubblicazione implicita di electron-builder sui tag (0236be9)

### 📚 Documentation

- Documentazione dell'installazione da .deb con collegamento all'ultima release (6549ec5)
- Sezione donazioni e pulsante GitHub Sponsor nel README (93ff833)

### 🎨 Style

- Sostituzione degli sfondi astratti con paesaggi naturalistici (b912b2e)
- Riequilibrio del prompt di scoring da tono clinico a tono di accompagnamento (c32543c)

## What's Changed in v1.2.0

> La release v1.2.0 introduce una maggiore integrazione con Google Calendar e miglioramenti nella gestione delle riunioni.

### ✨ New Features

- Estrazione dei link di Teams e Zoom dagli eventi di Google Calendar nel dock delle riunioni (7ceb91a)
- Introduzione della sincronizzazione differenziata, tempistica del dock delle riunioni e stati degli eventi di Google Calendar (feeba91)

### 🐛 Bug Fixes

- Prevenzione dell'overflow di contenuto a qualsiasi larghezza della barra laterale (58f2734)
- Commutazione dei diagrammi Mermaid su tema neutro per una migliore leggibilità in modalità oscura (13285ae)
- Rimozione del tipo di finestra DOCK per preservare la trasparenza su GNOME (82d7a31)

### 📚 Documentation

- Aggiunta di diagrammi Mermaid per l'architettura del sistema (023a29d)
- Aggiornamento del README con dock delle riunioni, stati degli eventi e intervalli di sincronizzazione (7f52e31)

### 🔧 Maintenance

- Aggiornamento di CHANGELOG.md per v1.1.0 [skip ci] (9c02c4d)
- Aggiornamento di CHANGELOG.en.md per v1.1.0 [skip ci] (c130f1f)
- Rimozione di docs/decisions dai file tracciati (f03022d)
- Rimozione di doc_progetto dal tracciamento e aggiunta a gitignore (089d5d4)
- Aggiornamento dei badge [skip ci] (98cc1c1)

## What's Changed in v1.1.0

> Aggiornamento dell'interfaccia utente e correzione di bug per migliorare l'esperienza utente.

### ✨ New Features

- Aggiunta della dock delle riunioni imminenti con collegamenti Meet cliccabili (aa37351)
- Aggiunta della funzione di auto-rimozione dei task obsoleti e del pulsante di rimozione nella sovrapposizione (9abd296)

### 🐛 Bug Fixes

- Prevenzione dell'apertura automatica della sidebar dopo la chiusura manuale (af1c2e2)
- Prevenzione della marcatura come obsoleto in caso di errore di fetch e aggiunta della sincronizzazione all'avvio (fb6f87c)
- Sostituzione della finestra trasparente con sfondo opaco nella dock delle riunioni (7d8b023)
- Aggiornamento della procedura di aggiornamento dei badge per evitare conflitti (6d42acc)

### 📚 Documentation

- Rinomina di DeadlineAura in Deadline Aura by Bonn (f44d202)
- Aggiunta di screenshot e correzione del conteggio delle tab delle impostazioni (f6a845e)

### 🔧 Maintenance

- Aggiornamento dei badge [skip ci] (05dbc93, e7380b7)
- Aggiornamento del file CHANGELOG.md per v1.0.0 e v1.1.0 [skip ci] (b0fc3aa, 226e598)
- Abilitazione della generazione del changelog in inglese (db5aa2a)

### Other changes

- Visualizzazione della previsione dello stress come percentuale (8ee85ed)

## What's Changed in v1.1.0

> Aggiunta della dock delle riunioni imminenti con collegamenti Meet cliccabili e correzioni di bug per migliorare l'esperienza utente.

### ✨ New Features

- Aggiunta della dock delle riunioni imminenti con collegamenti Meet cliccabili (aa37351)
- Auto-rimuove i task obsoleti dalle pinned e aggiunge un pulsante per rimuovere nel overlay (9abd296)

### 🐛 Bug Fixes

- Impedisce che la sidebar si riapra automaticamente quando è stata chiusa manualmente (af1c2e2)
- Impedisce la marcatura di task obsoleti in caso di errore di fetch e aggiunge la sincronizzazione all'avvio (fb6f87c)
- Sostituisce la finestra trasparente della dock delle riunioni con uno sfondo opaco (7d8b023)
- Corregge il processo di aggiornamento dei badge in CI (6d42acc)

### 📚 Documentation

- Rinomina DeadlineAura in Deadline Aura di Bonn (f44d202)
- Aggiunge screenshot e corregge il conteggio delle tab delle impostazioni (f6a845e)

### 🔧 Maintenance

- Aggiorna i badge [skip ci] (05dbc93, e7380b7)
- Aggiorna CHANGELOG.md per v1.0.0 [skip ci] (b0fc3aa)
- Corregge il processo di aggiornamento dei badge in CI (6d42acc)

### Other changes

- Visualizza la previsione dello stress come percentuale nella sidebar (8ee85ed)

## What's Changed in v1.0.0

> First release of deadline-aura with new features, bug fixes, and performance improvements.

### ✨ New Features

- Aggiunta della funzionalità di conteggio alla rovescia per i turni di lavoro con orari configurabili (1f46b9a)
- Aggiunta della sezione "In corso" per i task con timer attivi nella sidebar (4e8bcbf)
- Aggiunta del timer live play/stop con integrazione Google Calendar (74d0a3d)
- Aggiunta della sezione dei favoriti di Jira con toggle stella (2bc97c5)
- Aggiunta della registrazione del tempo su Google Calendar dai task card (650a243)
- Estensione della previsione a 7 giorni minimi con allineamento domenica (8d3ebe3)
- Aggiunta della nota clinica con vincoli di azione e consapevolezza del linguaggio (c43558f)
- Resa delle note AI comprimibili tramite toggle barra urgenza (efefbb4)
- Aggiunta del supporto bilingue (IT/EN) con selettore lingua (20e39d6)
- Divisione del timeout in provider singolo e deadline totale (05fb898)
- Aggiunta del pulsante di modifica e form di modifica inline per task locali (f8009fe)
- Aggiunta della nota clinica, previsione stress e avviso burnout precoce (568e576)
- Aggiunta dei task personali con CRUD, aggiunta rapida e supporto post-it (06677dd)
- Riserva dell'area di lavoro tramite X11 strut per evitare overlap (bfd9f5a)
- Utilizzo dell'orario di inizio evento per la visualizzazione agenda calendario (77b9f84)
- Conteggio dinamico degli elementi agenda in base allo spazio disponibile (a8a6b9b)
- Visibilità per display e broadcast task pinned (7869063)
- Ordinamento cronologico degli eventi calendario con tutti i giorni prima (9645a0b)

### 🐛 Bug Fixes

- Correzione della soglia di copertura e documentazione SHA-256 (4)
- Correzione dei problemi di sicurezza e qualità del codice (3)
- Applicazione della correzione di audit — 11 correzioni prima della conferenza (1)
- Aggiornamento della dipendenza canvas 2.x a 3.x per risolvere il problema della schermata nera (c132844)
- Validazione della configurazione caricata con schema Zod prima dell'uso (b7d8d3b)
- Cache delle istanze provider per preservare lo stato di rotazione chiave (6f01cbf)
- Spostamento delle stringhe italiane hardcoded nel burnout-detector nei file di localizzazione (d94584a)
- Aggiunta di un tiebreaker rowid alla query getLatestAiCacheResponse (16563cf)
- Utilizzo di date future remote nei test normalizeEvent (5e5b4fa)
- Resa del pulsante di registrazione tempo riutilizzabile con feedback temporaneo (a72dfcb)
- Registrazione degli errori di sincronizzazione-now dei risultati del demone (76c5be4)
- Forzatura di Firefox per i link esterni con fallback catena browser (cd4083c)
- Utilizzo dell'orario di inizio evento invece dell'orario di fine per il conteggio alla rovescia (b43e38e)
- Prevenzione dell'auto-mostra non voluta su singolo monitor e correzione colore striscia (15649af)
- Correzione della soglia di copertura e documentazione SHA-256 (4) (6877d7f)
- Protezione di runUpdateCycle da esecuzioni concorrenti (7f20861)
- Rimozione del markDone non implementato dall'API contextBridge (e2a3d23)
- Utilizzo di shell.openExternal per l'apertura dei link invece di Firefox hardcoded (bceb18f)
- Risoluzione di 6 errori ESLint in main.js (13168c1)
- Visualizzazione della chiave progetto invece dell'ID interno Jira nell'intestazione (9fd402a)
- Aumento dell'opacità del testo per una migliore leggibilità (214f01b)
- Miglioramento della visibilità dell'etichetta di carico mentale (035bd2c)
- Tronchimento dei titoli task lunghi nella sezione urgenza (7dbbde6)
- Attesa del caricamento webContents prima di inviare aggiornamenti (d69532a)
- Valutazione del carico psicologico realistico (3b0a974)
- Pagamento basato su cursore e rimozione del filtro lookahead (49eb7ad)
- Rimappatura dei task pinned al display corrente dopo il riavvio (ff5352f)

### 📚 Documentation

- Chiarimento di electron-rebuild vs npm rebuild per app vs test ABI (2)
- Documentazione del timer live e della sezione In corso (283834e)
- Aggiunta del report di attività sessione per la funzionalità timer (5b8a6b7)
- Aggiunta delle funzionalità mancanti e riscrittura della guida all'uso nei README (7cd60e7)
- Aggiunta delle funzionalità mancanti a CLAUDE.md e entrambi i README (1835648)
- Collegamento degli ADR dell'architettura decisionale dal README (9886e89)
- Chiarimento di electron-rebuild vs npm rebuild per app vs test ABI (568c484)
- Aggiunta degli ADR per canvas, CJS e miscela 70/30 AI/meccanica (5613877)
- Aggiunta della politica di sicurezza (087b16f)

### 🔧 Maintenance

- Aggiunta del workflow di generazione changelog AI (5)
- Disabilitazione di husky nel passaggio di commit del badge CI (e70ed8d)
- Aggiunta del trigger workflow_dispatch a CI (dd0f5e5)
- Aggiornamento di package-lock.json (83b55a3)
- Aggiunta del workflow di revisione PR AI con fallback multi-provider (8e45527)
- Aggiornamento dei badge (749ef94)
- Aggiunta del gancio pre-commit con husky e lint-staged (d071ac6)
- Aggiunta dello script electron-rebuild postinstall (0ea23b4)
- Aggiunta della dipendenza @electron/rebuild come dev dependency (b58496c)
- Aggiornamento dei badge (1c2b21d)
- Aggiornamento dei badge (dfd3416)
- Aggiunta del conteggio test dinamico e dei badge di copertura (e886f78)
- Aggiornamento del modello OpenAI a gpt-4.1-nano e aumento max_tokens (001ea67)
- Aggiunta del passaggio di copertura al workflow CI e badge di copertura al README (67677f8)
- Estrazione della costante ONE_DAY_MS per sostituire il numero magico 24 \* 3600000 (7b45300)
- Traduzione dei commenti inline in inglese in main.js (633192c)
- Aggiunta del workflow GitHub Actions per lint e test (c091079)
- Limitazione del motore Node a <24 in package.json (a915526)
- Aggiunta dei metadati repository e correzione della licenza in package.json (8fdad2e)
- Cambio della licenza da MIT ad Apache 2.0 (7deb6e3)

### Other changes

- Mascheratura del token API Jira prima dell'invio della configurazione al renderer (8f21b0e)
- Aggiornamento della dipendenza electron da 30.x a 36.x (3cc169a)
- Sanificazione dei dati task esterni prima dell'iniezione prompt AI (a38e9b1)
- Validazione degli URL nel gestore link aperti contro SSRF (2e21d1e)
- Aggiunta di un timeout di 5 minuti al server HTTP OAuth (67005de)
- Aggiunta del parametro di stato CSRF al flusso OAuth Google (608caba)
- Riduzione della larghezza della striscia da 20px a 10px (6e3a090)
- Aggiunta dello schema colore scuro per controlli form nativi (789e461)
- Rimozione delle importazioni non utilizzate nel test google-calendar-auth (7d6b0d6)
- Aggiunta di 34 test che coprono le lacune nello store, AI, core e integrazioni (a8a3047)
- Correzioni di 11 errori ESLint in src e test (1817a37)
- Audit di copertura comprensivo — 80% a 90% stmts (c4cb356)
- Spostamento della chiave API da URL query param a intestazione x-goog-api-key (bc2e8ed)
- Limitazione delle autorizzazioni del file config.json a 0600 al salvataggio (93e9c41)

## What's Changed in v1.0.0

> First release of deadline-aura, featuring a comprehensive set of new features for task management and time tracking.

### ✨ New Features

- Add work shift countdown with configurable schedules (1f46b9a)
- Add "In Progress" section for active timer task (4e8bcbf)
- Add live play/stop timer with Google Calendar integration (74d0a3d)
- Add Jira favorites section with star toggle (2bc97c5)
- Add time logging to Google Calendar from task cards (650a243)
- Extend lookahead to 7 days minimum with Sunday alignment (8d3ebe3)
- Add language-aware clinical_note with actionability constraints (c43558f)
- Make AI notes collapsible via urgency bar toggle (efefbb4)
- Add bilingual support (IT/EN) with language selector (20e39d6)
- Split timeout into per-provider and total deadline (05fb898)
- Add edit button and inline edit form for local tasks (f8009fe)
- Add clinical note, stress forecast and burnout early warning (568e576)
- Add personal task CRUD with quick-add form and post-it support (06677dd)
- Reserve work area via X11 strut to prevent strip overlap (bfd9f5a)
- Use event start time for calendar agenda display (77b9f84)
- Dynamic agenda item count based on available space (a8a6b9b)
- Per-display visibility and broadcast pinned tasks (7869063)
- Sort calendar events chronologically with all-day first (9645a0b)
- Add clinical-grade cognitive load scoring prompt (09a8b86)
- Add systemd user service and install script (55d5a3d)

### 🐛 Bug Fixes

- Enforce coverage thresholds and document SHA-256 intent (#4)
- Audit remediation — security and code quality fixes (#3)
- Apply audit remediation — 11 fixes pre-conference (#1)
- Upgrade canvas 2.x to 3.x to fix black wallpaper (c132844)
- Validate loaded config with Zod schema before use (b7d8d3b)
- Cache provider instances to preserve key rotation state (6f01cbf)
- Move hardcoded Italian strings in burnout-detector to locale files (d94584a)
- Add rowid tiebreaker to getLatestAiCacheResponse query (16563cf)
- Use far-future dates in normalizeEvent tests (5e5b4fa)
- Make time-log button reusable with temporary feedback (a72dfcb)
- Log sync-now errors from daemon result (76c5be4)
- Force Firefox for external links with browser fallback chain (cd4083c)
- Use event start time instead of end time for countdown (b43e38e)
- Prevent unwanted auto-show on single monitor and fix strip color (15649af)
- Guard runUpdateCycle against concurrent executions (7f20861)
- Remove unimplemented markDone from contextBridge API (e2a3d23)
- Use shell.openExternal for link opening instead of hardcoded firefox (bceb18f)
- Resolve 6 ESLint errors in main.js (13168c1)
- Show project key instead of internal jira ID in header (9fd402a)
- Increase text opacity for better readability (214f01b)
- Improve mental load label visibility (035bd2c)
- Truncate long task titles in urgency section (7dbbde6)
- Wait for webContents load before sending updates (d69532a)
- Realistic psychological load scoring (3b0a974)
- Cursor-based pagination and remove lookahead filter (49eb7ad)
- Remap pinned tasks to current display after reboot (ff5352f)
- Robust AI score mapping and missing stress fallback (6c2f1a5)

### 📚 Documentation

- Clarify electron-rebuild vs npm rebuild for app vs test ABI (#2)
- Document live timer and In Progress section (283834e)
- Add session activity report for timer feature (5b8a6b7)
- Add missing features and rewrite usage guide in READMEs (7cd60e7)
- Add missing features to CLAUDE.md and both READMEs (1835648)
- Link architecture decision records from README (9886e89)
- Clarify electron-rebuild vs npm rebuild for app vs test ABI (568c484)
- Add ADRs for canvas, CJS, and 70/30 AI/mechanical blend (5613877)
- Add security policy (087b16f)

### 🔧 Maintenance

- Normalize channel names to namespace:action convention (c4f04c1)
- Deduplicate getLookaheadEnd between engine and google-calendar (5356249)
- Replace magic numbers with named constants (c01bf16)
- Extract X11 display utilities to core/display-controller.js (7f0f6fa)
- Extract pure functions to sidebar-utils.js and add tests (fc0f881)
- Replace hover edge-trigger with click-to-open strip (faf6bd6)
- Single BrowserWindow instead of per-display instances (0917a23)
- Replace urgency task list with mental load indicator (c91f338)
- Add AI changelog generator workflow (#5)
- Add AI PR review workflow with multi-provider fallback (8e45527)
- Update package-lock.json (83b55a3)
- Add pre-commit hook with husky and lint-staged (d071ac6)
- Add @electron/rebuild as dev dependency (b58496c)
- Add coverage step to CI workflow and coverage badge to README (67677f8)
- Extract ONE_DAY_MS constant to replace magic 24 \* 3600000 (7b45300)
- Translate inline comments to English in main.js (633192c)
- Add GitHub Actions workflow for lint and test (c091079)
- Cap Node engine to <24 in package.json (a915526)
- Add repository metadata and fix license in package.json (8fdad2e)
- Switch license from MIT to Apache 2.0 (7deb6e3)
- Mask Jira API token before sending config to renderer (8f21b0e)
- Bump electron from 30.x to 36.x (3cc169a)
- Sanitize external task data before AI prompt injection (a38e9b1)
- Validate URLs in open-link handler against SSRF (2e21d1e)
- Add 5-minute timeout to OAuth HTTP server (67005de)
- Add CSRF state parameter to Google OAuth flow (608caba)
- Halve strip width from 20px to 10px (6e3a090)
- Add dark color-scheme for native form controls (789e461)
- Remove unused imports in google-calendar-auth test (7d6b0d6)
- Add 34 tests covering gaps in store, ai, core, and integrations (a8a3047)
- Fix 11 ESLint errors across src and tests (1817a37)
- Move API key from URL query param to x-goog-api-key header (bc2e8ed)
- Restrict config.json permissions to 0600 on save (93e9c41)
