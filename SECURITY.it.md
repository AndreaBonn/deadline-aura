[English](./SECURITY.md) | **Italiano**

# Security Policy

## Versioni supportate

DeadlineAura non ha ancora raggiunto una release stabile. La versione corrente è `0.1.0` (tag non ancora pubblicato). Solo l'ultimo commit sul branch `main` riceve aggiornamenti di sicurezza.

| Versione | Supportata |
|---|---|
| 0.1.x (main) | Sì |

## Segnalare una vulnerabilità

**Non aprire una issue pubblica su GitHub per vulnerabilità di sicurezza.**

Segnala le vulnerabilità tramite GitHub Security Advisories:
[https://github.com/AndreaBonn/deadline-aura/security/advisories/new](https://github.com/AndreaBonn/deadline-aura/security/advisories/new)

Includi nel report:
- Una descrizione della vulnerabilità e del componente interessato
- I passi per riprodurla, inclusa la configurazione necessaria
- L'impatto potenziale (esposizione di dati, escalation di privilegi, denial of service, ecc.)
- La tua valutazione sulla sfruttabilità

**Tempi di risposta:**
- Conferma di ricezione entro 72 ore
- Aggiornamento sullo stato entro 7 giorni
- Fix per vulnerabilità critiche entro 30 giorni, dove fattibile

Il progetto segue la responsible disclosure: le vulnerabilità vengono mantenute riservate fino al rilascio del fix, dopodiché i dettagli possono essere pubblicati insieme alla correzione.

## Misure di sicurezza implementate

Le misure elencate di seguito sono state verificate leggendo il codice sorgente. Dove disponibili, sono indicati file e riga.

**Context isolation in Electron**
Tutte le istanze di `BrowserWindow` vengono create con `contextIsolation: true` e `nodeIntegration: false` (`main.js` righe 84, 119, 216, 435). I processi renderer non hanno accesso diretto alle API Node.js.

**Superficie IPC minimale tramite contextBridge**
Il preload script (`preload.js:5`) espone un oggetto API nominato tramite `contextBridge.exposeInMainWorld` contenente solo le chiamate IPC necessarie al renderer. Nessuna API di Node o Electron viene esposta direttamente.

**Validazione URL prima dello spawn di processi esterni**
Prima di aprire un link nel browser, `main.js:479` valida l'URL con la regex `^https?:\/\/`. Solo URL con schema http o https producono una chiamata `spawn`.

**Validazione input con Zod**
La configurazione modificabile dall'utente viene validata contro uno schema Zod (`config/schema.js:5`) prima di essere salvata. Lo stesso schema viene applicato ad ogni salvataggio delle impostazioni (`main.js:495-496`).

**Permessi file del token OAuth Google**
Il token OAuth Google viene scritto su disco con `chmod 0600` (`integrations/google-calendar.js:59`), limitando l'accesso in lettura al solo proprietario del file.

**Scope Google Calendar minimale**
L'autorizzazione OAuth richiede solo `https://www.googleapis.com/auth/calendar.readonly` (`integrations/google-calendar.js:13`). Non viene richiesto alcun accesso in scrittura al calendario.

**Chiavi API caricate dall'ambiente, non hardcoded**
Tutte le chiavi dei provider AI vengono lette da variabili d'ambiente tramite `dotenv` (`main.js:3`, `sync-daemon.js:3`). Il `provider-manager.js` legge `GROQ_API_KEYS`, `GEMINI_API_KEYS`, `OPENAI_API_KEYS`, `ANTHROPIC_API_KEYS` da `process.env`.

**Foreign key enforcement in SQLite**
Il database viene aperto con `PRAGMA foreign_keys = ON` (`store/db.js:22`).

**Dipendenze pinnate**
`package-lock.json` è presente e committato, fissando tutte le dipendenze transitive a versioni specifiche.

## Buone pratiche per gli utenti

- Mantieni il file `.env` fuori dal controllo versione. Aggiungilo al `.gitignore`.
- Il token OAuth Google in `~/.config/deadlineaura/google-token.json` garantisce accesso in lettura al tuo calendario. Non condividere questo file.
- Le credenziali Jira sono salvate in `~/.config/deadlineaura/config.json` in chiaro. Limita i permessi su quel file se altri utenti condividono la macchina.
- Le chiavi API dei provider AI inserite in questa applicazione vengono inoltrate a API di terze parti (Groq, Gemini, OpenAI, Anthropic) via HTTPS. Consulta la policy di gestione dei dati di ciascun provider prima dell'uso.

## Fuori perimetro

I seguenti scenari non sono considerati vulnerabilità per questo progetto:

- Vulnerabilità che richiedono accesso fisico alla macchina
- Attacchi di social engineering
- Problemi nelle dipendenze di terze parti già pubblicamente noti (segnalarli ai rispettivi progetti upstream)
- Self-XSS (richiede che l'attaccante controlli già la sessione)
- Attacchi denial of service contro il processo Electron locale

## Ringraziamenti

Nessuno al momento.

---

[Torna al README](./README.it.md)
