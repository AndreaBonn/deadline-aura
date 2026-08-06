# 002 — Source Outlook via feed ICS pubblicato

## Obiettivo

Aggiungere una source calendario `outlook`, alimentata dal feed ICS che Outlook/Microsoft 365
espone tramite "Pubblica un calendario", configurabile esclusivamente dalle impostazioni della UI.
Gli eventi devono essere indistinguibili da quelli Google per il resto della pipeline: motore di
pressione, scoring AI, wallpaper, post-it e burnout detector non vanno modificati nella logica.

Il vincolo di configurazione da UI nasce dalla distribuzione: l'app viene installata da .deb e
ogni utente deve poter inserire il proprio feed senza toccare file di ambiente.

## Definition of Done

- Con `sources.outlook.enabled = true` e un URL valido, `sync()` ritorna un conteggio positivo e
  le righe compaiono in `tasks` con `source = 'outlook'`.
- L'URL non raggiunge mai il renderer in chiaro e sopravvive a un salvataggio delle impostazioni
  in cui il campo non viene ritoccato.
- Un evento ricorrente settimanale produce una riga per occorrenza dentro la finestra di
  lookahead, con id stabile tra due sync consecutivi.
- Un'occorrenza cancellata (EXDATE) non compare; una spostata (RECURRENCE-ID) compare con
  l'orario nuovo.
- Un evento Outlook conta come evento di calendario in `core/deadline-engine.js` e in
  `ai/prompt.js`, non come voce di backlog.
- La migrazione del CHECK su `source` non perde righe ed è idempotente al secondo avvio.
- `npm run lint` e `npm test` verdi.

## Assunzioni

- Il feed è pubblicato con permesso "Tutti i dettagli". Decisione dell'utente: si procede senza
  verifica preliminare del feed. Con "Solo disponibilità" i titoli arrivano come `Busy` e la
  mappatura di priorità perde senso, quindi il parser rileva il caso e lo segnala con un warning
  esplicito al primo sync, invece di degradare in silenzio.
- Gli eventi Outlook vanno allo scoring AI con i titoli in chiaro, esattamente come quelli Google.
  Decisione dell'utente, presa sapendo che i titoli raggiungono i provider LLM configurati.
  Nessun flag di redazione da implementare.
- ICS è read-only: la scrittura di eventi resta esclusiva di Google Calendar.
- Un solo feed per utente in questa versione.
- Il polling lato Microsoft aggiorna il feed ogni 1-4 ore, fino a 24 nei casi peggiori.

## Approccio

### ADR-1 — Parser: dipendenza `ical.js` (Mozilla)

Le riunioni aziendali sono in larga parte ricorrenti, quindi servono espansione RRULE, VTIMEZONE,
line folding RFC 5545, EXDATE e RECURRENCE-ID. Un parser scritto in casa sbaglia in silenzio, e in
questo prodotto un errore di parsing non è cosmetico: produce pressione psicologica calcolata su
eventi che non esistono, o che esistono e mancano.

Scelto `ical.js` invece di `node-ical`: è il motore di Thunderbird, ha zero dipendenze runtime
(rilevante per un progetto che ne ha cinque e per la dimensione del .deb) e risolve VTIMEZONE
internamente. Costa un adapter di circa 150 righe, che è codice di policy e non di grammatica.

### ADR-2 — Confine: parser puro separato dall'I/O

- `core/ics-parser.js` — puro, nessuna rete: da testo ICS a occorrenze di dominio.
- `integrations/outlook.js` — solo I/O e policy: fetch, retry, mappatura sul record dell'app.

I casi che rompono davvero (DST, serie con eccezione) si testano solo con file `.ics` reali come
fixture. Se il parser vive dentro l'integrazione, ogni test di ricorrenza richiede un mock di rete
e nessuno li scriverà.

### ADR-3 — Hardening del fetch

L'URL arriva da input utente e viene scaricato dal main process. Vincoli su tre strati:

