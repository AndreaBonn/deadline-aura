## Versione 1.7.1

> La release v1.7.1 corregge il blocco degli indirizzi IPv6 privati, l'interruzione della sincronizzazione Jira su un'istanza limitata e le etichette dei post-it nell'overlay.

### Correzioni

- Gli indirizzi IPv6 privati (loopback, link-local, unique-local, IPv4-mapped) e `localhost.` con il punto finale vengono bloccati, sia per i link esterni sia per il feed Outlook, con un controllo unico in `core/url-safety.js` (5097971)
- Un'istanza Jira che risponde 429 a ogni tentativo non blocca più la sincronizzazione delle altre istanze (3c58185)
- I post-it dell'overlay mostrano la stessa etichetta dello sfondo invece dell'id grezzo (5097971)

### Manutenzione

- Validazione dei payload IPC di attività locali e calendario spostata in moduli puri, con gli stessi codici di errore (5097971)
- Logica pura di quattro script del renderer esportata per i test; copertura portata al 95% e test deboli o tautologici riscritti (529494c)

## Versione 1.7.0

> La release v1.7.0 sostituisce l'etichetta del carico mentale sullo sfondo con una fascia che mostra i limiti di utilizzo di Claude e Codex, alimentata da una cattura della statusline di Claude Code installabile dalle impostazioni.

### Nuove funzionalità

- Fascia dei limiti AI sullo sfondo, al posto dell'etichetta del carico mentale, estesa su tutta la larghezza e ridisegnata quando cambiano i valori (ae47f2a, 83a66a5, 30e467b, 7476af2)
- Lettura dei limiti Codex dai log di sessione locali (f760c6e)
- Lettura dei limiti Claude dagli snapshot della cattura, con rilevamento degli account (8906a6c, 8196d4a, 1f8a932)
- Script di cattura della statusline di Claude Code, con installazione e rimozione idempotenti e una copia stabile degli script eseguita senza shell (18313b4, be58548, 457ef8a)
- Installazione e rimozione della cattura dalla finestra delle impostazioni (88d47e8)
- Opzione `wallpaper.show_ai_usage` per mostrare o nascondere la fascia (3e97cb7)

### Correzioni

- La statusLine originale non si perde più se l'installazione della cattura si interrompe (0873505)
- Il layout di settings.json resta intatto fra installazione e rimozione (3803fbe)
- Log delle catene di comandi non sicure e backup delle impostazioni tenuti separati (73d2f02)
- Percentuali di fallback arrotondate per eccesso a metà, come nella fascia (aad464c)
- Scelta dei rollout Codex più recenti per data di modifica, non per ordine di lettura della directory (08d418c)
- Avviso quando uno snapshot Claude esiste ma non è leggibile (6a37b52)
- Stato della cattura mostrato come sconosciuto invece che "non attiva" quando non è determinabile (1b4faad)
- Contrasto del testo dei controlli della cattura portato a WCAG AA (f1b2c59)

### Build

- Script di cattura distribuiti fuori dall'asar e dipendenza da python3 nel pacchetto .deb (b88aca4)

### Manutenzione

- Disegno della fascia e dell'agenda giornaliera separati in moduli propri, sotto i limiti dimensionali (38b2837, 69e21c6, c658640, ee914e7)
- Confronto nativo dei buffer di pixel nei test della fascia (8a24805)
- Orologio fissato nei test di fetchEvents di Outlook e spawnSync simulato nel test di cooldown del notifier (f0e47b3, 770997e)
- Prettier applicato ai file disallineati, cache Python e spec locali ignorate da git (9f9da86, dd16335, de04b20)

### Documentazione

- Guida utente passo passo in inglese e italiano (fee14d1)
- Documentazione della fascia dei limiti Claude e Codex e della cattura della statusline (7d8760b, 37be303)
- Piano, task e decisioni della fascia dei limiti AI (2cffb1f, 90ac359, 5979727, 5f2378c)
- Rimozione delle emoji decorative e dei blocchi duplicati dal changelog (40a7d20)

## Versione 1.6.0

> La release v1.6.0 aggiunge Outlook come seconda sorgente di calendario, letta dal feed ICS pubblicato e configurabile dalle impostazioni.

### Nuove funzionalità

