[English](./SECURITY.md) | **Italiano**

# Security Policy

## Versioni supportate

La release corrente è `1.7.0`. Le correzioni di sicurezza vengono applicate all'ultima release e al branch `main`. Le release precedenti non ricevono patch: la strada per aggiornarsi è installare il `.deb` più recente, che conserva i dati esistenti.

| Versione | Supportata                      |
| -------- | ------------------------------- |
| 1.6.x    | Sì                              |
| < 1.6    | No, aggiorna all'ultima release |

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
Ogni `BrowserWindow` viene creata con `contextIsolation: true` e `nodeIntegration: false` (`main.js:103`, `main.js:138`, `main.js:242`, `main.js:355`, `main.js:569`). I processi renderer non hanno accesso diretto alle API Node.js.

**Content Security Policy su ogni finestra renderer**
Ogni documento del renderer dichiara `default-src 'self'; script-src 'self'` in un meta tag (`renderer/index.html:6`, e lo stesso in `settings.html`, `strip.html`, `overlay.html`, `meeting-dock.html`, `flyby.html`). Nessuno script o foglio di stile remoto può essere caricato.

**Superficie IPC minimale tramite contextBridge**
Cinque preload bridge espongono ciascuno un oggetto API nominato tramite `contextBridge.exposeInMainWorld`, con i soli canali IPC che quella finestra usa: `preload.js:5`, `preload-settings.js:5`, `preload-overlay.js:5`, `preload-meeting-dock.js:5`, `preload-flyby.js:5`. Nessuna API di Node o Electron viene esposta direttamente.

