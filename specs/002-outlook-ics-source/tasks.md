# 002 — Scomposizione task

| id  | Task                                                                                      | Dipende da    | Requisito tracciato                              |
| --- | ----------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------ |
| T01 | Fixture ICS sintetiche, incluso il caso degradato a soli `Busy` con warning               | —             | Assunzione "Tutti i dettagli", resa rumorosa     |
| T02 | Dipendenza `ical.js` e verifica bundle .deb                                               | T01           | ADR-1                                            |
| T03 | `core/ics-parser.js`, parsing ed espansione ricorrenze                                    | T02           | DoD ricorrenze, EXDATE, RECURRENCE-ID            |
| T04 | Test parser su fixture: EXDATE, RECURRENCE-ID, all-day, DST, feed vuoto e malformato      | T03           | DoD ricorrenze                                   |
| T05 | `integrations/outlook.js`: fetch con hardening, retry, normalizzazione, priorità          | T03           | DoD conteggio sync, ADR-3, id stabile            |
| T06 | Config: schema, defaults, secret-masking di `ics_url`                                     | —             | DoD segreto mai in chiaro al renderer            |
| T07 | Migrazione DB 008 con regex sul CHECK, transazione esplicita, drop di `tasks_new` residuo | —             | DoD migrazione idempotente e senza perdita righe |
| T08 | `CALENDAR_SOURCES` applicata ai sei punti che filtrano `'gcal'`                           | T07           | DoD evento contato come calendario               |
| T09 | Registrazione della source in `core/sync-daemon.js`                                       | T05, T06, T07 | DoD conteggio sync                               |
| T10 | UI settings, sezione sidebar e chiavi i18n it/en                                          | T06           | Vincolo di configurazione da UI                  |
| T11 | Verifica end-to-end, secondo sync senza duplicati, lint e test                            | T08, T09, T10 | Criteri di successo                              |

Percorso critico: T01 → T02 → T03 → T05 → T09 → T11.
T06, T07 e T10 sono parallelizzabili rispetto al parser.
