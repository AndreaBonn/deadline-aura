# DeadlineAura

Desktop widget per Linux/GNOME che cambia il colore del wallpaper in base all'urgenza delle scadenze. Sincronizza eventi da Google Calendar e issue da Jira, calcola un punteggio di urgenza globale e lo traduce in una transizione cromatica continua (verde → rosso). Un LLM analizza il carico cognitivo complessivo (context switching, frammentazione, carico emotivo) per un punteggio più accurato della semplice distanza temporale.

## Requisiti

- Node.js 20 LTS (`nvm use 20`)
- Linux con GNOME 44+ (Ubuntu 22.04+, Fedora 38+)
- Cairo e Pango (per il package `canvas`)
- `gsettings` (GNOME) o `feh` (fallback) per il wallpaper
- `notify-send` (libnotify) per le notifiche desktop

### Dipendenze di sistema (Ubuntu/Debian)

```bash
sudo apt install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

### Dipendenze di sistema (Fedora)

```bash
sudo dnf install gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel giflib-devel librsvg2-devel
```

## Setup

```bash
git clone <repo-url> deadlineaura
cd deadlineaura
nvm use 20
npm install
cp .env.example .env
# Configura le variabili in .env (vedi sezione Configurazione)
```

## Avvio

```bash
npm start
```

La sidebar Electron appare sul lato destro del desktop. Il wallpaper cambia colore in base allo score di urgenza globale.

## Test

```bash
npm test              # Esegue tutti i test
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run lint          # ESLint
```

## Configurazione

### Variabili d'ambiente (.env)

| Variabile | Descrizione |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID OAuth 2.0 da Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Client Secret OAuth 2.0 |
| `JIRA_DOMAIN` | Dominio Atlassian (es. `azienda.atlassian.net`) |
| `JIRA_EMAIL` | Email account Jira |
| `JIRA_API_TOKEN` | API token generato da id.atlassian.com |
| `GROQ_API_KEYS` | Chiavi API Groq (comma-separated per rotazione) |
| `GEMINI_API_KEYS` | Chiavi API Google Gemini |
| `OPENAI_API_KEYS` | Chiavi API OpenAI |
| `ANTHROPIC_API_KEYS` | Chiavi API Anthropic |
| `AI_PROVIDER_PRIORITY` | Ordine provider (default: `groq,gemini,openai,anthropic`) |
| `AI_RECALC_HOURS` | Ore tra ricalcoli AI forzati (default: 6) |

### Google Calendar OAuth

1. Crea un progetto su [Google Cloud Console](https://console.cloud.google.com)
2. Abilita Google Calendar API
3. Crea credenziali OAuth 2.0 (tipo: Desktop app)
4. Copia Client ID e Client Secret nel `.env`
5. Al primo avvio, il browser si apre per l'autorizzazione

### Jira

1. Genera un API token da [Atlassian Account](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Configura dominio, email e token nel `.env`

### AI Provider

Configura almeno un provider AI per il calcolo del carico cognitivo. L'ordine in `AI_PROVIDER_PRIORITY` determina il failover: se il primo fallisce, si passa al secondo. Ogni provider supporta multiple chiavi API (comma-separated) con rotazione automatica.

Senza provider AI configurato, il sistema usa la formula meccanica (distanza temporale + priorità numerica).

### File di configurazione avanzata

`~/.config/deadlineaura/config.json` — Sovrascrive i default per: intervallo sync, finestra temporale, soglie notifiche, larghezza sidebar, palette colori. Vedi `config/defaults.js` per lo schema completo.

## Architettura

```
Google Calendar ──┐
                   ├──► sync-daemon ──► SQLite ──► deadline-engine ──► color-mapper
Jira            ──┘         │                           │                    │
                        ai-scorer                       │                    ▼
                     (multi-provider)                   │            wallpaper-changer
                                                        │            Electron sidebar
                                                        └──────────► notify-send
```

### Componenti

| Modulo | Responsabilita |
|---|---|
| `core/sync-daemon.js` | Fetch periodico da GCal + Jira, salvataggio su SQLite |
| `core/deadline-engine.js` | Calcolo urgency score per task e score globale |
| `core/color-mapper.js` | Conversione score → palette HSL interpolata |
| `core/wallpaper-changer.js` | Generazione PNG wallpaper + impostazione via gsettings |
| `core/notifier.js` | Notifiche desktop via notify-send |
| `ai/ai-scorer.js` | Orchestrazione AI scoring con cache hash-based |
| `ai/provider-manager.js` | Failover multi-provider + rotazione chiavi |
| `integrations/google-calendar.js` | Client Google Calendar API (OAuth 2.0) |
| `integrations/jira.js` | Client Jira REST API (Basic Auth) |
| `store/db.js` | SQLite init, migrations, query helpers |

### AI Scoring

L'AI non valuta singoli eventi, ma l'intera finestra temporale (72h default). Fattori analizzati:

- Context switching (topic diversi, clienti diversi)
- Complessita cognitiva (deep work vs meeting routine)
- Frammentazione temporale (slot brevi sparsi vs blocchi concentrati)
- Carico emotivo (performance review vs casual sync)
- Pressione cumulativa (giorni intensi in sequenza)

Il risultato viene cachato e ricalcolato solo quando cambia il set di eventi o ogni 6 ore.

## Autostart

```bash
# Systemd timer per sync (ogni 5 minuti)
cp systemd/deadlineaura-sync.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now deadlineaura-sync.timer

# Autostart widget al login
cp autostart/deadlineaura.desktop ~/.config/autostart/
```

## Dati locali

| Percorso | Contenuto |
|---|---|
| `~/.config/deadlineaura/config.json` | Configurazione utente |
| `~/.config/deadlineaura/google-token.json` | Token OAuth Google (600) |
| `~/.local/share/deadlineaura/db.sqlite` | Database SQLite |
| `~/.local/share/deadlineaura/wallpaper.png` | Wallpaper generato |

Nessun dato viene inviato a server terzi oltre alle API Google, Atlassian e provider AI configurati.

## Licenza

MIT