**Validazione URL prima di aprire il browser**
`isSafeExternalUrl` (`main.js:641`) rifiuta tutto ciò che non è http o https, gli URL con credenziali incorporate e gli host di loopback o privati (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`, `10.`, `192.168.`). Il browser viene lanciato con `spawn` passando un array di argomenti, mai attraverso una shell (`main.js:680`).

**Protezione CSRF sulla callback OAuth**
L'URL di autorizzazione porta un parametro `state` casuale, e il server di callback locale rifiuta qualsiasi risposta il cui `state` non corrisponda (`integrations/google-calendar.js:88`, `integrations/google-calendar.js:100`). Il server di callback si spegne inoltre da solo dopo cinque minuti, quindi non resta in ascolto.

**Validazione input con Zod**
La configurazione modificabile dall'utente viene validata contro uno schema Zod (`config/schema.js:5`) prima di essere salvata, all'avvio e a ogni salvataggio delle impostazioni.

**Permessi dei file che contengono segreti**
Il file di configurazione viene scritto con `chmod 0600` a ogni salvataggio (`config/loader.js:58`), il token OAuth Google con `chmod 0600` (`integrations/google-calendar.js:75`, `integrations/google-calendar.js:119`), e la directory di configurazione viene creata con modo `0700` (`integrations/google-calendar.js:117`).

**Segreti mascherati prima di arrivare al renderer**
La finestra delle impostazioni non riceve mai i segreti salvati. Token API Jira, chiavi dei provider AI, client secret Google e URL del feed Outlook vengono sostituiti da un segnaposto prima che la configurazione venga passata al renderer, e ripristinati dalla configurazione persistita quando il salvataggio torna indietro con il segnaposto intatto (`config/secret-masking.js`).

**URL del feed Outlook trattato come credenziale**
Il link ICS pubblicato dà accesso in lettura all'intero calendario senza autenticazione, quindi viene trattato come un segreto. L'URL deve essere https (`webcal://` viene normalizzato) e viene rifiutato quando punta a un indirizzo letterale di loopback, privato, link-local o unique-local (`integrations/outlook.js:46`, `integrations/outlook.js:62`). I redirect vengono seguiti solo attraverso la stessa validazione, fino a tre salti (`integrations/outlook.js:103`). Il corpo della risposta è limitato a 5 MB e lo stream viene interrotto oltre quella soglia (`integrations/outlook.js:69`). In caso di errore viene loggato solo l'hostname, mai l'URL (`integrations/outlook.js:259`), e nessun task Outlook porta l'URL fino al renderer (`integrations/outlook.js:209`).

Il controllo è sull'indirizzo letterale, non sulla risoluzione DNS: un hostname che risolve a un indirizzo privato passa comunque. È un limite accettato per un'applicazione desktop mono-utente ed è documentato nel sorgente.

**Backup del database prima delle migrazioni distruttive**
Le migrazioni che ricostruiscono la tabella `tasks` fanno prima uno snapshot del database (`store/db-backup.js:70`). Se il backup fallisce, la migrazione si interrompe invece di procedere senza un punto di ripristino (`store/db.js:137`).

**Foreign key enforcement in SQLite**
Il database viene aperto con `PRAGMA foreign_keys = ON` (`store/db.js:29`).

**Dipendenze pinnate**
`package-lock.json` è presente e committato, fissando tutte le dipendenze transitive a versioni specifiche.

## Limiti noti

Sono proprietà del design attuale, elencate perché nessuno debba scoprirle leggendo il sorgente.

**Lo scope Google Calendar è in lettura e scrittura**
L'autorizzazione OAuth richiede `https://www.googleapis.com/auth/calendar` (`integrations/google-calendar.js:15`), che include l'accesso in scrittura. Per mostrare gli eventi basterebbe la sola lettura, ma il time log e il timer live creano e aggiornano eventi sul calendario, quindi per quelle funzioni lo scope più ampio è necessario. Revocare l'autorizzazione dal tuo account Google disattiva il sync insieme a loro.

**I segreti sono salvati in chiaro, protetti solo dai permessi del file**
Chiavi API, token Jira, client secret Google e URL del feed Outlook stanno in `~/.config/deadlineaura/config.json` come testo leggibile, con il file impostato a `0600`. Non c'è integrazione con un keyring né cifratura a riposo. Chiunque possa leggere file come il tuo utente, incluso qualsiasi processo in esecuzione sotto il tuo account, può leggerli.

**L'AI scoring invia i titoli degli eventi a provider di terze parti**
Quando l'AI scoring è attivo, il prompt porta i titoli degli eventi in arrivo e, dove presenti, descrizione, organizzatore e numero di partecipanti al provider configurato (Groq, Gemini, OpenAI o Anthropic) via HTTPS. Le interruzioni di riga vengono compattate e il testo troncato a una lunghezza fissa prima dell'inserimento (`ai/prompt.js:25`), ma il contenuto non viene filtrato in altro modo: il titolo di un evento è quindi un possibile vettore di prompt injection sulla risposta dello scoring. Se quei titoli sono riservati, disattiva l'AI scoring in Impostazioni → AI.

## Buone pratiche per gli utenti

- Se esegui da sorgente, tieni `.env` fuori dal controllo versione. È già elencato nel `.gitignore`.
- Il token in `~/.config/deadlineaura/google-token.json` dà accesso in lettura e scrittura al tuo calendario. Non condividerlo e non copiarlo su una macchina condivisa. Per invalidarlo, revoca l'applicazione dal tuo account Google ed elimina il file.
- Tratta il link ICS di Outlook come una password. Chi lo possiede legge il tuo calendario senza autenticarsi, e non è revocabile in modo selettivo: l'unico modo per ritirarlo è smettere di pubblicare il calendario da Outlook, il che invalida il link per chiunque lo stia usando.
- Sia `config.json` sia il file del token vengono scritti con `0600`, ma restano leggibili da qualsiasi cosa giri come il tuo utente. Su una macchina condivisa conviene un account separato piuttosto che affidarsi a quei permessi.
- Le chiavi API dei provider AI vengono inoltrate a API di terze parti (Groq, Gemini, OpenAI, Anthropic) via HTTPS, insieme ai titoli degli eventi da valutare. Consulta la policy di gestione dei dati di ciascun provider prima di attivare la funzione.
- Installa il `.deb` solo dalla [pagina delle release](https://github.com/AndreaBonn/deadline-aura/releases) di questo repository.

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