1. Schema `https:` obbligatorio in zod, con `webcal://` normalizzato (Outlook lo propone così).
2. Nel transport: rivalidazione prima del fetch, `redirect: 'manual'` con massimo 3 hop e
   rivalidazione a ogni salto, blocco di loopback e IP privati, `AbortSignal.timeout`, lettura a
   stream con abort oltre 5 MB.
3. Nel parser: cicli e istanze limitati, nessuna ricorsione non vincolata.

Scartata l'allowlist di host Microsoft proposta in fase di pianificazione: l'URL è arbitrario per
design (l'utente può voler puntare a un altro provider ICS) e in un'app desktop mono-utente
un'allowlist non protegge da nulla che il blocco degli IP privati non copra già.

### ADR-4 — Confini della source

- `getUpcomingCalendarEvents` (meeting dock, passivo) include `outlook`: escluderla farebbe
  mostrare al dock un "prossimo evento" falso, danno peggiore della staleness.
- `getUpcomingMeetings` (flyby, che apre una finestra a schermo) resta su `gcal`, con opt-in
  esplicito e default disattivato. Con la latenza del feed, il flyby può scattare su una riunione
  già spostata.

## Sub-task

1. [ ] Fixture ICS sintetiche che coprono i campi attesi (PRIORITY, X-MICROSOFT-CDO-IMPORTANCE,
       CATEGORIES, link Teams, VTIMEZONE) più il caso degradato a soli `Busy`, con rilevamento e
       warning esplicito (45 min)
2. [ ] Aggiunta dipendenza `ical.js`, verifica che non trascini deps e che entri in `build.files` (30 min)
3. [ ] `core/ics-parser.js`: parsing ed espansione ricorrenze in finestra, con warning invece di
       throw sui VEVENT illeggibili (90 min)
4. [ ] Test parser: EXDATE, RECURRENCE-ID, all-day, evento a cavallo di DST, feed vuoto, feed
       malformato (60 min)
5. [ ] `integrations/outlook.js`: fetch con hardening ADR-3, retry con backoff, normalizzazione
       con id `outlook_<hash(UID)>_<startEpochUTC>` e mappatura priorità (105 min)
6. [ ] Config: blocco `sources.outlook` in `config/schema.js` e `config/defaults.js`, opzionale
       per non rompere le config esistenti; `ics_url` in `config/secret-masking.js` (60 min)
7. [ ] Migrazione DB 008 sul pattern 006/007, con i tre fix di robustezza (vedi Rischi) (60 min)
8. [ ] Cross-cutting: costante condivisa `CALENDAR_SOURCES` applicata a
       `core/deadline-engine.js:140`, `ai/prompt.js:87`, `store/db.js:267`,
       `core/wallpaper-renderer.js:210`, `core/postit-renderer.js:49`, `renderer/overlay.js:31` (60 min)
9. [ ] `core/sync-daemon.js`: quarto ramo di fetch e upsert (45 min)
10. [ ] UI: terzo gruppo campi in `renderSorgenti()` con `createSecretInput` per l'URL, più
        chiavi i18n it/en con hint sulla latenza del feed (90 min)
11. [ ] Sync end-to-end sul feed reale, secondo sync senza duplicati, lint e test (75 min)

Stima netta circa 12 ore, con buffer 14-15, cioè due giornate piene. Se il task 1 rivela un feed
a sola disponibilità, il piano torna in discussione prima di procedere.

## File da modificare

| File                                                                                              | Tipo     | Motivo                                                       |
| ------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `core/ics-parser.js`                                                                              | nuovo    | Parsing ed espansione ricorrenze, puro e testabile a fixture |
| `integrations/outlook.js`                                                                         | nuovo    | Fetch del feed, hardening, normalizzazione                   |
| `core/calendar-sources.js`                                                                        | nuovo    | Costante condivisa, evita sei letterali `'gcal'` sparsi      |
| `test/core/ics-parser.test.js`, `test/integrations/outlook.test.js`                               | nuovo    | Copertura parser e fetch                                     |
| `test/fixtures/outlook-sample.ics`                                                                | nuovo    | Fixture anonimizzata dal feed reale                          |
| `config/schema.js`, `config/defaults.js`                                                          | modifica | Blocco `outlook`                                             |
| `config/secret-masking.js`                                                                        | modifica | `ics_url` mascherato e ripristinato                          |
| `store/db.js`                                                                                     | modifica | Migrazione 008, query del dock                               |
| `core/sync-daemon.js`                                                                             | modifica | Registrazione della source                                   |
| `core/deadline-engine.js`                                                                         | modifica | `calendarCount` su `CALENDAR_SOURCES`                        |
| `ai/prompt.js`                                                                                    | modifica | Classificazione come evento calendario                       |
| `core/wallpaper-renderer.js`, `core/postit-renderer.js`                                           | modifica | Badge ed estrazione codice                                   |
| `renderer/settings.js`, `renderer/sidebar.js`, `renderer/sidebar-utils.js`, `renderer/overlay.js` | modifica | Configurazione e resa                                        |
| `i18n/locales/it.json`, `i18n/locales/en.json`                                                    | modifica | Chiavi nuove                                                 |
| `package.json`                                                                                    | modifica | Dipendenza `ical.js`                                         |

## Rischi

| Rischio                                                | Impatto                                                                               | Mitigazione                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Feed pubblicato a sola disponibilità                   | Titoli inutilizzabili, scoring cieco                                                  | Task 1 bloccante prima di scrivere codice                                                   |
| Espansione ricorrenze errata                           | Riunioni fantasma o mancanti, pressione falsa                                         | `ical.js` invece di parser proprio, fixture reali                                           |
| Id instabile tra sync                                  | `markStale` cancella e reinserisce ogni 5 minuti, gli score AI si perdono             | Id da hash(UID) + start epoch, test su due sync consecutivi                                 |
| `sql.includes('outlook')` come check di idempotenza    | Falso positivo se la stringa compare in un altro CHECK, migrazione saltata per sempre | Estrarre con regex il solo CHECK di `source` e testare l'appartenenza a quella lista        |
| `rebuildTasksTable` senza transazione esplicita        | Crash tra DROP e RENAME lascia il DB senza `tasks`                                    | Avvolgere in `database.transaction`; lo snapshot automatico esistente resta la seconda rete |
| `CREATE TABLE IF NOT EXISTS tasks_new`                 | Un `tasks_new` residuo da un rebuild fallito viene riusato con lo schema vecchio      | `DROP TABLE IF EXISTS tasks_new` prima della creazione                                      |
| Titoli da terzi nel DOM                                | XSS store-based: chi invita l'utente a un evento controlla quel testo                 | Verificare che la sidebar usi `textContent` e non concatenazione HTML                       |
| Titoli da terzi nel prompt LLM                         | Prompt injection che falsa lo scoring                                                 | Delimitatori espliciti, troncamento, rimozione dei caratteri di controllo                   |
| URL nei log                                            | Il segreto finisce in file di testo                                                   | Loggare solo `new URL(url).hostname`, mai l'URL intero                                      |
| `renderer/settings.js` e `store/db.js` oltre 300 righe | Violazione dello standard mentre si aggiunge la source                                | Verifica finale, e scomposizione di `renderSorgenti` nello stesso commit se sfora           |

## Criteri di successo

`node core/sync-daemon.js` sul feed reale stampa un conteggio coerente con gli eventi visibili in
Outlook nella finestra di lookahead. Un secondo lancio consecutivo lascia invariato
`SELECT count(*) FROM tasks WHERE source = 'outlook'`. Un DB pre-esistente si apre due volte senza
errori di CHECK. Il salvataggio delle impostazioni senza toccare il campo URL conserva il valore
reale su disco. Lint e suite di test verdi.
