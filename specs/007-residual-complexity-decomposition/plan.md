# 007 - Scomposizione della complessità residua: piano

Requisiti in `spec.md`, task in `tasks.md`. Commit di partenza `9c315b1`: 161 file di test, 2367 test verdi, righe 97,7%, rami 95,6%, suite in circa 24 s.

## Obiettivo

Correggere tre difetti di produzione e scomporre cinque moduli (`deadline-engine`, `sync-daemon`, `shift-countdown`, `prompt`, `wallpaper-agenda`) dove la scomposizione toglie duplicazione o rende testabile da sola una regola che oggi è mescolata a I/O, DOM o canvas. Comportamento identico in ogni ramo, salvo i tre fix.

## Definition of Done

- [ ] R1: Given due eventi `gcal` A (fra 2 h) e B (fra 3 h) punteggiati dall'AI con `per_event` `[{id:1, stress:9}, {id:2, stress:2}]`, When si aggiunge un task `local` L con scadenza fra 1 h e parte un secondo `sync()` con gli stessi eventi e cache valida, Then A ha `ai_stress` 9, B 2, L `null`, e il provider AI è stato chiamato una volta sola. Oggi L riceve 9 e A riceve 2 (i task persistenti vengono prima in `store/db.js:36`).
- [ ] R1: un id punteggiato che non è più attivo (evento passato, task chiuso) viene saltato senza scrivere su nessun altro task.
- [ ] R2: una riga di `ai_cache` con `response_json` senza `scored_task_ids` provoca una nuova chiamata al provider e una riga nuova con gli id.
- [ ] R3: `drawDailyAgenda` con un task `source: 'local'` disegna `PERS.` (it) prima del titolo; con `source: 'external'` disegna solo il titolo, nello stesso test in cui un evento `gcal` disegna `CAL`.
- [ ] R4: `scoreEvents` con `config.ai.temperature = 0` chiama `provider.score(prompt, { temperature: 0, ... })`.
- [ ] R5-R9: ogni file della fase, tolto dalla lista `ignores` di `eslint.config.js`, fa uscire `npx eslint <file>` con errori sul commit di partenza e senza errori a fine fase.
- [ ] R8: `test/fixtures/prompt/scoring-prompt-{it,en}.txt`, generati sul commit di partenza, sono uguali all'output di `buildScoringPrompt` a fine fase.
- [ ] R10: `npm test`, `npm run test:coverage`, `npx eslint .` verdi dopo ogni commit; numero di test mai in calo rispetto al commit precedente.
- [ ] Smoke manuale (`npm start`) a fine lavoro: countdown del turno nella sidebar coerente con l'ora in turno, prima del turno e fuori turno; agenda del wallpaper con un task personale entro 24 h che mostra `PERS.`; dopo l'aggiunta di un task personale e un sync con cache valida, nessun punteggio AI spostato su un task diverso (dettaglio spiegazione punteggio nella sidebar).
- [ ] Un commit per cambiamento logico su `main`, Conventional Commits in inglese, push non eseguito.

SIGNAL: riga `[ai] cache hit: <n> of <m> scored tasks still active` (nome e testo definitivi in `0ef25a3`) nello stdout di `npm start` (prodotta da T002) | atteso `n + k = m` e, dopo l'aggiunta di un task personale, il punteggio AI di quel task vuoto fino al ricalcolo | entro il primo sync dopo l'avvio con cache valida (intervallo `sync.data_interval_minutes`, default 10 minuti). Per R3, R4 e per i refactor nessun segnale runtime oltre allo smoke: app desktop senza telemetria.

## Assunzioni

