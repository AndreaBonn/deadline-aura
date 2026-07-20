# Piano: bottone gatto per sospendere il flyby

## Obiettivo

Aggiungere nella sidebar un bottone a forma di gattino (in alto a destra nella clock-section) che apre un popover con 5 voci: Sospendi 1h / 3h / 24h, Per sempre, Riattiva. Il flyby (core/meeting-flyby.js) rispetta lo snooze temporizzato e il disable permanente. L'icona riflette lo stato: normale quando attivo, sbarrata quando sospeso/disattivato, e reagisce ai cambi via broadcast `config-changed`.

## Definition of Done

- Click su "Sospendi 1h/3h/24h" imposta `meeting_flyby.snoozed_until = now + N*3600000`, persiste in config, icona sbarrata, `checkAndLaunch` non lancia flyby finche `now < snoozed_until`.
- Click su "Per sempre" imposta `meeting_flyby.enabled = false`, persiste, icona sbarrata, nessun flyby.
- Click su "Riattiva" imposta `enabled = true, snoozed_until = null`, persiste, icona normale, flyby ripristinato.
- Icona normale sse `enabled && (!snoozed_until || now >= snoozed_until)`, sbarrata altrimenti; stato corretto gia al primo render.
- Snooze scaduto: al primo `checkAndLaunch` con `now >= snoozed_until` il flyby riparte senza intervento; icona torna normale entro ~1s (tick updateClock).
- Persistenza al restart: snooze non scaduto o disable permanente sopravvivono al riavvio (letti da config.json).
- Popover: apre al click sul gatto, chiude su voce/click-fuori/Escape; z-index dropdown (100), sotto modal.
- Label 5 voci + aria-label bottone in it.json e en.json allineati.
- Test vitest verdi: predicato stato, gate checkAndLaunch, IPC set-state, schema (accetta snoozed_until, retrocompat).

## Assunzioni

- Snooze persistito in config.json (non volatile): sopravvive al restart.
- Scadenza valutata lazy nel ciclo `checkAndLaunch`; granularita ripristino = MEETING_DOCK_CHECK_MS. Nessun timer dedicato.
- `snoozed_until` epoch ms, `z.number().int().positive().nullable().optional()`; config legacy senza campo restano valide. Default in defaults.js: `snoozed_until: null`.
- Durate snooze (1/3/24h) come costanti nominate, non magic number.
- Aggiornamento icona alla scadenza automatica agganciato a `updateClock()` (tick esistente) oltre a `config-changed`.

## Decisioni (disambiguazioni risolte con le raccomandate)

- D1 sorgente icona: SVG inline (CSP-safe, disaccoppiato dal flyby, stato sbarrato via variante/classe `.is-snoozed`).
- D2 posizionamento: assoluto dentro `.clock-section` (`position:relative` sul contenitore, bottone `position:absolute; top; right`) senza toccare il centraggio dell'orologio.
- D3 scadenza icona: ricalcolo dello stato icona dentro `updateClock()` per eliminare il lag.

## Approccio

Functional core / imperative shell, tre strati:

1. Core puro (core/meeting-flyby.js): predicato `isFlybySuppressed({ enabled, snoozed_until, now })` usato dal gate di `checkAndLaunch` e, speculare, dal renderer per l'icona. Esportato in `_testing`.
2. Shell IPC (main.js + config/\*): schema/defaults accolgono `snoozed_until`; nuovi `flyby:get-state` (invoke) e `flyby:set-state` (invoke) che patch mirata su `meeting_flyby`, `saveConfig` -> `loadConfig` -> broadcast `config-changed`. Durate come costanti.
3. UI sidebar (preload.js + renderer/_ + i18n/_): bridge `getFlybyState`/`setFlybyState`; bottone gatto SVG; popover 5 voci; funzione pura stato icona; aggancio a `updateClock` e `onConfigChanged`.

## Rischi

- Divergenza semantica gate/icona -> un solo predicato puro condiviso, testato una volta.
- Config legacy senza `snoozed_until` -> campo optional+nullable, deepMerge con defaults, test retrocompat.
- Lag icona a scadenza -> ricalcolo in updateClock (D3).
- Race save-config concorrente (settings aperto) -> setter fa patch mirata sul solo `meeting_flyby`, non riscrive l'intera config.
- Crescita sidebar.js oltre 300 righe -> isolare in IIFE/helper come initAiNotesToggle/bindScoreBreakdownButton.
- CSP -> SVG inline, nessuna risorsa di rete.
- z-index popover -> dropdown 100, sotto overlay(300)/modal(400).

## Criteri di successo

- vitest verde su schema, core (predicato+gate), IPC, renderer.
- Verifica runtime (GUI Electron): click gatto -> popover 5 voci; Sospendi 1h -> icona sbarrata, nessun flyby su evento imminente; Riattiva -> icona normale, flyby riparte; restart con snooze attivo -> icona ancora sbarrata; `snoozed_until` nel passato -> flyby riparte e icona normale entro ~1s.
- Push-on-it: doppio click voce, click-fuori, Escape, cambio config da settings mentre popover aperto.
- auto-lint eslint/prettier pulito.
