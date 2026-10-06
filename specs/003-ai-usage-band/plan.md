# 003 — Fascia limiti AI sul wallpaper

Stato: proposto, 2026-10-06. Fonti: Research nel thread, `planner`, ADR `architect`, review `security-reviewer`.

## Obiettivo

Sul wallpaper sparisce la scritta "carico mentale" e compare una fascia a tutta larghezza, ripetuta su ogni display. Ogni account Claude presente sulla macchina (profili Cloak, altrimenti `~/.claude`) e Codex hanno una riga con: % usata del limite 5h, tempo al reset 5h, % usata del limite settimanale, tempo e data del reset settimanale. Il `global_score` continua a guidare sfondo e tinta.

## Decisioni confermate dall'utente

- La cattura Claude è uno script incluso in deadline-aura, messo in testa alla statusline esistente, con install e uninstall idempotenti e backup di `settings.json`.
- "Rinnovi" significa reset della finestra 5h e di quella settimanale.
- D1, formato del reset: orario esatto più countdown a scatti fra parentesi, `14:30 (~2h 15m)` e `ven 09:00 (3g 4h)`. Sotto le 24h il countdown va a scatti di 15 minuti, sopra a ore. Il passo del countdown entra nella firma d'uso (ADR-2).
- D2, installazione: bottone in Settings con anteprima della modifica, backup e avviso che vale per tutti i profili Cloak, appoggiato al sottocomando `install|uninstall` dello script.
- D3, T11: autorizzato con backup. Si sostituisce per poco la statusline condivisa, poi la si ripristina e si verifica che il `diff` sia vuoto.
- D4, Fase C: README e guida utente in italiano e inglese vanno aggiornati a fine lavoro.

## Definition of Done

1. Il PNG non contiene più "carico mentale". `grep -rn mental_load core i18n` non trova nulla. Con score 0.2 e 0.9 la tinta resta diversa.
2. Esempio: dato `latest/delivery.json` con 5h al 23% e reset fra 2h 15m, e 7d al 41% con reset venerdì alle 14:00, la riga "delivery" mostra i quattro valori nel formato deciso in D1.
3. Una finestra con `resets_at` già passato viene mostrata come `~0%`. Uno snapshot più vecchio di `STALE_AFTER` viene marcato come vecchio, con l'ora del dato.
4. Codex: le finestre vengono assegnate in base a `window_minutes` (300 → 5h, 10080 → 7d). Gli eventi `limit_id != "codex"` o con finestre null vengono ignorati. `CODEX_HOME` viene rispettato.
5. Una fonte assente o corrotta produce "n/d" sulla sua riga e un WARNING nel log. Le altre righe e il wallpaper vengono resi comunque.
6. Con tonalità invariata e firma d'uso cambiata, il wallpaper viene ridisegnato entro un ciclo. Con firma invariata il ridisegno viene saltato, salvo il tetto di 15 minuti. Tolleranza dichiarata: dentro lo stesso scatto del 5% la percentuale mostrata può restare indietro fino a 15 minuti (per esempio 20% mostrato mentre il valore è 24%). È il prezzo di non ridisegnare a ogni punto percentuale.
7. Cattura: lo snapshot viene scritto in modo atomico e contiene solo i campi della whitelist (spec §9.1). Lo stdout è identico a quello della statusline originale. Se la catena fallisce o supera 2s, lo stdout è il testo di fallback. L'exit code è sempre 0.
8. Installer: due install producono una sola modifica e il backup esiste. La scrittura avviene sul realpath e il symlink dei profili resta un symlink. Dopo l'uninstall, `statusLine` è deep-equal all'originale.
9. Nel `.deb` lo script sta in `resources/`, fuori da `app.asar`, e `python3` compare in `deb.depends`.
10. `npm test`, `npm run lint` e `npm run format:check` sono verdi. Nessun file nuovo supera 300 righe e nessuna funzione supera 30.

## Assunzioni

- A1 (bloccante solo per la Fase B): il payload della statusline contiene `rate_limits.five_hour|seven_day.{used_percentage,resets_at}`. Si verifica in T11.
- A2: le righe dei rollout Codex hanno un timestamp per evento. Se manca, si usa l'mtime del file.
- A3: la catena inoltra lo stdout intero, perché la statusline attuale può occupare più righe.
- A4: la catena viene eseguita con `/bin/sh -c`, con la stessa semantica con cui Claude Code esegue la statusline. È una deroga dichiarata a "no shell=True": la stringa è dell'utente e il file che la contiene è 0600 e di sua proprietà.
- A5: esiste un solo `settings.json` reale, condiviso dai profili Cloak tramite symlink. Install e uninstall valgono quindi per tutti i profili insieme, e la UI lo dichiara.
- A6: nuova chiave `wallpaper.show_ai_usage`, con default `true`.

## ADR sintetico

### ADR-1 Interprete della cattura: python3 di sistema, solo stdlib

