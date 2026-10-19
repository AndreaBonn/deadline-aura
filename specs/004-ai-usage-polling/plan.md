# 004 — Limiti Claude e Codex sempre aggiornati (polling)

Stato: proposto, 2026-10-07. Fase A (spike) eseguita il 2026-10-07 con l'OK dell'utente. Fonti: Research nel thread, `planner`. Costruisce su `specs/003-ai-usage-band/`.

## Obiettivo

La fascia del wallpaper mostra i limiti di ogni account Claude e di Codex aggiornati al massimo ogni 15 minuti anche quando quel profilo non viene usato. deadline-aura interroga gli endpoint di usage con le credenziali già salvate dalle CLI, in sola lettura e senza mai rinnovarle. La cattura della statusline (003, Fase B) e i log Codex (003, Fase A) restano come fallback: fra le fonti, per ogni riga, vince il dato con il `captured_at` più recente.

## Decisioni confermate dall'utente (non si riaprono)

- D1: polling più cattura. Le fonti esistenti restano, vince il dato più recente.
- D2: intervallo di 15 minuti per account, con jitter e backoff esponenziale su 429 e 5xx.
- D3: token in sola lettura, mai un refresh da parte di deadline-aura (ruoterebbe il refresh token e scollegherebbe la CLI). Token scaduto: nessuna chiamata, un solo WARNING, si resta sulle fonti esistenti.
- D4: Claude e Codex nella stessa feature.
- D5: la funzione si disattiva dalle impostazioni ed è dichiarata in UI e nei documenti. Il consenso per README, guida, SECURITY e ARCHITECTURE (it/en) è quindi già dato.
- Vincolo: `~/.claude/scripts/statusline.py` dell'utente non si tocca.

## Decisione aperta (non bloccante, una riga di `config/defaults.js`)

- **D6, valore di default del toggle per le nuove installazioni.** Opzione A: acceso. Opzione B: spento, l'utente lo accende una volta. Raccomandata **B**, per due motivi. Il prodotto è distribuito ad altri e la funzione manda le loro credenziali OAuth a due endpoint non documentati. Inoltre la policy Anthropic sull'uso dei token OAuth di abbonamento fuori dai prodotti Anthropic va letta prima di accendere la funzione di default (rischio R2, `UNVERIFIED`). Con B anche l'utente attuale deve accenderlo una volta: il loader fa il deep-merge dei default, quindi una config esistente senza la chiave riceve il default.

## Esiti dello spike (Fase A, eseguita il 2026-10-07, BASIS: measured)

**Claude.** `GET https://api.anthropic.com/api/oauth/usage` con `Authorization: Bearer <claudeAiOauth.accessToken>` e `anthropic-beta: oauth-2025-04-20`: HTTP 200 su tutti e 3 i profili (delivery, sales, scouting). Non serve nessun `User-Agent` particolare.

- `five_hour` e `seven_day` valgono `{utilization, resets_at, limit_dollars, used_dollars, remaining_dollars, locked_reason}` oppure `null`. `utilization` è un numero: osservati gli interi 5 e 58, mentre fonti terze riportano anche decimali. `resets_at` è una stringa ISO 8601 con offset `+00:00` e microsecondi.
- Tutto il resto (`seven_day_opus`, `seven_day_sonnet` a null, chiavi in codice tipo `iguana_necktie`, `extra_usage`, `limits[]`) si ignora. Lo schema zod descrive solo `five_hour` e `seven_day`, con passthrough sulle altre chiavi: una chiave nuova non deve far fallire la validazione.
- `.credentials.json` contiene in `claudeAiOauth` le chiavi `accessToken`, `expiresAt` (epoch in millisecondi), `rateLimitTier`, `refreshToken`, `refreshTokenExpiresAt`, `scopes` e `subscriptionType`. Il codice legge solo `accessToken` ed `expiresAt`.
- Scadenze residue osservate fra 295 e 429 minuti. In pratica un profilo non usato resta aggiornato dal polling per qualche ora dopo l'ultimo uso di Claude Code (il valore di A4).

**Codex.** `GET https://chatgpt.com/backend-api/wham/usage` con `Authorization: Bearer <tokens.access_token>` e `ChatGPT-Account-Id: <tokens.account_id>`: HTTP 200, `auth_mode: "chatgpt"`.

