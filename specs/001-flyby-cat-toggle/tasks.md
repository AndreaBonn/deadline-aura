# Tasks: bottone gatto per sospendere il flyby

Slug: 001-flyby-cat-toggle | Requisito tracciato: DoD del plan.md

| id  | dipendenze | descrizione                                                                                        | requisito            |
| --- | ---------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| T1  | -          | schema: `snoozed_until` in `meeting_flyby` (config/schema.js)                                      | persistenza          |
| T2  | -          | defaults: `snoozed_until: null` (config/defaults.js)                                               | retrocompat          |
| T3  | T1,T2      | test schema: valida con/senza campo, rifiuta negativo/non-int (test/config)                        | retrocompat          |
| T4  | -          | predicato puro `isFlybySuppressed` + ramo snooze in gate checkAndLaunch (core/meeting-flyby.js)    | gate snooze          |
| T5  | T4         | test predicato + gate (test/core/meeting-flyby.test.js)                                            | gate snooze          |
| T6  | -          | costanti durate snooze 1/3/24h in ms (core/flyby-snooze.js o main.js)                              | no magic number      |
| T7  | T1         | IPC `flyby:get-state` invoke (main.js)                                                             | stato iniziale icona |
| T8  | T1,T6      | IPC `flyby:set-state` invoke: patch meeting_flyby, save->load->broadcast (main.js)                 | tutte le azioni      |
| T9  | T8         | test IPC set-state: ogni azione produce config attesa, broadcast, input invalido rifiutato         | tutte le azioni      |
| T10 | T7,T8      | preload: bridge `getFlybyState`/`setFlybyState` (preload.js)                                       | ponte UI             |
| T11 | -          | markup bottone gatto SVG + popover 5 voci in clock-section (renderer/index.html)                   | UI                   |
| T12 | T11        | styling: relative/absolute, popover z-index 100, stati UI, variante sbarrata (renderer/styles.css) | UI                   |
| T13 | T4,T10,T11 | funzione pura stato icona + wiring popover (click/fuori/Escape) (renderer/sidebar.js)              | icona + popover      |
| T14 | T13        | wiring voci -> setFlybyState; init via getFlybyState; update su onConfigChanged + updateClock      | reattivita           |
| T15 | T11        | i18n: 5 voci + aria-label (it.json, en.json)                                                       | i18n allineato       |
| T16 | T13,T14    | test renderer vitest+jsdom: stato icona, popover, click voce                                       | verifica             |
| T17 | T14        | verifica limiti dimensionali sidebar.js, isolare in IIFE se serve                                  | code-standards       |