- Misure: p95 23 ms per python3, 66 ms per Electron con `ELECTRON_RUN_AS_NODE`. `/usr/bin/node` è la v18, quindi fuori dagli engines, e non è garantito sul target.
- Lo script vive solo finché esiste `/opt`. Se il `.deb` viene rimosso, la statusline di Claude Code si rompe su tutti i profili. Con python3 la copia in `~/.local/share` continua a inoltrare all'originale.
- Shebang `#!/usr/bin/python3 -IS` (un solo argomento: Linux passa lo shebang come stringa unica, e `-I -S` separati fanno fallire python3, misurato in T11). `python3` va aggiunto a `deb.depends`.
- Deroga dichiarata dalla regola python-stack: niente uv e niente pyproject, perché è uno script standalone che gira sulla macchina dell'utente finale.
- I test sono black-box in vitest, con `spawnSync('python3', ...)`: un solo runner.
- Sorgente: `scripts/ai-usage/claude-capture.py`, distribuito via `extraResources`. All'avvio l'app lo copia in `~/.local/share/deadlineaura/bin/` quando l'hash differisce.

### ADR-2 Ridisegno guidato da una firma d'uso, non a ogni ciclo

- Misure: render 82 ms, `toBuffer` PNG sincrono 697 ms sul main thread, file da 2,4 MB. Ridisegnare ogni minuto vorrebbe dire circa 3,4 GB scritti al giorno e una dissolvenza di GNOME ogni minuto.
- Firma = per ogni riga, la % in bucket del 5%, gli attraversamenti di soglia (70/90/100, le soglie warn/critical della spec §11, le stesse dei colori della barra), i reset avvenuti, più la granularità del countdown decisa in D1. Il tetto è un ridisegno ogni 15 minuti.
- `shouldRerender(prevSig, nextSig, force)` è una funzione pura, che si aggiunge come secondo motivo di ridisegno accanto al delta di tonalità.
- Va misurato `canvas.toBuffer` asincrono, che toglierebbe circa 0,7 s dal main thread. UNVERIFIED: che giri sul threadpool. Si tiene solo se la misura lo conferma (rule performance).

## Rilievi di sicurezza integrati

| Rilievo                                                                                                                                                                                                                             | Severità | Dove          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| `capture.json` (contiene la catena eseguita) creato con modo 0600 esplicito; prima dell'uso si verifica `st_uid == getuid()`, altrimenti nessun inoltro                                                                             | P1       | T13, T14      |
| Persistenza dopo `apt remove`: la copia resta e continua a inoltrare all'originale, quindi la statusline non si rompe. L'uninstall va dichiarato in UI e nel `postrm` (messaggio, nessuna modifica come root alla home dell'utente) | P1       | T15, T17      |
| Directory a 0700, file a 0600; `lstat` prima di scrivere ed eseguire, per non seguire symlink piazzati                                                                                                                              | P2       | T13, T14, T15 |
| Mai loggare il payload grezzo: solo lunghezza e hash troncato                                                                                                                                                                       | P2       | T13           |
| Estrazione per path esplicito, mai merge generico su JSON esterni (prototype pollution)                                                                                                                                             | P2       | T02, T04      |
| `backups/` a 0600, conservati al massimo `MAX_BACKUPS`                                                                                                                                                                              | nota     | T14           |

Respinto anche il lock sullo snapshot (rilievo del `code-reviewer`). Lo scenario: due sessioni dello stesso account, di cui una con payload parziale; la finestra torna al valore precedente fino al render successivo, cioè pochi secondi, e si corregge da sola. Il lock aggiungerebbe codice nel percorso critico della statusline per un guadagno marginale.

Respinto: l'allowlist di interpreti per la catena. Romperebbe statusline legittime arbitrarie, e chi ha lo stesso UID può comunque modificare direttamente `settings.json`, quindi non aggiunge una barriera reale.

## Fasi (ognuna mergiabile da sola)

- **Fase A, la fascia con i dati Codex reali.** Gli account Claude mostrano "n/d" finché non c'è uno snapshot. È già utile da sola.
- **Fase B, la cattura Claude.** Riempie le righe Claude.
- **Fase C, la documentazione.** Si fa solo con consenso esplicito.

Sub-task, dipendenze e verify in `tasks.md`.

## Rischi

- A1 falsa invalida la Fase B. T11 viene prima di qualsiasi codice della Fase B.
- Una catena sopra i 2s (oggi `statusline.py` usa tmux) farebbe vedere il fallback. Si misura in T11.
- Una scrittura sul symlink invece che sul file reale romperebbe la condivisione fra profili. T14 lo testa esplicitamente.
- La lettura dei jsonl Codex (327 MB, 406 file) a ogni ciclo. Si limitano MAX_FILES e TAIL_BYTES, si misura in T03 e, se sfora, si mette una cache per mtime.
- Fascia troppo stretta a 1366 px con 5 righe. Si testa in T06.
- Il `toBuffer` sincrono da 0,7 s esiste già oggi. Il ridisegno più frequente lo rende più visibile.

## Criteri di successo

Gate verdi. Il PNG reale mostra valori coerenti con le fonti: con l'ultimo evento jsonl per Codex, con `/usage` per Claude. Il `.deb` ha lo script fuori da asar. Il ciclo install → sessione → uninstall lascia `diff` vuoto su `settings.json`. Gate di review: `code-reviewer`, più `security-reviewer` su T13-T15.