- La risposta contiene `plan_type: "prolite"` e `rate_limit: {allowed, limit_reached, primary_window: {used_percent: 3, limit_window_seconds: 604800, reset_after_seconds, reset_at}, secondary_window: null}`, con `reset_at` in epoch secondi.
- Il piano prolite ha solo la finestra settimanale, e la mette in `primary`. L'"n/d" sulle 5h è quindi corretto, non un bug. Le finestre si assegnano per `limit_window_seconds`: 18000 → `fiveHour`, 604800 → `sevenDay`.
- `~/.codex/auth.json` non ha una scadenza esplicita, solo `last_refresh`. Su un 401 il polling Codex si ferma finché l'mtime di `auth.json` non cambia, mai un refresh.

**429.** Nessuno osservato, quindi nessun `Retry-After` reale. Il parsing dell'header resta perché lo prescrive D2, ma si testa solo su valori sintetici.

## Definition of Done

1. **Freschezza.** Dato un profilo `delivery` con token valido e polling attivo, e nessuna sessione Claude aperta da 3 ore: entro 2 minuti dall'avvio dell'app e poi ogni 15 minuti (±10%) la riga "delivery" mostra la percentuale restituita dall'endpoint, senza l'etichetta "agg. HH:MM". Esempio: risposta `five_hour = {utilization: 58, resets_at: "2026-10-07T18:00:00.408510+00:00"}`, quindi la riga mostra `58%` e `20:00 (~…)` in ora locale (+02:00).
2. **Vince il più recente.** Snapshot della statusline con `captured_at` alle 10:00 e dato del polling alle 10:05: si mostra il polling. Polling alle 10:05 e statusline alle 10:07: si mostra la statusline. Il confronto avviene per riga intera, non per singola finestra (ADR-1).
3. **Cadenza.** Con orologio finto su 2 ore e risposte 200, ogni account riceve 8 chiamate (±1). Non c'è mai più di una richiesta in volo per account. Il primo poll di ogni account parte con un offset casuale fra 0 e 120 secondi, così 4 account non chiamano nello stesso istante.
4. **Backoff.** Un 429 con `Retry-After: 1800` sposta la chiamata successiva ad almeno 30 minuti. Un 429 senza header, un 5xx o un errore di rete producono 30, 60, 120, 240 minuti, con un tetto a 240. Un `Retry-After` oltre 24 ore viene ridotto a 24 ore. Un 200 riporta la cadenza a 15 minuti.
5. **Token scaduto o rifiutato.** Claude: con `expiresAt` minore o uguale a `now + 60s` non parte nessuna chiamata. Claude e Codex: dopo un 401 o un 403 il target resta in pausa finché l'mtime del file di credenziali non cambia (un `stat` a ogni scadenza del timer, senza rileggere il file). In entrambi i casi si scrive un solo WARNING per episodio, non uno per tick, e la riga torna alle fonti esistenti, con l'etichetta "agg." quando il dato invecchia. Quando la CLI riscrive il file, il polling riprende alla scadenza successiva.
6. **Mai un refresh.** In tutti i test ogni URL passato a `fetch` è una delle due costanti (`https://api.anthropic.com/api/oauth/usage`, `https://chatgpt.com/backend-api/wham/usage`). Nessun file di credenziali viene aperto in scrittura: dopo un ciclo completo mtime e contenuto restano invariati. `refreshToken` non viene mai letto in una variabile.
7. **Il token non esce.** Un test "canary" con token `CANARY-…` percorre ogni ramo di errore (fetch che lancia, 401, 429, 5xx, JSON non valido, payload che non supera zod, body oltre il tetto, credenziali malformate). Nessuna riga di `console.*` contiene il canary, e neanche la cache del poller né le righe passate al renderer o all'IPC. deadline-aura non scrive niente di nuovo su disco: i dati del polling stanno solo in memoria.
8. **Fail-closed.** Un payload che zod rifiuta (per esempio `five_hour.utilization` stringa o `resets_at` non parsabile), un `content-type` diverso da JSON o un body oltre 64 KB non aggiornano la cache e producono un solo WARNING per tipo di errore e account. Chiavi sconosciute in più non sono un errore. Il wallpaper viene reso comunque.
9. **Disattivazione.** Con `wallpaper.ai_usage_polling = false` oppure `wallpaper.show_ai_usage = false`, `fetch` non viene chiamato. La modifica salvata dalle impostazioni ha effetto al tick successivo, senza riavviare.
10. **Codex.** Le finestre vengono assegnate per `limit_window_seconds`, mai per posizione. Con la risposta reale (solo `primary_window` da 604800 secondi al 3%, `secondary_window: null`) il 7g mostra `3%` e il 5h resta "n/d". Una durata sconosciuta viene ignorata. Con `auth_mode` diverso da `chatgpt` il polling Codex non parte.
11. **Richiesta.** Solo HTTPS verso i due host, con le intestazioni dello spike e nient'altro: niente `User-Agent` che imiti una CLI. `redirect: 'error'`, timeout di 10 secondi, body letto con un tetto.
12. **UI e documenti.** In Impostazioni, sotto "Mostra consumo limiti", c'è il toggle del polling con un testo che dichiara host, frequenza, sola lettura e nessun rinnovo, in italiano e in inglese con le stesse chiavi. README, USER-GUIDE, SECURITY e ARCHITECTURE (it/en) dichiarano il traffico di rete, il limite di A4 e come spegnere la funzione.
13. `npm test`, `npm run lint` e `npm run format:check` sono verdi. Nessun file nuovo supera 300 righe e nessuna funzione supera 30. `main.js` (1075 righe) e `renderer/settings.js` (725) crescono solo del cablaggio, al massimo 15 righe ciascuno.