- Lettura del calendario Outlook dal feed ICS pubblicato, con espansione delle riunioni ricorrenti (2e56dd1, 9ddd558)
- Configurazione dell'URL del feed dalle impostazioni, trattato come segreto al pari degli altri token (d1ea5ed, 7416189)
- Comparsa degli eventi Outlook nel dock delle riunioni e in una sezione dedicata della barra laterale (10be3e2, 7416189)
- Conteggio degli eventi Outlook come impegni di calendario nel motore di pressione e nello scoring AI, non come backlog (c3caca9)

### Correzioni

- Esclusione delle occorrenze spostate fuori dalla finestra da un'eccezione della serie (e313db3)
- Identificativi degli eventi ricorrenti ancorati alla data di calendario invece che a un timestamp, per non perdere i punteggi AI al cambio di fuso orario (e313db3)
- Innalzamento del limite di iterazioni sull'espansione delle serie, che poteva esaurirsi prima di raggiungere la finestra (e313db3)

### Manutenzione

- Aggiunta della dipendenza ical.js per il parsing iCalendar (113d6c5)
- Dichiarazione di AbortSignal e Response fra i globali Node nella configurazione ESLint (7fb0e48)
- Migrazione 008 del database eseguita dentro una transazione esplicita (10be3e2)

### Documentazione

- Registrazione del piano e delle decisioni architetturali della sorgente Outlook (fa7d648)

## Versione 1.5.0

> La release v1.5.0 rende gestibile l'avviso delle riunioni direttamente dal flyby.

### Nuove funzionalità

- Aggiunta del pulsante sul gatto per posticipare o disattivare gli avvisi delle riunioni (8482c7a)

## Versione 1.4.0

> La release v1.4.0 cambia il protagonista del flyby e irrobustisce i test.

### Nuove funzionalità

- Sostituzione del piccione con un gatto pixel art e banner a gomitolo (621aac6)

### Correzioni

- Segnalazione del punteggio come puramente meccanico quando non ci sono task (8786603)

### Manutenzione

- Isolamento dei test del daemon e del motore dalle integrazioni reali (90233de)
- Allineamento delle asserzioni di errore di Google Calendar ai messaggi delle impostazioni (9c64e17)

## Versione 1.3.1

> La release v1.3.1 porta le credenziali OAuth nelle impostazioni e corregge il caricamento degli sfondi nel pacchetto.

### Nuove funzionalità

- Configurazione delle credenziali OAuth di Google dall'interfaccia (352ecf4)

### Correzioni

- Caricamento delle immagini di sfondo da app.asar.unpacked (8bda854)

## Versione 1.3.0

> La release v1.3.0 introduce il pacchetto .deb installabile, Google Tasks come sorgente sempre attiva e il flyby animato prima delle riunioni.

### Nuove funzionalità

- Costruzione del pacchetto .deb installabile e automazione delle release (68b060f)
- Integrazione di Google Tasks come sorgente dati sempre attiva (472f49f)
- Notifica animata prima delle riunioni, su tutti i display e in ciclo fino all'inizio (ee3fd14, 0bc947f, 4d0e5ac)
- Pannello di spiegazione del punteggio con dettaglio AI e meccanico (07f3154)
- Chiavi API dei provider AI configurabili dalle impostazioni (a58161d)
- Snapshot del database prima di ogni migrazione distruttiva (641836a)
- Pulsante per chiudere il riquadro riunione su ciascun display (18cb81d)
- Permanenza dei task appuntati scaduti sul desktop con evidenziazione rossa (9130919)
- Icona applicazione dedicata nel dock di GNOME (bf5be52)

### Correzioni

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

### Documentazione

- Documentazione dell'installazione da .deb con collegamento all'ultima release (6549ec5)
- Sezione donazioni e pulsante GitHub Sponsor nel README (93ff833)

### Stile

- Sostituzione degli sfondi astratti con paesaggi naturalistici (b912b2e)
- Riequilibrio del prompt di scoring da tono clinico a tono di accompagnamento (c32543c)

## Versione 1.2.0

> La release v1.2.0 separa gli intervalli di sync, dà alla meeting dock una tempistica propria e mostra nella sidebar lo stato in tempo reale degli eventi di Google Calendar.

### Nuove funzionalità

