[English](./README.md) | **Italiano**

# Deadline Aura by Bonn

Widget desktop per Linux che traduce il carico di lavoro in un segnale visivo ambientale — una striscia colorata, uno sfondo cromatico e task su post-it che si aggiornano man mano che le scadenze si avvicinano.

<div align="center">

[![CI](https://github.com/AndreaBonn/deadline-aura/actions/workflows/ci.yml/badge.svg)](https://github.com/AndreaBonn/deadline-aura/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/AndreaBonn/deadline-aura/main/badges/test-badge.json)](https://github.com/AndreaBonn/deadline-aura/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/AndreaBonn/deadline-aura/main/badges/coverage-badge.json)](https://github.com/AndreaBonn/deadline-aura/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![ESLint](https://img.shields.io/badge/lint-ESLint-4B32C3.svg)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/code_style-Prettier-ff69b4.svg)](https://prettier.io/)
[![Security Policy](https://img.shields.io/badge/security-policy-green.svg)](./SECURITY.md)
[![GitHub stars](https://img.shields.io/github/stars/AndreaBonn/deadline-aura?style=social)](https://github.com/AndreaBonn/deadline-aura)

</div>

## Cosa fa

Deadline Aura recupera task da Google Calendar e Jira, calcola uno score di urgenza per ciascuno e riflette il carico complessivo come colore: verde calmo a bassa pressione, giallo in zona di attenzione, rosso intenso allo stato critico. Il colore appare su una striscia laterale persistente su ogni display, come tinta del wallpaper e, opzionalmente, come post-it renderizzati direttamente nello sfondo del desktop.

Un layer opzionale di AI scoring (Groq, Gemini, OpenAI o Anthropic) valuta il carico cognitivo ed emotivo sull'intera finestra di eventi e fonde quella valutazione (70%) con lo score meccanico basato sul tempo (30%). Se nessun provider AI è configurato, la formula meccanica viene usata da sola.

Solo Linux/X11/GNOME.

<div align="center">
<img src="assets/img-readme/desktop.png" alt="Desktop Deadline Aura con wallpaper e post-it" width="800">
<br><em>Vista desktop: wallpaper con tinta cromatica, post-it dei task e striscia di urgenza sul bordo destro</em>
</div>

## Architettura

```mermaid
%%{init: {'theme': 'default'}}%%
graph LR
  gcal["Google Calendar"]
  jira["Jira"]
  local["Task Locali"]
  sync["Sync Daemon"]
  store[("SQLite")]
  ai["AI Scorer<br/>Multi-provider"]
  engine["Urgency Engine"]
  cmap["Color Mapper<br/>5 bande"]
  wallpaper["Wallpaper PNG"]
  strip["Striscia Colore"]
  sidebar["Sidebar"]
  dock["Meeting Dock"]

  gcal --> sync
  jira --> sync
  local --> store
  sync --> store
  store --> engine
  ai -.->|"blend 70/30"| engine
  store -.-> ai
  engine --> cmap
  cmap --> wallpaper
  cmap --> strip
  cmap --> sidebar
  cmap --> dock

  classDef core fill:#2563eb,stroke:#1d4ed8,color:#fff
  classDef data fill:#d97706,stroke:#b45309,color:#fff
  classDef ext fill:#6b7280,stroke:#4b5563,color:#fff
  classDef engine fill:#059669,stroke:#047857,color:#fff

  class gcal,jira ext
  class local,store data
  class sync,ai core
  class engine,cmap engine
  class wallpaper,strip,sidebar,dock core
```

Per diagrammi tecnici dettagliati (pipeline sync, schema database, ciclo di vita task, IPC), vedi [docs/ARCHITECTURE.it.md](./docs/ARCHITECTURE.it.md).

## Funzionalità

- Striscia da 20px persistente su ogni display connesso; il colore interpola su cinque bande di urgenza (calmo → normale → attenzione → urgente → critico)
- Pannello sidebar con task ordinati per score di urgenza, attivato cliccando la striscia
- Wallpaper generato come PNG composito che occupa tutti i display, con post-it per task in posizioni drag-and-drop salvate in percentuale
- Urgency engine: formula a decadimento esponenziale con pesi di priorità e amplificazione del volume sopra 5 eventi contemporanei
- AI scoring con failover tra provider (Groq → Gemini → OpenAI → Anthropic), cache basata su hash, intervallo di ricalcolo configurabile (default: 6 ore)
- Sync Google Calendar via OAuth2 (scope: `calendar` per accesso completo in lettura e scrittura)
- Sync Jira via API token con JQL configurabile
- Supporto multi-monitor: una striscia per display, singolo PNG wallpaper spanned
- Config validata con Zod all'avvio e ad ogni salvataggio delle impostazioni
- Riserva dello strut X11 perché la striscia non si sovrapponga all'area di lavoro GNOME
- Task locali: creazione, modifica, completamento e cancellazione di task personali direttamente dalla sidebar, senza sync esterno
- Early warning burnout: analizza 7 giorni di storico AI su tre trigger indipendenti (stress sostenuto, recovery insufficiente, carico emotivo alto) e invia notifiche desktop a severità moderate/high
- Clinical note AI: valutazione in linguaggio naturale da psicologo occupazionale simulato, con grafico di previsione stress a 5 giorni — visibili in pannello collassabile attivato cliccando la barra di urgenza
- Notifiche desktop via `notify-send` con soglia di score e cooldown configurabili; urgenza critica per alert burnout
- Interfaccia bilingue (italiano/inglese) selezionabile dalle impostazioni; traduzioni caricate via IPC con chiavi dot-notation e interpolazione placeholder
- Pannello impostazioni con 9 tab di configurazione (Generale, Sorgenti, AI, Wallpaper, Sidebar, Notifiche, Interfaccia, Turno, Avanzate) e reset per sezione
- Auto-show sidebar su display senza finestre visibili (rilevamento via `wmctrl`)
- Lock singola istanza per impedire processi widget duplicati
- Finestra di lookahead dinamica: eventi raccolti per almeno 7 giorni in avanti, estesi alla domenica successiva; task Jira e locali sempre inclusi indipendentemente dalla scadenza
- Preferiti Jira: stella su qualsiasi task Jira per fissarlo in una sezione "Preferiti" dedicata tra Google Calendar e Jira nella sidebar; i preferiti persistono tra i riavvii
- Time logging su Google Calendar: bottone orologio su qualsiasi task apre un form inline per creare un evento con data, ora, durata e calendario di destinazione; gli eventi sono formattati come `[CODICE-JIRA] - Titolo` per compatibilità con il tracciamento tempo di Tempo
- Timer live: pulsante play/stop su qualsiasi task Jira o locale avvia un timer in tempo reale che crea un evento Google Calendar immediato e ne aggiorna l'orario di fine ogni 60 secondi; premendo stop l'evento viene finalizzato con la durata esatta. Lo stato del timer persiste in localStorage per il recupero da crash. Una sezione "In Corso" in cima alla sidebar evidenzia il task attualmente cronometrato

## Installazione

### Passo 1 — Installa le dipendenze di sistema

**Ubuntu/Debian:**

```bash
sudo apt install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
sudo apt install x11-utils wmctrl libnotify-bin
```

**Fedora:**

```bash
sudo dnf install gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel giflib-devel librsvg2-devel
sudo dnf install xprop wmctrl libnotify
```

`xprop` e `wmctrl` sono obbligatori a runtime. Il wallpaper viene impostato tramite `gsettings` (GNOME); `feh` viene usato come fallback. `notify-send` gestisce le notifiche desktop.

### Passo 2 — Installa Node.js 20 tramite nvm

Il package `canvas` non compila su Node 24. È richiesto Node 20 LTS.

Se non hai nvm: [https://github.com/nvm-sh/nvm#installing-and-updating](https://github.com/nvm-sh/nvm#installing-and-updating)

```bash
nvm install 20
nvm use 20
node --version   # deve stampare v20.x.x
```

### Passo 3 — Clona e compila

```bash
git clone https://github.com/AndreaBonn/deadline-aura.git
cd deadline-aura
npm install
npx electron-rebuild   # ricompila better-sqlite3 e canvas contro il Node ABI di Electron
```

`npx electron-rebuild` è obbligatorio dopo `npm install`. Ricompila i moduli nativi (`better-sqlite3`, `canvas`) contro la versione di Node inclusa in Electron. Senza questo passaggio l'applicazione non si avvierà.

### Passo 4 — Crea le credenziali Google Cloud

Deadline Aura ha bisogno di credenziali OAuth 2.0 per leggere Google Calendar.

1. Vai su [Google Cloud Console](https://console.cloud.google.com) e crea un nuovo progetto (o usa uno esistente)
2. Nel menu a sinistra: **API e servizi → Libreria** → cerca "Google Calendar API" → Abilita
3. Vai su **API e servizi → Credenziali** → **Crea credenziali → ID client OAuth**
4. Scegli tipo applicazione: **App desktop**
5. Nella sezione **URI di reindirizzamento autorizzati**, aggiungi esattamente: `http://localhost:34567/oauth/callback`
6. Clicca Crea — annota il **Client ID** e il **Client Secret**

### Passo 5 — Crea il file .env

Nella root del progetto, crea un file chiamato `.env`:

```dotenv
# Credenziali OAuth Google Calendar (necessarie per il sync del calendario)
GOOGLE_CLIENT_ID=incolla_qui_il_tuo_client_id
GOOGLE_CLIENT_SECRET=incolla_qui_il_tuo_client_secret

# Chiavi API provider AI — comma-separated per abilitare la rotazione
# Tutte opzionali. Se nessuna è impostata, l'AI scoring è disabilitato.
GROQ_API_KEYS=chiave1,chiave2
GEMINI_API_KEYS=chiave1
OPENAI_API_KEYS=chiave1
ANTHROPIC_API_KEYS=chiave1
```

Compila come minimo `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Le chiavi AI sono opzionali.

### Passo 6 — Primo avvio e autorizzazione Google

```bash
nvm use 20
npm start
```

Al primo avvio si apre una finestra browser per l'autorizzazione di Google Calendar. L'app richiede accesso completo al calendario (lettura e scrittura) per poter sia leggere gli eventi che creare voci di time log. Accedi con l'account Google di cui vuoi sincronizzare il calendario e clicca Consenti. Il token viene salvato automaticamente in `~/.config/deadlineaura/google-token.json` con permessi `0600`. Non ti verrà chiesto di nuovo a meno che il token non venga eliminato o revocato.

Dopo l'autorizzazione, la striscia colorata appare sul bordo destro di ogni display. Cliccala per aprire la sidebar.

### Passo 7 — Configura Jira (opzionale)

Clicca l'icona ingranaggio nella sidebar per aprire il pannello impostazioni. Nella sezione Jira, inserisci:

- **Dominio**: il tuo dominio Atlassian (es. `tuaazienda.atlassian.net`)
- **Email**: l'indirizzo email del tuo account Atlassian
- **API token**: generane uno su [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **JQL**: filtro per le issue da tracciare (default: `assignee = currentUser() AND statusCategory != Done`)

Le credenziali vengono salvate in `~/.config/deadlineaura/config.json`.

### Passo 8 — Autostart (opzionale)

**Autostart GNOME — avvia il widget al login:**

Esegui questi comandi dall'interno della directory del progetto:

```bash
mkdir -p ~/.config/autostart
ELECTRON_BIN=$(node -e "console.log(require('electron'))")
PROJECT_DIR=$(realpath .)

sed "s|Exec=.*|Exec=$ELECTRON_BIN $PROJECT_DIR --no-sandbox|" \
  autostart/deadlineaura.desktop > ~/.config/autostart/deadlineaura.desktop
```

**Timer systemd — sync in background ogni 5 minuti:**

```bash
mkdir -p ~/.config/systemd/user
NODE_BIN=$(which node)
PROJECT_DIR=$(realpath .)

sed "s|ExecStart=.*|ExecStart=$NODE_BIN $PROJECT_DIR/core/sync-daemon.js|" \
  systemd/deadlineaura-sync.service > ~/.config/systemd/user/deadlineaura-sync.service

cp systemd/deadlineaura-sync.timer ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now deadlineaura-sync.timer
```

## Utilizzo

Dopo aver avviato l'app (`npm start`), una striscia colorata appare sul bordo destro di ogni display. Il colore riflette il carico di lavoro attuale: verde in situazione tranquilla, giallo a carico moderato, rosso a pressione critica. La striscia si aggiorna automaticamente ogni 60 secondi.

### Sidebar

Clicca la striscia per aprire la sidebar. I task sono raggruppati in sezioni:

<div align="center">
<img src="assets/img-readme/sidebar.png" alt="Sidebar con sezioni task" width="700">
<br><em>Sidebar: nota clinica AI, previsione stress, sezioni task con score di urgenza e pulsanti azione</em>
</div>

1. **Locale** - task personali creati direttamente nell'app
2. **Google Calendar** - eventi dai calendari sincronizzati
3. **Preferiti Jira** - task Jira che hai stellato (visibile solo se hai preferiti)
4. **Jira** - task corrispondenti al filtro JQL configurato

Ogni card mostra titolo, countdown alla scadenza, score di urgenza e badge della sorgente. Cliccando un task Jira o Google Calendar si apre nel browser.

In cima alla sidebar trovi i pulsanti per sync manuale, impostazioni (ingranaggio), layout post-it (griglia) e chiusura (X).

### Task locali

Clicca il pulsante **+** nell'header della sezione "Locale" per creare un task personale. Compila titolo, data di scadenza e priorità (P1-P4). Premi Invio o clicca "Aggiungi" per salvare.

Su ogni task locale puoi: modificare (matita), completare (spunta), eliminare (X), fissare sul desktop, o loggare tempo.

### Preferiti Jira

Clicca la stella su qualsiasi card Jira per aggiungerla ai preferiti. I task stellati appaiono in una sezione dedicata "Preferiti Jira" in cima alla sidebar, per accedere ai task più importanti senza scorrere. Clicca di nuovo la stella per rimuovere un task dai preferiti.

### Post-it sul desktop

Fissa qualsiasi task sul desktop cliccando l'icona pin sulla card. Il task appare come post-it renderizzato direttamente nel wallpaper.

Per riposizionare i post-it: clicca l'icona layout (griglia) nell'header della sidebar. Si apre un overlay trasparente dove puoi trascinare ogni post-it nella posizione desiderata. Clicca "Salva" per applicare, o premi Escape per annullare. Le posizioni sono salvate in percentuale, quindi si adattano a qualsiasi risoluzione.

### Time logging su Google Calendar

Clicca l'icona orologio su qualsiasi card per aprire il form di time log. Il form permette di impostare:

- **Data e ora** (default: adesso, arrotondato ai 15 minuti)
- **Durata** in minuti (15-480, a step di 15)
- **Calendario di destinazione** (selezionato tra i tuoi calendari Google con accesso in scrittura)

L'evento creato è formattato come `[CODICE-JIRA] - Titolo Task`, compatibile con Tempo e altri strumenti di tracciamento tempo Jira. Il calendario scelto viene salvato come default per i log futuri.

<div align="center">
<img src="assets/img-readme/log-ore.png" alt="Form di time logging" width="350">
<br><em>Form inline di time log: data, ora, durata e calendario di destinazione</em>
</div>

Per task locali senza codice Jira nel titolo, puoi selezionare un task Jira esistente da un dropdown o digitare un codice manualmente.

Dopo il log, l'icona orologio mostra brevemente una spunta verde, poi torna normale per permettere un nuovo log.

### Timer live

Accanto all'icona orologio, ogni task Jira e locale ha un pulsante play verde. Cliccalo per avviare un timer live:

1. **Avvio**: premi il pulsante play (▶). Se non c'è un calendario di default, compare un piccolo selettore. Per task locali senza codice Jira, viene chiesto di associarne uno prima.
2. **In corso**: il pulsante play viene sostituito da un pulsante stop rosso che mostra il tempo trascorso (es. ■ 00:12:34). Un evento Google Calendar viene creato subito con durata di default 30 minuti e aggiornato ogni 60 secondi.
3. **Fine**: premi il pulsante stop. L'evento sul calendario viene finalizzato con la durata esatta. Una spunta verde conferma il successo.

Mentre un timer è attivo, il task compare in una sezione dedicata **In Corso** in cima alla sidebar, prima di tutte le altre sezioni. Un solo timer alla volta può essere attivo - avviarne uno nuovo ferma automaticamente il precedente.

Se l'app si chiude durante un timer attivo, alla riapertura il timer riprende automaticamente (lo stato è salvato in localStorage).

### Note AI e rilevamento burnout

Clicca la barra di urgenza colorata in cima alla sidebar per espandere il pannello AI. Mostra:

- Una nota clinica in linguaggio naturale che valuta il carico cognitivo ed emotivo
- Un grafico di previsione stress a 5 giorni

Il rilevatore di burnout funziona automaticamente in background, analizzando 7 giorni di storico AI. Se rileva stress sostenuto, recovery insufficiente o carico emotivo alto, invia una notifica desktop. Non serve configurazione - funziona da subito. Puoi regolare le soglie di notifica nelle impostazioni.

### Impostazioni

Clicca l'icona ingranaggio nella sidebar per aprire il pannello impostazioni. Ha 9 tab:

<div align="center">
<img src="assets/img-readme/settings.png" alt="Pannello impostazioni" width="600">
<br><em>Pannello impostazioni: 9 tab di configurazione con reset per sezione</em>
</div>

| Tab         | Cosa puoi configurare                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Generale    | Intervallo sync, finestra lookahead                                    |
| Sorgenti    | Calendari e keyword Google Calendar, istanze Jira e JQL                |
| AI          | Ordine priorità provider, intervallo ricalcolo, timeout, temperatura   |
| Wallpaper   | Abilita/disabilita, immagini sfondo, impostazioni post-it              |
| Sidebar     | Posizione (sinistra/destra), larghezza, opacità                        |
| Notifiche   | Abilita/disabilita, soglia score, cooldown                             |
| Interfaccia | Lingua (italiano/inglese), max task mostrati, formato countdown        |
| Turno       | Giorni lavorativi, fasce orarie, ferie, modalità turno fisso/variabile |
| Avanzate    | Costanti urgency engine e pesi per priorità                            |

Ogni tab ha un pulsante "Reset sezione" per ripristinare i default solo per quella sezione.

### Sync manuale

Per forzare un sync immediato da terminale:

```bash
npm run sync
```

### Posizioni dei file

| Percorso                                    | Contenuto                 |
| ------------------------------------------- | ------------------------- |
| `~/.config/deadlineaura/config.json`        | Configurazione utente     |
| `~/.config/deadlineaura/google-token.json`  | Token OAuth Google (0600) |
| `~/.local/share/deadlineaura/db.sqlite`     | Database SQLite           |
| `~/.local/share/deadlineaura/wallpaper.png` | Wallpaper generato        |

Lo schema completo con i valori di default è in `config/defaults.js`.

## Test

```bash
npm test                  # esegue tutti i test
npm run test:coverage     # esegue con report di coverage v8
npm run lint              # ESLint
```

I test si trovano in `test/` e rispecchiano la struttura di `core/`, `store/`, `ai/` e `integrations/`.

## Contribuire

Apri una issue per discutere le modifiche prima di inviare una pull request. Il codice deve superare `npm run lint` e `npm test` prima della review. Non esiste una guida formale alla contribuzione in questa fase.

## Sicurezza

Per segnalare una vulnerabilità, consulta [SECURITY.it.md](./SECURITY.it.md).

## Licenza

Rilasciato sotto [Apache License 2.0](./LICENSE).

L'uso commerciale è consentito. Se usi Deadline Aura in un prodotto o servizio commerciale, è richiesta l'attribuzione all'autore originale come previsto dalla licenza.

## Autore

Andrea Bonacci — [@AndreaBonn](https://github.com/AndreaBonn)

---

Se questo progetto ti è utile, una [stella su GitHub](https://github.com/AndreaBonn/deadline-aura) aiuta altri a trovarlo.