## Assunzioni

Le assunzioni bloccanti sulla forma degli endpoint e delle credenziali sono state verificate dallo spike e tolte (vedi § Esiti dello spike). Restano:

- A4 (verificata, cambia il valore e non la correttezza): Claude Code rinnova il token solo quando viene usato. Un profilo fermo oltre la durata del token (scadenze residue osservate fra 295 e 429 minuti) esce dal polling, per D3, e torna a invecchiare. La feature copre il tempo fra un uso e l'altro, non un profilo mai aperto, e i documenti lo dicono.
- A5: il `fetch` globale del main process di Electron 36 è già usato da `integrations/outlook.js`, quindi si riusa lo stesso approccio. Come per Outlook, il proxy di sistema non viene rispettato.
- A6: i limiti per modello e i campi in dollari della risposta Claude restano fuori scope. Si usano solo `utilization` e `resets_at` di `five_hour` e `seven_day`.
- A7: la riga Codex compare se c'è una qualsiasi delle due fonti, cioè `~/.codex/sessions` oppure `auth.json` con `auth_mode = chatgpt`. Estende la DoD 5 della 003, dove la riga dipendeva solo dai log.
- A8: nuova chiave `wallpaper.ai_usage_polling` (booleano). Il default dipende da D6.
- A9: lo spike non ha registrato se `.credentials.json` nei profili Cloak sia un file regolare o un symlink. T05 accetta un symlink solo se il bersaglio, risolto con `realpath`, è un file regolare dentro la HOME e di proprietà dell'utente. Un `stat` in T05 lo chiude.
- A10: `Date.parse` deve accettare `resets_at` con sei cifre decimali. È UNVERIFIED su V8: T06 lo testa sulla stringa reale e, se torna `NaN`, tronca la frazione ai millisecondi prima del parse.

## ADR

### ADR-1 Dove vivono i dati del polling: cache in memoria nel main process

Opzioni considerate:

- A: il poller scrive `latest/<account>.json`, lo stesso file della cattura.
- B: il poller scrive un file separato, `polled/<account>.json`, e `collectUsage` sceglie il più recente.
- C: cache in memoria nel main process, passata a `collectUsage` come opzione.

Valutazione:

- A mette due scrittori sullo stesso file, uno in Python e uno in JS. "Vince il più recente" diventerebbe un read-compare-write fra due processi senza lock, e il merge per finestra di `claude-capture.py` interferirebbe con il dato del polling.
- B evita la contesa, ma aggiunge una scrittura atomica in JS con permessi 0600 e controlli `lstat`, che oggi esistono solo in Python. In cambio dà persistenza fra un riavvio e l'altro, che vale circa 2 minuti di dato.
- C non scrive niente su disco, quindi la superficie di sicurezza si riduce alla sola lettura delle credenziali. Al riavvio il primo poll arriva entro 120 secondi e nel frattempo valgono le fonti esistenti.

