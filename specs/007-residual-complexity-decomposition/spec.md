# 007 - Scomposizione della complessità residua: requisiti

Stato: proposto, 2026-11-20. Fonte: Research dell'orchestratore e del `planner` sul commit `9c315b1`.

## Obiettivo

Le funzioni di produzione ancora troppo lunghe o ramificate vengono scomposte dove la scomposizione porta un guadagno nominabile (duplicazione tolta, logica pura testabile da sola, difetto reso visibile), con test comportamentali scritti prima. Due difetti di produzione trovati nella Research, più uno trovato dal `planner`, vengono corretti prima del refactor del modulo che li contiene. Lo scopo non è avere file piccoli: dove spezzare non guadagna niente la funzione resta com'è, e il motivo è scritto in `plan.md` § Candidati scartati.

## Decisioni dell'utente (vincoli)

- D1: `config/secret-masking.js` è fuori scope e non si apre (permesso negato).
- D2: gli helper estratti da `buildScoringPrompt` e `parseAiResponse` restano in `ai/prompt.js`, perché `PROMPT_VERSION` è lo sha256 di quel file ed entra nell'hash della cache AI. Il refactor invalida la cache una volta, ed è voluto.
- D3: i difetti di produzione si correggono in commit `fix(...)` separati, con un test di regressione visto rosso prima del fix, prima del refactor dello stesso modulo.
- D4: il renderer non fa `require`: la copia `renderer/shift-countdown.js` di `core/work-shift.js` resta. Si estrae il calcolo puro dello stato e lo si pinna con un test di parità contro `core.getShiftStatus`.
- D5: per ogni scomposizione, prima i test di caratterizzazione visti fallire con un mutante, poi il refactor, poi suite intera e `npx eslint .` verdi. Un commit per cambiamento logico, direttamente su `main`, push escluso.

## Requisiti

- R1: con la cache AI valida, i punteggi `per_event` si applicano ai task che erano stati punteggiati, riconosciuti per id e non per posizione nella lista attiva; un task punteggiato che non è più attivo viene saltato; un task attivo che non era nella lista punteggiata resta senza punteggio AI fino al ricalcolo.
- R2: una voce di cache AI scritta prima di questa modifica (senza l'elenco degli id punteggiati) non viene applicata: conta come cache mancante e il punteggio si ricalcola.
- R3: nell'agenda "prossime 24h" del wallpaper un task locale mostra il badge della sorgente locale (`wallpaper.local_badge`), non `JIRA`; una sorgente sconosciuta non mostra alcun badge e il titolo parte dove partirebbe il badge. **Stato 2026-11-20**: la prima metà (badge locale) è fatta in `fe4442c`; per la sorgente sconosciuta il codice tiene il badge JIRA finché l'utente non decide (domanda aperta nel report).
- R4: `ai.temperature` uguale a 0, valore ammesso dallo schema (`config/schema.js:67`) e dallo slider delle Impostazioni, arriva al provider come 0 invece di diventare 0.15.
- R5: `core/deadline-engine.js` passa il blocco dimensionale di `eslint.config.js` (esce dalla lista `ignores`) con risultati di `computeTaskUrgency`, `describeMechanicalScore` e `computeGlobalScore` identici a prima per ogni ramo; la formula del peso del task esiste in un punto solo.
- R6: `core/sync-daemon.js` esce dalla lista `ignores`; `sync()` si legge come recupero, salvataggio per sorgente e scoring, con le regole di salvataggio di ogni sorgente identiche a oggi, compresa la dipendenza di Google Tasks da `sources.google_calendar.enabled` e il ramo Jira parziale.
- R7: `renderer/shift-countdown.js` espone `shiftComputeStatus(now, config)` puro, uguale a `core.getShiftStatus(config, now)` su `working`, `label` e `remainingMs` per ogni istante della matrice di parità; `updateShiftCountdown` contiene solo lettura e scrittura del DOM; il file esce dalla lista `ignores` e la sua copertura righe passa da circa 70% ad almeno 95%.
- R8: `buildScoringPrompt` produce un prompt identico byte per byte al golden registrato sul commit di partenza, in italiano e in inglese; `parseAiResponse` restituisce oggetti identici a prima sulla matrice di caratterizzazione; ogni helper estratto sta in `ai/prompt.js` e un test lo vincola (D2).
- R9: `core/wallpaper-agenda.js` esce dalla lista `ignores`; la scelta del badge per sorgente e il formato dell'ora sono funzioni pure testate.
- R10: a fine lavoro `npm test`, `npm run test:coverage` (soglie invariate) e `npx eslint .` sono verdi, la lista `ignores` del blocco dimensionale ha perso almeno 4 voci e non ne ha guadagnata nessuna.