- Estrazione dei link di Teams e Zoom dagli eventi di Google Calendar nel dock delle riunioni (7ceb91a)
- Introduzione della sincronizzazione differenziata, tempistica del dock delle riunioni e stati degli eventi di Google Calendar (feeba91)

### Correzioni

- Prevenzione dell'overflow di contenuto a qualsiasi larghezza della barra laterale (58f2734)
- Commutazione dei diagrammi Mermaid su tema neutro per una migliore leggibilità in modalità oscura (13285ae)
- Rimozione del tipo di finestra DOCK per preservare la trasparenza su GNOME (82d7a31)

### Documentazione

- Aggiunta di diagrammi Mermaid per l'architettura del sistema (023a29d)
- Aggiornamento del README con dock delle riunioni, stati degli eventi e intervalli di sincronizzazione (7f52e31)

### Manutenzione

- Aggiornamento di CHANGELOG.md per v1.1.0 [skip ci] (9c02c4d)
- Aggiornamento di CHANGELOG.en.md per v1.1.0 [skip ci] (c130f1f)
- Rimozione di docs/decisions dai file tracciati (f03022d)
- Rimozione di doc_progetto dal tracciamento e aggiunta a gitignore (089d5d4)
- Aggiornamento dei badge [skip ci] (98cc1c1)

## Versione 1.1.0

> La release v1.1.0 aggiunge la dock delle riunioni imminenti e toglie dal desktop i post-it dei task ormai scaduti.

### Nuove funzionalità

- Aggiunta della dock delle riunioni imminenti con collegamenti Meet cliccabili (aa37351)
- Aggiunta della funzione di auto-rimozione dei task obsoleti e del pulsante di rimozione nella sovrapposizione (9abd296)

### Correzioni

- Prevenzione dell'apertura automatica della sidebar dopo la chiusura manuale (af1c2e2)
- Prevenzione della marcatura come obsoleto in caso di errore di fetch e aggiunta della sincronizzazione all'avvio (fb6f87c)
- Sostituzione della finestra trasparente con sfondo opaco nella dock delle riunioni (7d8b023)
- Aggiornamento della procedura di aggiornamento dei badge per evitare conflitti (6d42acc)

### Documentazione

- Rinomina di DeadlineAura in Deadline Aura by Bonn (f44d202)
- Aggiunta di screenshot e correzione del conteggio delle tab delle impostazioni (f6a845e)

### Manutenzione

- Aggiornamento dei badge [skip ci] (05dbc93, e7380b7)
- Aggiornamento del file CHANGELOG.md per v1.0.0 e v1.1.0 [skip ci] (b0fc3aa, 226e598)
- Abilitazione della generazione del changelog in inglese (db5aa2a)

### Altre modifiche

- Visualizzazione della previsione dello stress come percentuale (8ee85ed)

## Versione 1.0.0

> Prima release di Deadline Aura: striscia di urgenza, wallpaper generato, sidebar dei task e sincronizzazione con Google Calendar e Jira.

### Nuove funzionalità

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

### Correzioni

- Correzione della soglia di copertura e documentazione SHA-256 (4)
- Correzione dei problemi di sicurezza e qualità del codice (3)
- Applicazione delle correzioni emerse dall'audit, 11 in tutto (1)
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

### Documentazione

- Chiarimento di electron-rebuild vs npm rebuild per app vs test ABI (2)
- Documentazione del timer live e della sezione In corso (283834e)
- Aggiunta del report di attività sessione per la funzionalità timer (5b8a6b7)
- Aggiunta delle funzionalità mancanti e riscrittura della guida all'uso nei README (7cd60e7)
- Aggiunta delle funzionalità mancanti a CLAUDE.md e entrambi i README (1835648)
- Collegamento degli ADR dell'architettura decisionale dal README (9886e89)
- Chiarimento di electron-rebuild vs npm rebuild per app vs test ABI (568c484)
- Aggiunta degli ADR per canvas, CJS e miscela 70/30 AI/meccanica (5613877)
- Aggiunta della politica di sicurezza (087b16f)

### Manutenzione

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

### Altre modifiche

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
- Audit della copertura, dall'80% al 90% degli statement (c4cb356)
- Spostamento della chiave API da URL query param a intestazione x-goog-api-key (bc2e8ed)
- Limitazione delle autorizzazioni del file config.json a 0600 al salvataggio (93e9c41)