**Decisione: C.** `collectUsage({ polled })` riceve `{ claude: Map<account, snapshot>, codex: snapshot|null }`. La funzione pura `pickFresher(a, b)` sceglie per `capturedAt` (in secondi, la stessa unità di `isStale`), a parità vince il file. Il confronto è per riga intera: se il polling Codex dice che il 5h non esiste, mostrare un 5h vecchio preso dai log sarebbe sbagliato.

Conseguenze: lo stato del backoff e della pausa si perde al riavvio, che è accettabile visto che l'app si riavvia di rado. `collectUsage` resta sincrona e il render resta fuori dalla rete. Un dato del polling che cambia percentuale arriva sulla fascia entro un ciclo di `UPDATE_INTERVAL_MS` (60 s), e `usageSignature` decide se ridisegnare (ADR-2 della 003, invariato).

### ADR-2 Pianificazione: timer proprio, scadenze per target, logica pura separata

- Un `setInterval` da 60 secondi, distinto da `runUpdateCycle`. A ogni tick parte ogni target con `nextDueAt <= now` e nessuna richiesta in volo. Un target è un account Claude oppure Codex.
- `core/ai-usage-poll-schedule.js` è puro: `nextDueAt(outcome, state, nowMs, rng)`, `parseRetryAfter(header, nowMs)` (secondi o data HTTP), `initialOffset(rng)`. L'`rng` è iniettato, quindi i test sono deterministici.
- Costanti nominate: `POLL_INTERVAL_MS` (15 min), `JITTER_RATIO` (0.1), `BACKOFF_CAP_MS` (4 h), `RETRY_AFTER_CAP_MS` (24 h), `INITIAL_OFFSET_MAX_MS` (120 s), `TICK_MS` (60 s), `EXPIRY_MARGIN_MS` (60 s), `REQUEST_TIMEOUT_MS` (10 s), `MAX_BODY_BYTES` (64 KB).
- Esiti classificati come `ok | rate_limited | server | network | auth | invalid | expired | missing`.
  - `rate_limited`, `server`, `network` e `invalid` seguono il backoff.
  - `auth` (401, 403) mette il target in pausa e registra l'mtime del file di credenziali. La pausa finisce quando l'mtime cambia, cioè quando la CLI ha rinnovato il token. Vale per entrambi i provider: Codex non ha una scadenza esplicita, e per Claude copre il token revocato prima di `expiresAt`.
  - `expired` (solo Claude, da `expiresAt`) e `missing` non chiamano e ricontrollano alla cadenza normale.
- Rifiutata l'alternativa di fare il fetch dentro `runUpdateCycle`: lo terrebbe sul percorso del render, e il ciclo ha già un guard `isUpdateCycleRunning` che un fetch da 10 secondi bloccherebbe.

### ADR-3 Lettura delle credenziali e chiamata HTTP

- Le credenziali si rileggono a ogni scadenza del timer, mai tenute in cache. Il token vive solo nella variabile locale della richiesta: il poller non lo conserva, non lo inserisce negli oggetti di errore e non lo passa a `console.*`.
- Lettura: `lstat` (regola sui symlink in A9), `st_uid === process.getuid()`, tetto di 64 KB, `JSON.parse`, zod con i soli campi necessari: Claude `claudeAiOauth.{accessToken, expiresAt}`, Codex `auth_mode` e `tokens.{access_token, account_id}`. Su errore si logga il tipo (`invalid_credentials`), mai il contenuto. Il JWT Codex non viene decodificato: la scadenza si scopre dal 401 (ADR-2).
- I client HTTP stanno in `integrations/` (convenzione del repo per i servizi esterni): `claude-usage-api.js` e `codex-usage-api.js`, con `fetch` iniettato. Il body si legge con il tetto: `readCappedBody` viene estratto da `integrations/outlook.js` in `integrations/http-body.js`, perché questo è il secondo uso.
- Mapping Codex per durata: la funzione che oggi assegna i bucket per `window_minutes` in `core/ai-usage-codex.js` viene estratta e riusata con `limit_window_seconds / 60`, così le due fonti Codex non possono divergere. Il reset si prende da `reset_at`, oppure da `now + reset_after_seconds` se `reset_at` manca.

