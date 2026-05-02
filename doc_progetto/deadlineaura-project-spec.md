# DeadlineAura — Documento di Progetto

**Versione:** 1.0  
**Data:** 22 marzo 2026  
**Stato:** Pronto per sviluppo  

---

## Indice

1. [Visione e obiettivi](#1-visione-e-obiettivi)
2. [Panoramica del sistema](#2-panoramica-del-sistema)
3. [Stack tecnologico](#3-stack-tecnologico)
4. [Architettura dei componenti](#4-architettura-dei-componenti)
5. [Struttura del progetto](#5-struttura-del-progetto)
6. [Componenti core](#6-componenti-core)
   - 6.1 [sync-daemon](#61-sync-daemon)
   - 6.2 [deadline-engine](#62-deadline-engine)
   - 6.3 [color-mapper](#63-color-mapper)
   - 6.4 [wallpaper-changer](#64-wallpaper-changer)
   - 6.5 [Electron widget](#65-electron-widget)
7. [Integrazione Google Calendar](#7-integrazione-google-calendar)
8. [Integrazione Jira](#8-integrazione-jira)
9. [Database locale](#9-database-locale)
10. [UI della sidebar](#10-ui-della-sidebar)
11. [Configurazione GNOME / Linux](#11-configurazione-gnome--linux)
12. [Autostart e systemd](#12-autostart-e-systemd)
13. [Configurazione utente](#13-configurazione-utente)
14. [Notifiche](#14-notifiche)
15. [Sicurezza e privacy](#15-sicurezza-e-privacy)
16. [Testing](#16-testing)
17. [Roadmap e fasi di sviluppo](#17-roadmap-e-fasi-di-sviluppo)
18. [Glossario](#18-glossario)

---

## 1. Visione e obiettivi

### 1.1 Descrizione del prodotto

DeadlineAura è un widget desktop per Linux/GNOME che crea una **pressione ambientale percettiva** basata sulle scadenze dell'utente. Il sistema recupera task e appuntamenti da Google Calendar e Jira, calcola un punteggio di urgenza globale e lo traduce in un cambiamento visivo continuo: il colore del wallpaper del desktop si intensifica gradualmente dal verde calmo al rosso critico man mano che le scadenze si avvicinano.

L'obiettivo non è urlare notifiche — è creare un senso di consapevolezza temporale passiva, senza interrompere il flusso di lavoro.

### 1.2 Principi di design

- **Passività:** il sistema non richiede interazione per funzionare
- **Continuità:** la transizione cromatica è fluida, non a scatti
- **Località:** tutti i dati restano sul dispositivo dell'utente; nessun dato viene inviato a server terzi al di là delle API di Google e Jira
- **Leggerezza:** l'impatto sulla CPU/memoria deve essere trascurabile durante il normale utilizzo
- **Configurabilità:** soglie, palette, intervalli di sync e sorgenti dati sono configurabili dall'utente

### 1.3 Utente target

Developer e knowledge worker che lavorano su Linux/GNOME, gestiscono task su Jira e appuntamenti su Google Calendar, e vogliono una gestione del tempo meno intrusiva rispetto ai sistemi di notifica tradizionali.

---

## 2. Panoramica del sistema

Il sistema è composto da tre processi principali che comunicano tra loro tramite SQLite locale e IPC Electron:

```
[Google Calendar API] ──┐
                         ├──► [sync-daemon] ──► [SQLite] ──► [deadline-engine] ──► [color-mapper]
[Jira REST API]      ──┘                                                                  │
                                                                                          ▼
                                                                              [wallpaper-changer]
                                                                              [Electron widget sidebar]
                                                                              [notify-send]
```

Il flusso principale è:

1. `sync-daemon` esegue periodicamente (ogni 5 minuti via systemd timer) e salva task/eventi su SQLite
2. `deadline-engine` legge da SQLite, calcola l'urgency score per ogni task e uno score globale aggregato
3. `color-mapper` converte lo score globale in una palette HSL
4. `wallpaper-changer` genera un PNG con il colore calcolato e lo imposta come sfondo via `gsettings`
5. L'**Electron widget** (sidebar fissa sul lato destro del desktop) mostra la lista dei task con i relativi score visivi, si aggiorna ogni 60 secondi

---

## 3. Stack tecnologico

| Layer | Tecnologia | Versione minima | Note |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | Richiesto per Electron e daemon |
| Widget framework | Electron | 30.x | BrowserWindow con `type: 'desktop'` |
| UI | HTML5 / CSS3 / Vanilla JS | — | Nessun framework frontend |
| Database locale | SQLite | 3.40+ | Via `better-sqlite3` (sincrono) |
| Autenticazione Google | OAuth 2.0 | — | Libreria `googleapis` |
| Autenticazione Jira | API Token (Basic Auth) | — | Header `Authorization: Basic` |
| Generazione immagine wallpaper | `canvas` (npm) | 2.x | Canvas API node-side |
| Desktop integration | gsettings / feh | — | gsettings per GNOME, feh come fallback |
| Scheduling daemon | systemd timer | — | Alternativa: `node-cron` embedded |
| Notifiche | `notify-send` (libnotify) | — | Chiamata a processo di sistema |
| Package manager | npm | 10+ | |
| Target OS | Linux (Ubuntu 22.04+, Fedora 38+) | — | GNOME 44+ raccomandato |

---

## 4. Architettura dei componenti

### 4.1 Diagramma dei processi

```
┌─────────────────────────────────────────────────────────────┐
│  Sistema operativo Linux / GNOME                            │
│                                                             │
│  ┌──────────────────┐     ┌──────────────────────────────┐ │
│  │  systemd timer   │────►│  sync-daemon (Node.js)       │ │
│  │  ogni 5 min      │     │  - fetch GCal                │ │
│  └──────────────────┘     │  - fetch Jira                │ │
│                           │  - scrivi su SQLite           │ │
│                           └──────────────┬───────────────┘ │
│                                          │                  │
│                           ┌──────────────▼───────────────┐ │
│                           │  SQLite  (~/.local/share/     │ │
│                           │  deadlineaura/db.sqlite)      │ │
│                           └──────────────┬───────────────┘ │
│                                          │                  │
│  ┌───────────────────────────────────────▼──────────────┐  │
│  │  Electron main process (sempre in esecuzione)        │  │
│  │                                                      │  │
│  │  ┌─────────────────┐   ┌────────────────────────┐   │  │
│  │  │ deadline-engine │──►│ color-mapper           │   │  │
│  │  │ calcola score   │   │ score → HSL palette    │   │  │
│  │  └─────────────────┘   └──────────┬─────────────┘   │  │
│  │                                   │                  │  │
│  │           ┌───────────────────────┼────────────┐    │  │
│  │           ▼                       ▼            ▼    │  │
│  │  ┌─────────────────┐  ┌───────────────┐  ┌────────┐ │  │
│  │  │wallpaper-changer│  │ BrowserWindow │  │notify  │ │  │
│  │  │gsettings / feh  │  │ sidebar UI    │  │-send   │ │  │
│  │  └─────────────────┘  └───────────────┘  └────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Comunicazione tra processi

- **sync-daemon → SQLite:** scrittura diretta tramite `better-sqlite3`
- **Electron → SQLite:** lettura diretta tramite `better-sqlite3` nel main process
- **Electron main → BrowserWindow:** IPC tramite `ipcMain` / `ipcRenderer`
- **Electron → gsettings:** `child_process.exec()` nel main process
- **Electron → notify-send:** `child_process.exec()` nel main process

---

## 5. Struttura del progetto

```
deadlineaura/
│
├── package.json
├── package-lock.json
├── .env.example                    # Template variabili d'ambiente
├── README.md
│
├── main.js                         # Electron main process
├── preload.js                      # Electron preload script (context bridge)
│
├── renderer/                       # Frontend widget (BrowserWindow)
│   ├── index.html
│   ├── sidebar.js
│   └── styles.css
│
├── core/                           # Logica business (Node.js puro, testabile)
│   ├── sync-daemon.js              # Fetch da GCal + Jira, scrivi su DB
│   ├── deadline-engine.js          # Calcolo urgency score
│   ├── color-mapper.js             # Score → palette HSL
│   ├── wallpaper-changer.js        # Genera PNG + imposta wallpaper
│   └── notifier.js                 # Wrapper notify-send
│
├── store/
│   ├── db.js                       # Inizializzazione SQLite, schema, query
│   └── migrations/
│       └── 001_initial.sql
│
├── integrations/
│   ├── google-calendar.js          # Client Google Calendar API
│   └── jira.js                     # Client Jira REST API
│
├── config/
│   ├── defaults.js                 # Valori di default configurazione
│   └── schema.js                   # Validazione config con joi/zod
│
├── scripts/
│   ├── install.sh                  # Script installazione sistema
│   └── uninstall.sh
│
├── systemd/
│   └── deadlineaura-sync.service   # Unit systemd per il daemon
│   └── deadlineaura-sync.timer     # Timer systemd
│
├── autostart/
│   └── deadlineaura.desktop        # File autostart GNOME
│
└── test/
    ├── deadline-engine.test.js
    ├── color-mapper.test.js
    └── db.test.js
```

---

## 6. Componenti core

### 6.1 sync-daemon

**File:** `core/sync-daemon.js`  
**Responsabilità:** recuperare task e appuntamenti da Google Calendar e Jira, normalizzarli e salvarli su SQLite.

**Comportamento:**
- Viene invocato dal timer systemd ogni 5 minuti
- Può anche essere invocato manualmente dall'Electron main process (su richiesta utente)
- Prima di scrivere, marca come `stale` i task della stessa sorgente non più presenti nella risposta API (soft delete)
- Gestisce gli errori di rete con retry esponenziale (max 3 tentativi, backoff 2s/4s/8s)

**Schema di output (record normalizzato):**

```js
{
  id: "gcal_abc123",           // fonte + id originale
  source: "gcal" | "jira",
  title: "Sprint Review",
  due_at: 1711234567000,       // timestamp Unix ms, null se senza scadenza
  priority: 1-4,               // 1=massima, 4=minima (normalizzato da entrambe le sorgenti)
  is_done: false,
  raw_json: "{ ... }",         // payload originale serializzato
  synced_at: 1711234500000
}
```

**Mappatura priorità Jira → priorità interna:**

| Jira priority | Valore interno |
|---|---|
| Highest / Blocker | 1 |
| High | 2 |
| Medium | 3 |
| Low / Lowest | 4 |

**Mappatura Google Calendar → priorità interna:**  
Gli eventi di Calendar non hanno priorità nativa. Si usa la seguente logica:
- Evento con `colorId` rosso → 1
- Evento nel calendario "Lavoro" o con parola chiave critica nel titolo (`urgent`, `deadline`, `release`, `deploy`) → 2
- Default → 3

Questa logica è configurabile dall'utente (vedere sezione 13).

---

### 6.2 deadline-engine

**File:** `core/deadline-engine.js`  
**Responsabilità:** calcolare un punteggio di urgenza (0.0–1.0) per ogni task e uno score globale aggregato.

**Formula per singolo task:**

```
urgency_raw = priority_weight / max(hours_remaining, 0.5)

urgency_score = 1 - e^(-k * urgency_raw)
```

Dove:
- `priority_weight` è `[2.0, 1.5, 1.0, 0.5]` per priorità `[1, 2, 3, 4]`
- `hours_remaining` = `(due_at - now) / 3600000`
- `k` = costante di scala, default `0.05` (configurabile)
- Task senza `due_at` ricevono un `urgency_score` fisso di `0.1`
- Task già scaduti (`hours_remaining < 0`) ricevono `urgency_score = 1.0`
- Task con `is_done = true` sono esclusi dal calcolo

**Score globale:**

Lo score globale è la **media pesata** degli score individuali, con peso = `priority_weight`:

```
global_score = Σ(score_i * weight_i) / Σ(weight_i)
```

Solo i task con `due_at` nelle prossime `N` ore entrano nel calcolo. `N` è configurabile (default: 72 ore).

**Output:**

```js
{
  global_score: 0.73,
  tasks: [
    {
      id: "gcal_abc123",
      title: "Sprint Review",
      urgency_score: 0.92,
      hours_remaining: 1.3,
      priority: 1,
      source: "gcal"
    },
    // ...
  ],
  computed_at: 1711234567000
}
```

---

### 6.3 color-mapper

**File:** `core/color-mapper.js`  
**Responsabilità:** convertire lo score globale (0.0–1.0) in una palette di colori HSL per il wallpaper e la UI.

**Mappatura HSL:**

| Score | Hue | Saturation | Lightness (bg) | Significato percettivo |
|---|---|---|---|---|
| 0.00 – 0.20 | 160° | 35% | 12% | Calmo, verde-teal |
| 0.20 – 0.40 | 120° | 40% | 10% | Normale, verde |
| 0.40 – 0.60 | 60° | 45% | 9% | Attenzione, ambra |
| 0.60 – 0.80 | 20° | 50% | 8% | Urgente, arancio |
| 0.80 – 1.00 | 0° | 55% | 7% | Critico, rosso |

La transizione tra una fascia e l'altra è **lineare interpolata** (non a scatti) usando `lerp(hue_a, hue_b, t)` dove `t` è la posizione dello score all'interno della fascia.

**Output:**

```js
{
  hsl: { h: 145, s: 37, l: 11 },
  hex: "#0f2b1e",
  accent_hex: "#1d9e75",    // per UI sidebar (dot, bordo task)
  label: "calmo"            // "calmo" | "normale" | "attenzione" | "urgente" | "critico"
}
```

---

### 6.4 wallpaper-changer

**File:** `core/wallpaper-changer.js`  
**Responsabilità:** generare un'immagine PNG con il colore calcolato e impostarla come sfondo desktop.

**Flusso:**

1. Riceve la palette da `color-mapper`
2. Crea un canvas `1920x1080` (o risoluzione rilevata dinamicamente) tramite il package `canvas`
3. Riempie il canvas con il colore di sfondo; opzionalmente applica un radial gradient sottile per profondità visiva
4. Salva il PNG in `~/.local/share/deadlineaura/wallpaper.png`
5. Imposta il wallpaper tramite:

```bash
gsettings set org.gnome.desktop.background picture-uri "file:///home/user/.local/share/deadlineaura/wallpaper.png"
gsettings set org.gnome.desktop.background picture-uri-dark "file:///home/user/.local/share/deadlineaura/wallpaper.png"
gsettings set org.gnome.desktop.background picture-options "zoom"
```

6. Come fallback (ambienti non GNOME): `feh --bg-scale /path/to/wallpaper.png`

**Ottimizzazione:** il wallpaper viene rigenerato solo se lo score è cambiato di più di `0.02` rispetto all'ultimo aggiornamento (evita rigenerazioni continue per piccole fluttuazioni).

**Risoluzione dinamica:**

```js
const { execSync } = require('child_process');
const res = execSync("xdpyinfo | grep dimensions").toString();
// parse "dimensions: 1920x1080 pixels"
```

---

### 6.5 Electron widget

**File:** `main.js` (main process) + `renderer/` (renderer process)

**Caratteristiche della finestra:**

```js
const win = new BrowserWindow({
  width: 260,
  height: workAreaHeight,       // altezza area di lavoro GNOME (esclusa topbar)
  x: screenWidth - 260,
  y: workAreaY,                 // offset topbar GNOME (tipicamente 32px)
  frame: false,
  transparent: true,
  alwaysOnTop: false,
  skipTaskbar: true,
  focusable: false,             // non cattura il focus della tastiera
  type: 'normal',
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
});

win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
win.setIgnoreMouseEvents(false);  // il widget è cliccabile
```

> **Nota:** `type: 'desktop'` su alcuni DE Linux posiziona la finestra sotto le icone del desktop e potrebbe rendere il widget non cliccabile. Usare `type: 'normal'` con `alwaysOnTop: false` e `skipTaskbar: true` è più affidabile su GNOME.

**Ciclo di aggiornamento nel main process:**

```js
setInterval(async () => {
  const engineResult = await runDeadlineEngine();
  const palette = colorMapper(engineResult.global_score);
  await wallpaperChanger.update(palette);
  win.webContents.send('update', { engineResult, palette });
}, 60_000); // ogni 60 secondi
```

**IPC esposto via preload.js:**

```js
// preload.js
contextBridge.exposeInMainWorld('deadlineAura', {
  onUpdate: (callback) => ipcRenderer.on('update', (_, data) => callback(data)),
  openConfig: () => ipcRenderer.send('open-config'),
  syncNow: () => ipcRenderer.send('sync-now'),
  markDone: (taskId) => ipcRenderer.send('mark-done', taskId)
});
```

---

## 7. Integrazione Google Calendar

**File:** `integrations/google-calendar.js`

### 7.1 Autenticazione

Si utilizza il flusso **OAuth 2.0 per applicazioni desktop** (installed app flow):

1. Al primo avvio, l'app apre nel browser di sistema la pagina di consenso Google
2. L'utente autorizza l'accesso; Google redirige a `http://localhost:PORT/oauth/callback`
3. L'app riceve il `code`, lo scambia con `access_token` e `refresh_token`
4. I token sono salvati in `~/.config/deadlineaura/google-token.json` (permessi `600`)
5. Ad ogni richiesta, se `access_token` è scaduto, viene rinnovato automaticamente tramite `refresh_token`

**Scope richiesti:** `https://www.googleapis.com/auth/calendar.readonly`

**Dipendenze npm:** `googleapis`

### 7.2 Fetch eventi

Si recuperano gli eventi delle prossime `N` ore (default 72):

```js
const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

const response = await calendar.events.list({
  calendarId: 'primary',           // o lista da config utente
  timeMin: new Date().toISOString(),
  timeMax: new Date(Date.now() + 72 * 3600000).toISOString(),
  singleEvents: true,
  orderBy: 'startTime',
  maxResults: 50
});
```

### 7.3 Normalizzazione

- Gli eventi senza `end.dateTime` (tutto-il-giorno) usano `end.date` a mezzanotte del giorno
- Gli eventi ricorrenti compaiono come istanze singole (grazie a `singleEvents: true`)
- Gli eventi già terminati (`end < now`) vengono scartati

---

## 8. Integrazione Jira

**File:** `integrations/jira.js`

### 8.1 Autenticazione

Jira Cloud usa **API Token** con Basic Auth:

```
Authorization: Basic base64(email:api_token)
```

L'utente genera il token da: `https://id.atlassian.com/manage-profile/security/api-tokens`

Credenziali salvate in `~/.config/deadlineaura/config.json` (vedere sezione 13).

### 8.2 Fetch issue

```
GET https://{domain}.atlassian.net/rest/api/3/search
  ?jql=assignee=currentUser() AND statusCategory != Done AND due <= {72h_from_now}
  &fields=summary,priority,duedate,status,assignee
  &maxResults=50
```

**JQL configurabile dall'utente.** Il filtro di default recupera solo issue assegnate all'utente, non completate, con due date entro la finestra temporale.

### 8.3 Gestione paginazione

Se il risultato contiene `total > maxResults`, il client esegue fetch paginati fino a recuperare tutte le issue.

### 8.4 Normalizzazione

```js
{
  id: `jira_${issue.id}`,
  source: 'jira',
  title: `${issue.key} · ${issue.fields.summary}`,
  due_at: issue.fields.duedate
    ? new Date(issue.fields.duedate + 'T23:59:59').getTime()
    : null,
  priority: mapJiraPriority(issue.fields.priority.name),
  is_done: false,
  raw_json: JSON.stringify(issue)
}
```

---

## 9. Database locale

**File:** `store/db.js`  
**Path:** `~/.local/share/deadlineaura/db.sqlite`

### 9.1 Schema

```sql
-- Migration 001_initial.sql

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK(source IN ('gcal', 'jira')),
  title       TEXT NOT NULL,
  due_at      INTEGER,              -- timestamp Unix ms, NULL se non definito
  priority    INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  is_done     INTEGER NOT NULL DEFAULT 0,
  is_stale    INTEGER NOT NULL DEFAULT 0,  -- 1 = non più presente in API
  raw_json    TEXT,
  synced_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  global_score  REAL NOT NULL,
  computed_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_is_done ON tasks(is_done);
CREATE INDEX IF NOT EXISTS idx_scores_computed_at ON scores(computed_at);
```

### 9.2 Query principali

```js
// Task attivi con scadenza entro N ore
db.prepare(`
  SELECT * FROM tasks
  WHERE is_done = 0
    AND is_stale = 0
    AND (due_at IS NULL OR due_at <= ?)
  ORDER BY due_at ASC NULLS LAST, priority ASC
`).all(Date.now() + hoursWindow * 3600000);

// Ultimo score globale
db.prepare(`
  SELECT global_score FROM scores
  ORDER BY computed_at DESC LIMIT 1
`).get();
```

### 9.3 Pulizia automatica

Ogni 24 ore, il main process elimina i record con più di 7 giorni di anzianità dalla tabella `scores` e i task con `is_stale = 1` sincronizzati da più di 48 ore.

---

## 10. UI della sidebar

**File:** `renderer/index.html`, `renderer/sidebar.js`, `renderer/styles.css`

### 10.1 Layout

```
┌─────────────────────────────┐
│  [orologio grande]  09:41   │
│  Lunedì 22 marzo 2026       │
│  ─────────────────────────  │
│  [barra urgenza globale]    │
│                             │
│  GOOGLE CALENDAR            │
│  ┌─────────────────────┐    │
│  │ Sprint Review  1h ● │    │
│  │ calendar · Lavoro   │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ Chiamata 15:00    ● │    │
│  │ calendar · Personal │    │
│  └─────────────────────┘    │
│                             │
│  JIRA                       │
│  ┌─────────────────────┐    │
│  │ AUTH-441 Fix login ●│    │
│  │ Jira · High         │    │
│  └─────────────────────┘    │
│  ...                        │
│                             │
│  [⚙] [↻ sync now]          │
└─────────────────────────────┘
```

### 10.2 Elementi UI

**Orologio:** aggiornato ogni secondo tramite `setInterval`.

**Barra urgenza globale:** barra orizzontale la cui larghezza (0–100%) e colore di riempimento riflettono lo score globale. Transizione CSS `transition: width 2s ease, background-color 2s ease`.

**Task card:**
- Bordo sinistro colorato in base all'urgency_score del singolo task
- Dot colorato a destra del countdown
- Countdown nel formato: `tra Xh Ym` / `oggi` / `domani` / `tra N giorni`
- Click sulla card apre il task nel browser (Google Calendar o Jira)

**Pulsanti footer:**
- `⚙` apre la finestra di configurazione
- `↻` forza una sincronizzazione immediata

### 10.3 Aggiornamento UI

La sidebar riceve aggiornamenti via IPC:

```js
// renderer/sidebar.js
window.deadlineAura.onUpdate((data) => {
  renderUrgencyBar(data.palette.global_score);
  renderTaskList(data.engineResult.tasks, data.palette);
  renderClock();
});
```

### 10.4 Stile

La sidebar usa uno sfondo semi-trasparente scuro (`rgba(10, 12, 20, 0.75)`) con `backdrop-filter: blur(12px)` per integrarsi visivamente con qualsiasi wallpaper. I testi sono bianchi con opacità variabile per la gerarchia visiva. Non usare colori hardcoded per il testo; tutto varia in base alla palette di urgenza.

---

## 11. Configurazione GNOME / Linux

### 11.1 Posizionamento finestra

La finestra Electron deve occupare il lato destro del desktop, sotto la topbar GNOME:

```js
// main.js
const { screen } = require('electron');
const primaryDisplay = screen.getPrimaryDisplay();
const { width, height } = primaryDisplay.workAreaSize;
const { x: wx, y: wy } = primaryDisplay.workArea;

win.setBounds({
  x: wx + width - 260,
  y: wy,
  width: 260,
  height: height
});
```

### 11.2 Esclusione dall'area di lavoro (opzionale)

Su GNOME, è possibile "riservare" lo spazio della sidebar impostando le proprietà XAtom `_NET_WM_STRUT` e `_NET_WM_STRUT_PARTIAL`. Questo fa sì che le finestre massimizzate non si sovrappongano alla sidebar. Richiede il package `x11` (npm) o un wrapper nativo.

```js
// Implementazione con x11 npm package
const strut = [0, 260, 0, 0];  // [left, right, top, bottom] in pixel
const strutPartial = [0, 260, 0, 0, 0, 0, wy, wy + height, 0, 0, 0, 0];
```

Questa feature è **opzionale** nella v1.0 e può essere aggiunta in v1.1.

### 11.3 Compatibilità multi-monitor

Rilevare il monitor primario e posizionare la sidebar su di esso. Se l'utente ha più monitor, esporre nelle impostazioni la possibilità di scegliere su quale monitor mostrare la sidebar.

---

## 12. Autostart e systemd

### 12.1 Autostart Electron widget

**File:** `autostart/deadlineaura.desktop`

```ini
[Desktop Entry]
Type=Application
Name=DeadlineAura
Exec=/usr/bin/deadlineaura --no-sandbox
Icon=deadlineaura
Comment=Deadline-aware desktop widget
Categories=Utility;
X-GNOME-Autostart-enabled=true
Hidden=false
NoDisplay=false
```

Installato in `~/.config/autostart/deadlineaura.desktop`.

### 12.2 Systemd timer per sync-daemon

**File:** `systemd/deadlineaura-sync.service`

```ini
[Unit]
Description=DeadlineAura sync daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/node /opt/deadlineaura/core/sync-daemon.js
User=%i
Environment=HOME=/home/%i
StandardOutput=journal
StandardError=journal
```

**File:** `systemd/deadlineaura-sync.timer`

```ini
[Unit]
Description=DeadlineAura sync ogni 5 minuti
Requires=deadlineaura-sync.service

[Timer]
OnBootSec=30sec
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

**Installazione:**

```bash
cp systemd/deadlineaura-sync.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now deadlineaura-sync.timer
```

### 12.3 Script di installazione

**File:** `scripts/install.sh`

```bash
#!/usr/bin/env bash
set -e

INSTALL_DIR="/opt/deadlineaura"
DATA_DIR="$HOME/.local/share/deadlineaura"
CONFIG_DIR="$HOME/.config/deadlineaura"

echo "Installing DeadlineAura..."

mkdir -p "$DATA_DIR" "$CONFIG_DIR"

# Copia file applicazione
sudo cp -r . "$INSTALL_DIR"
sudo npm --prefix "$INSTALL_DIR" install --production

# Copia config di default
cp config/defaults.json "$CONFIG_DIR/config.json"

# Systemd timer
cp systemd/deadlineaura-sync.{service,timer} "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now deadlineaura-sync.timer

# Autostart
cp autostart/deadlineaura.desktop "$HOME/.config/autostart/"

echo "Installation complete. Log out and log in to start DeadlineAura."
```

---

## 13. Configurazione utente

**File di configurazione:** `~/.config/deadlineaura/config.json`

```json
{
  "sync": {
    "interval_minutes": 5,
    "lookahead_hours": 72
  },
  "sources": {
    "google_calendar": {
      "enabled": true,
      "calendars": ["primary"],
      "priority_keywords": ["urgent", "deadline", "release", "deploy", "critico"]
    },
    "jira": {
      "enabled": true,
      "domain": "yourcompany.atlassian.net",
      "email": "user@example.com",
      "api_token": "",
      "jql": "assignee = currentUser() AND statusCategory != Done AND due <= 72h"
    }
  },
  "engine": {
    "k_constant": 0.05,
    "priority_weights": [2.0, 1.5, 1.0, 0.5]
  },
  "wallpaper": {
    "enabled": true,
    "min_score_delta": 0.02,
    "resolution": "auto"
  },
  "sidebar": {
    "width": 260,
    "position": "right",
    "monitor": "primary",
    "opacity": 0.75
  },
  "notifications": {
    "enabled": true,
    "threshold_score": 0.85,
    "cooldown_minutes": 30
  },
  "ui": {
    "max_tasks_shown": 8,
    "show_source_badge": true,
    "countdown_format": "relative"
  }
}
```

La finestra di configurazione (aperta dal pulsante `⚙`) è una seconda `BrowserWindow` Electron che legge e scrive questo file JSON.

---

## 14. Notifiche

**File:** `core/notifier.js`

Le notifiche desktop vengono inviate tramite `notify-send` solo quando:

1. `global_score >= config.notifications.threshold_score` (default 0.85)
2. Non è stata inviata una notifica nelle ultime `cooldown_minutes` (default 30)
3. Esiste almeno un task con `urgency_score > 0.9`

**Formato notifica:**

```bash
notify-send \
  --urgency=normal \
  --icon=deadlineaura \
  --app-name="DeadlineAura" \
  "Scadenza imminente" \
  "Sprint Review tra 45 minuti"
```

Viene notificato solo il task con score più alto. Se più task hanno score identico, viene preferito quello con `priority` più alta (numero più basso).

---

## 15. Sicurezza e privacy

### 15.1 Storage credenziali

| Dato | Percorso | Permessi |
|---|---|---|
| Google OAuth token | `~/.config/deadlineaura/google-token.json` | `600` |
| Jira API token | `~/.config/deadlineaura/config.json` | `600` |
| Database SQLite | `~/.local/share/deadlineaura/db.sqlite` | `600` |
| Wallpaper PNG | `~/.local/share/deadlineaura/wallpaper.png` | `644` |

Lo script `install.sh` imposta automaticamente questi permessi.

### 15.2 Trasmissione dati

- I dati dei task vengono trasmessi **esclusivamente** alle API Google e Atlassian, mai ad altri server
- Nessuna telemetria, nessun analytics, nessun crash report remoto
- L'applicazione non ha backend proprio

### 15.3 Electron security

- `contextIsolation: true` — il renderer non ha accesso diretto a Node.js
- `nodeIntegration: false` — nessuna API Node nel renderer
- Tutta la comunicazione renderer ↔ main passa per il context bridge nel `preload.js`
- Content Security Policy nel renderer:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">
```

### 15.4 Revoca accesso

L'utente può revocare l'accesso a Google in qualsiasi momento da `myaccount.google.com/permissions`. L'app rileverà il token non valido al prossimo sync e mostrerà un prompt di ri-autenticazione.

---

## 16. Testing

### 16.1 Unit test

**Framework:** Jest  
**File:** `test/*.test.js`

Copertura minima richiesta: **80%** per i file in `core/` e `store/`.

**Test prioritari:**

```
deadline-engine.test.js
  ✓ score = 1.0 per task scaduto
  ✓ score = 0.1 per task senza due_at
  ✓ task con is_done=true esclusi dal calcolo
  ✓ global_score è media pesata corretta
  ✓ k_constant diverso cambia la curva

color-mapper.test.js
  ✓ score 0.0 → hue 160
  ✓ score 1.0 → hue 0
  ✓ interpolazione lineare nelle fasce
  ✓ output hex valido

db.test.js
  ✓ inserimento e lettura task
  ✓ soft delete (is_stale)
  ✓ query per finestra temporale
```

### 16.2 Test di integrazione

Mockare le API esterne (Google Calendar, Jira) con `nock` o `msw`. Verificare il flusso completo sync → engine → color → wallpaper senza connessione reale.

### 16.3 Test manuali

Prima del rilascio, verificare manualmente su:
- Ubuntu 22.04 + GNOME 44
- Ubuntu 24.04 + GNOME 46
- Fedora 39 + GNOME 45

Scenari da verificare:
- Prima installazione e flusso OAuth Google
- Widget visibile dopo riavvio del sistema
- Cambio wallpaper visibile con score variabile
- Notifica inviata al superamento soglia
- Sync manuale funzionante
- Finestra di configurazione scrive correttamente il file

---

## 17. Roadmap e fasi di sviluppo

### Fase 1 — MVP (4 settimane)

- Setup progetto Electron + struttura cartelle
- Integrazione Google Calendar (OAuth + fetch)
- Integrazione Jira (API token + fetch)
- Database SQLite con schema base
- `deadline-engine` con formula di score
- `color-mapper` con palette HSL
- `wallpaper-changer` con gsettings
- Sidebar minimale (orologio + lista task + barra urgenza)
- Systemd timer per sync
- Autostart GNOME

### Fase 2 — Rifinimento (2 settimane)

- Finestra di configurazione completa
- Notifiche desktop con cooldown
- Gestione errori robusta (retry, UI di errore per token scaduti)
- Script di installazione/disinstallazione
- Ottimizzazione: evitare rigenerazione wallpaper se delta < soglia
- Test unitari (copertura ≥ 80%)

### Fase 3 — Funzionalità avanzate (2 settimane)

- Supporto multi-monitor
- `_NET_WM_STRUT` per riservare spazio sidebar
- Temi colore personalizzabili (non solo verde→rosso)
- Supporto calendari Google multipli
- Mark-as-done direttamente dalla sidebar (Jira: transizione issue; GCal: non applicabile)
- Export statistiche urgenza (CSV)

---

## 18. Glossario

| Termine | Definizione |
|---|---|
| **urgency_score** | Punteggio 0.0–1.0 che rappresenta l'urgenza di un singolo task, calcolato da scadenza e priorità |
| **global_score** | Media pesata degli urgency_score di tutti i task attivi nella finestra temporale |
| **color-mapper** | Componente che converte global_score in una palette HSL |
| **sync-daemon** | Processo Node.js che recupera periodicamente i dati da Google Calendar e Jira |
| **deadline-engine** | Componente che calcola gli score leggendo dal database locale |
| **wallpaper-changer** | Componente che genera il PNG e imposta il wallpaper via gsettings |
| **lookahead window** | Finestra temporale futura (in ore) entro cui i task vengono considerati nel calcolo |
| **k_constant** | Parametro della curva esponenziale che controlla quanto rapidamente lo score si avvicina a 1.0 |
| **is_stale** | Flag che indica un task non più presente nell'API ma non ancora eliminato dal DB |
| **BrowserWindow** | Finestra dell'applicazione Electron che ospita il renderer HTML/CSS/JS |
| **IPC** | Inter-Process Communication — il meccanismo con cui main process e renderer si scambiano messaggi in Electron |
| **gsettings** | Tool GNOME per impostare le preferenze del desktop, incluso lo sfondo |
| **workArea** | Area del desktop escludendo pannelli e dock di sistema |

---

*Documento preparato per il team di sviluppo. Per domande o chiarimenti, fare riferimento al responsabile di progetto.*