- Commit diretti su `main` richiesti dall'utente (riferito dal chiamante). Push escluso.
- Node di sistema v24 per i test, come oggi (memoria di progetto: moduli nativi compilati per quell'ABI).
- Gli id punteggiati si salvano dentro `response_json` come campo `scored_task_ids`, senza migrazione. I lettori di `response_json` (`core/update-payload.js:23` legge `note`, `clinical_note`, `daily_breakdown`; `core/burnout-detector.js:19` legge i fattori cognitivi) ignorano campi in più. BASIS: inferred, letti i punti d'uso, da confermare con le loro suite in T002.
- Il fallback per voci di cache vecchie è il ricalcolo (R2): costa una chiamata AI dopo l'aggiornamento, la stessa che il refactor di `ai/prompt.js` provoca comunque cambiando `PROMPT_VERSION`.
- Testo del badge locale: `PERS.` in italiano, `PERSONAL` in inglese (la sidebar chiama la sezione "Personali" / "Personal"). Colore: grigio neutro `rgba(158, 158, 158, 0.5)`. Rivedibile senza toccare il piano.
- Sorgente sconosciuta nell'agenda: nessun badge. Le sorgenti scritte nel DB sono un insieme chiuso (`gcal`, `gtasks`, `jira`, `outlook`, `local`), quindi il ramo protegge solo da un dato corrotto; un badge inventato attribuirebbe il task a una sorgente che non è la sua, che è il difetto di oggi.
- Il golden del prompt si genera sul commit di partenza con orologio finto fisso (`vi.setSystemTime`), quindi non dipende dall'ora della generazione.
- `core.getShiftStatus` non ha consumatori di produzione (BASIS: measured, grep su tutto il repo esclusi i test: solo definizione ed export, `main.js:71` importa solo `cleanupWorkShiftConfig`). Resta com'è e fa da oracolo per la parità.

## Disambiguazione

Nessuna scelta architetturale aperta: D1-D5 fissano le tre che c'erano. Due scelte implementative, prese e dichiarate:

- Dove salvare gli id punteggiati (R1). Opzioni: campo nel JSON della risposta; colonna nuova in `ai_cache`; hash calcolato sulla lista attiva invece che sui task scaricati. Scelta: campo nel JSON. La colonna chiede una migrazione per un array letto in un punto solo. L'hash sulla lista attiva farebbe ricalcolare ogni volta che un evento esce dalla finestra (più chiamate AI a pagamento) e lascerebbe comunque la corrispondenza affidata all'ordine di `getActiveTasks`, che a parità di `due_at` e `priority` non è garantito.
- Contratto di `applyAiScores` (R1): resta `applyAiScores(aiResult, tasks)` con indice `event.id - 1` su `tasks`; su cache hit `tasks` si costruisce dagli id salvati (`id -> task attivo`, oppure `null` se non più attivo). Un `null` si salta senza warning, l'indice fuori dai limiti tiene il warning di oggi. Così i test esistenti di `test/core/sync-daemon.test.js` restano validi.

## Anchor e vincoli

- Vincolo: il blocco dimensionale di `eslint.config.js` (30 righe per funzione, profondità 3) e la regola del suo commento, "la lista si accorcia, non cresce". È il gate dei task di refactor.
- Anchor, non vincolo: la forma attuale dell'hash della cache (task scaricati, non lista attiva). Resta perché cambiarla costa chiamate AI, non perché sia intoccabile.
- Anchor: `ai/prompt.js` nella lista `ignores`. Resta perché il template letterale di circa 90 righe è una sola unità di testo e spezzarlo in pezzi concatenati peggiora la lettura del prompt; gli helper estratti si leggono comunque in funzioni brevi.

## Complessità introdotta

- Campo `task_ids` (nel piano originale `scored_task_ids`) nella voce di cache AI -> R1, R2 | più semplice scartata: applicare per indice come oggi, perché è il difetto.
- Riga di log `[ai] cache hit: ...` -> SIGNAL | più semplice scartata: nessun log, perché senza la riga un punteggio spostato non si vede da fuori.
- File golden `test/fixtures/prompt/scoring-prompt-{it,en}.txt` -> R8 | più semplice scartata: `toMatchSnapshot`, perché il repo non usa snapshot e `vitest -u` li rigenera in silenzio; un'asserzione su frammenti del prompt non garantisce l'identità byte per byte che serve a dire "refactor senza effetto sul prompt".
- Nessun modulo, dipendenza o astrazione nuova: gli helper estratti sono funzioni private nello stesso file.

## Operazioni

- nessuna, perché è un'app desktop e il rilascio normale (`.deb`) porta il cambiamento; la cache AI vecchia si invalida da sola (R2 e `PROMPT_VERSION`), senza purge manuale.

## Fasi

Ogni fase lascia l'app usabile e si può fermare lì. Ordine per valore.

1. **Fix di produzione** (T001-T005): R1-R4. Valore più alto: R1 assegna punteggi di stress al task sbagliato senza che niente lo segnali.
2. **deadline-engine** (T010-T013): R5. Il calcolo del punteggio globale, con la formula del peso duplicata in due punti che possono divergere.
3. **sync-daemon** (T020-T022): R6. Dopo il fix, la funzione più ramificata del ciclo di sync.
4. **shift-countdown** (T030-T032): R7. Unico file renderer in coverage con copertura bassa, per via del DOM mescolato al calcolo.
5. **prompt** (T040-T042): R8. Valore di leggibilità; invalida la cache una volta.
6. **wallpaper-agenda** (T050): R9. Dopo T003 la scelta del badge diventa una funzione pura.
7. **Gate finali** (T060).

## Scomposizione per modulo (forma attesa, non vincolante sui nomi interni)

- `core/deadline-engine.js`: `taskWeight(task, priorityWeights)` (oggi righe 60 e 133); `scoredTask(task, fields)` per i tre ritorni di `computeTaskUrgency`; `emptyMechanicalDetail(reasonKey, oooCount)`; `weightedBase(active, weights)`; `amplifyByVolume(rawBase, active)`; `mechanicalReasonKey(...)`; `resolveAiScore(options)`; `describeAiScore(aiScore, computedAt)`, che unifica i due blocchi `aiBreakdown` (righe 240-256); risultato vuoto di `computeGlobalScore` in un helper.
- `core/sync-daemon.js`: `fetchJira(config)` che ritorna `{ issues, partialIssues }` invece della chiusura su `jiraPartialIssues`; `fetchAllSources(config, errors)`; una funzione per la regola di salvataggio di ogni sorgente, o una tabella dichiarativa `{ fetchedKey, source, errorSource, shouldPersist(fetched, config) }`, a scelta dell'esecutore purché le quattro condizioni restino leggibili accanto; `sync()` resta l'orchestrazione.
- `renderer/shift-countdown.js`: `shiftComputeStatus(now, config)` che ritorna `{ enabled, working, label, remainingMs }`; `shiftToMinuteSlots(slots)` per la mappatura duplicata in `shiftGetSlotsForDate`; `updateShiftCountdown` legge il DOM, chiama `shiftComputeStatus`, scrive. La regola di visualizzazione `label === 'off' || remainingMs <= 0 -> '--:--'` resta nel DOM glue: è presentazione, e il core la esprime con `formatted`.
- `ai/prompt.js`: `describeRawEvent(rawJson)` (il blocco `try` di righe 51-86), `formatEventLine(event, index)`, `splitBySchedule(events)`; `stripCodeFences(text)`, `clampScore(value)` (tre clamp 1-10 oggi), `normalizePerEvent`, `normalizeDailyBreakdown`, `normalizeCognitiveFactors`, `normalizeNote`. Tutti in `ai/prompt.js` (D2).
- `core/wallpaper-agenda.js`: costante `AGENDA_BADGES` per sorgente `{ labelKey, color }` creata una volta (oggi la mappa si ricrea per ogni evento, righe 70-75); `agendaBadge(source)` puro; `formatAgendaTime(timestamp)` puro; `drawAgendaHeader`, `drawAgendaRow`.

## Candidati scartati

| Candidato                                                           | Perché no                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/work-shift.js` `getShiftStatus` e `getSlotsForDate`           | Nessun consumatore di produzione (vedi Assunzioni): sono l'oracolo del test di parità. Rifattorizzare oracolo e copia nello stesso piano toglie il riferimento indipendente. Il fatto che lo stato del turno nel core sia usato solo dai test va segnalato all'utente, non rimosso (Modifiche Chirurgiche)                       |
| `core/postit-renderer.js` `renderPostit` (58)                       | Sequenza canvas lineare (ombra, sfondo, bordo, header, codice, countdown, titolo) senza rami di logica oltre a `isStale`/`countdown`; i pezzi derivati (`formatCountdown`, `extractCode`, `getPostitColor`) sono già funzioni testate. Spezzare = indirezione a guadagno nullo                                                   |
| `renderer/flyby.js` `play` (69)                                     | Coreografia temporale di `await sleep` + `aborted()`; fuori coverage; animazione e layout non verificabili in happy-dom (005, Zone non testabili). Nessun test possibile sui pezzi estratti                                                                                                                                      |
| `renderer/meeting-dock.js` `render` (64)                            | La logica è due filtri sui dismessi; il resto è markup. Il file accede al DOM a livello top, quindi rendere testabile il filtro chiede un file di script nuovo e una modifica a `meeting-dock.html` per una regola di 10 righe. Se serve una rete, la strada è un test di pagina happy-dom senza refactor, fuori da questo piano |
| `renderer/settings-sections.js` `createSourceStatusBox` (41)        | Costruzione DOM lineare con un `then`/`catch`; nessuna regola da isolare                                                                                                                                                                                                                                                         |
| `renderer/sidebar-ui.js` `createActionMenu` (44)                    | L'apri/chiudi dipende dallo stato di modulo `openActionMenu` condiviso col listener globale; estrarlo sposta lo stato condiviso senza toglierlo                                                                                                                                                                                  |
| `ai/provider-manager.js` `scoreEvents` (complessità 16)             | Ciclo di failover leggibile; la complessità viene dai default di config. L'unico difetto emerso (temperatura 0) si corregge in T004 senza scomporre                                                                                                                                                                              |
| `core/ai-usage-codex.js` `extractRateLimits` (13)                   | Tre lookup guardati in ordine di precedenza, già chiari; la complessità è conteggio di optional chaining                                                                                                                                                                                                                         |
| Template letterale di `buildScoringPrompt`                          | Il testo del prompt si legge e si rivede come un blocco; spezzarlo in concatenazioni peggiora la revisione del prompt (vedi Anchor)                                                                                                                                                                                              |
| Spostare gli helper di `ai/prompt.js` in un modulo `ai/prompt-*.js` | Vietato da D2: una modifica agli helper non invaliderebbe più la cache                                                                                                                                                                                                                                                           |
| `config/secret-masking.js` `restoreTokens` (32)                     | D1                                                                                                                                                                                                                                                                                                                               |

## Rischi e mitigazioni

- Poiché R1 cambia cosa si scrive in `ai_cache` (causa), un lettore che validi `response_json` in modo stretto potrebbe scartare la voce (rischio), con note e previsione di stress vuote nella sidebar (effetto, visibile subito). Mitigazione: T002 esegue le suite di `update-payload`, `update-cycle` e `burnout-*`; grep dei `JSON.parse(... response_json)` prima del commit.
- Poiché il test di R1 usa il DB reale in una HOME temporanea come `test/core/sync-daemon-scoring.test.js` (causa), uno stato lasciato da un altro test nello stesso file potrebbe far passare la cache per valida o no (rischio), con un test verde per la ragione sbagliata (effetto). Mitigazione: `beforeEach` che svuota `tasks`, `ai_cache`, `scores`, e asserzione sul numero di chiamate a `aiScorer.scoreTasks` (1) nello stesso test.
- Poiché gli script del renderer condividono lo scope globale della pagina (005), un helper nuovo in `shift-countdown.js` con un nome già usato altrove sovrascriverebbe in silenzio l'altro. Mitigazione: prefisso `shift`, e `test/renderer/script-globals-contract.test.js` nel `verify` di T031-T032.
- Poiché i test esistenti di `deadline-engine` controllano campi singoli (causa), un refactor potrebbe cambiare un campo non asserito, come `start_at` o `web_url` nei ritorni di bordo (rischio), con dati mancanti nella spiegazione del punteggio (effetto). Mitigazione: T010 asserisce gli oggetti interi con `toEqual` per ogni ramo, visti rossi con un mutante per ramo.
- Poiché `deadline-engine.js` è a 317 righe fisiche (causa), gli helper potrebbero spingerlo oltre `max-lines` 300 effettive (rischio), costringendo a uno split di file che 005 aveva scartato (effetto). Mitigazione: le duplicazioni tolte (tre ritorni, due blocchi `aiBreakdown`, due ritorni vuoti) valgono più righe di quelle aggiunte; se il conto non torna, si ferma e si riporta invece di spezzare il file.
- Poiché il golden del prompt è generato dal codice di partenza (causa), un difetto attuale del prompt diventa "atteso" (rischio). Accettato: R8 chiede identità, non correttezza del prompt.
- Il test esistente `draws the JIRA fallback badge for an unknown event source` (`test/core/wallpaper-agenda.test.js:56`) pinna il comportamento che D3(b) dichiara difettoso: T003 lo riscrive, non lo aggira. INTENT da riportare nel commit: il codice fa JIRA per ogni sorgente non mappata / il test si aspetta JIRA / l'utente ha dichiarato il fallback Jira sbagliato.

## Stima

Somma di `tasks.md`: circa 17,5 ore, 21 con il buffer del 20% (refactor su codice esistente, mutanti applicati a mano). Fase 1 circa 3,5 h; Fasi 2-3 circa 7 h; Fasi 4-6 circa 6,5 h; gate finali 0,5 h più lo smoke.

## Handoff

`tdd-guide` per T001-T050, blocchi di 2-4 task (Fase 1; T010-T013; T020-T022; T030-T032; T040-T042 + T050), con `[DELEGATE-CODEX]` ammesso perché il piano è fissato; T001-T005 vanno in-house se l'orchestratore preferisce tenere i fix vicini al ragionamento. `code-reviewer` a fine di ogni fase; `silent-failure-hunter` su T002 (nuovo ramo di skip nel cache hit). Smoke manuale di T060 all'orchestratore o all'utente.