## Rilievi di sicurezza da verificare in review

| Rilievo                                                                                      | Dove         |
| -------------------------------------------------------------------------------------------- | ------------ |
| Token mai in log, cache, IPC o disco: test canary su tutti i rami di errore (DoD 7)          | T05-T08, T11 |
| `refreshToken` e `refresh_token` mai estratti dallo schema zod, quindi mai in una variabile  | T05, T10     |
| Host fissi come costanti, `redirect: 'error'`, nessun URL derivato da dati letti             | T06, T11     |
| Credenziali: `lstat`/`realpath`, owner, tetto, zod, nessuna scrittura, nessun refresh        | T05, T10     |
| Payload esterno validato con zod prima dell'uso, estrazione per path esplicito, nessun merge | T06, T11     |
| Fixture redatte: niente token, email, account_id, uuid di organizzazione                     | T03          |

## Fasi (ognuna mergiabile da sola)

- **Fase A, spike: FATTA il 2026-10-07.** Esito go per B e C (§ Esiti dello spike).
- **Fase B, poller Claude.** Introduce la chiave di config (default secondo D6), quindi si può spegnere già da `config.json`. Le righe Claude si aggiornano da sole.
- **Fase C, poller Codex.** Si appoggia allo scheduler della Fase B.
- **Fase D, toggle, i18n e documenti.** Rende la funzione visibile e dichiarata.

Nessun tag di release fra B e D: B e C finiscono su `main`, ma il `.deb` distribuito deve avere il toggle e la dichiarazione in UI (D5).

## Rischi

- R1. La forma delle risposte cambia in futuro: entrambi gli endpoint non sono documentati. zod con passthrough tollera chiavi nuove, ma una rinomina di `five_hour` o di `primary_window` porta a `invalid`, un WARNING e il ritorno alle fonti esistenti. Nessun crash e nessun dato sbagliato a schermo.
- R2. Policy. Usare il token OAuth di abbonamento Claude fuori da Claude Code potrebbe violare i termini Anthropic. Da quello che ricordo (`UNVERIFIED`, da training data, va verificato prima del rilascio), Anthropic ha chiarito nel 2026 che questi token non vanno usati in prodotti terzi. Il rischio non è tecnico ma tocca l'account dell'utente, e per un'app distribuita tocca quelli altrui. Mitigazione: D6 a spento, dichiarazione in UI, verifica della policy prima del tag. Vale lo stesso discorso per OpenAI.
- R3. 429 persistenti sull'endpoint Claude (anthropics/claude-code#31021). Nello spike non ne sono comparsi, ma era una chiamata per profilo. Con il backoff limitato a 4 ore non si martella l'endpoint e la fascia ricade sulla cattura. Il log dice quante volte succede, senza degradare in silenzio.
- R4. Token di breve durata (A4): misurato, con scadenze residue fra 295 e 429 minuti. Il guadagno c'è ma è limitato a qualche ora dall'ultimo uso, e i documenti devono dirlo per non promettere un "sempre aggiornato" assoluto.
- R5. Lettura concorrente al rinnovo della CLI: un file a metà scrittura viene rifiutato da zod e si ritenta alla scadenza successiva. Nessuna scrittura da parte nostra, quindi nessuna corruzione possibile.
- R6. `main.js` (1075 righe) e `renderer/settings.js` (725) sono già oltre il limite e il repo non ha `.size-baseline.json`. Il cablaggio va tenuto sotto 15 righe per file, e la logica va in moduli nuovi.
- R7. Più ridisegni: dati più freschi significano più cambi di bucket del 5% e quindi più scritture PNG da 2,4 MB. Resta contenuto dalla firma d'uso. Si osserva in T09 contando i render in 30 minuti.

## Criteri di successo

Gate verdi. In un'esecuzione reale di 30 minuti, con l'OK dell'utente, il log mostra 2 o 3 chiamate per account, nessuna riga contiene un token e la fascia di un profilo non usato mostra un dato senza "agg.". Spegnendo il toggle le chiamate vanno a zero senza riavvio. Gate di review: `code-reviewer` su ogni fase, `security-reviewer` su B e C, `a11y-gate` e click-through su D.
