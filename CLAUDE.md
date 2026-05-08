# DeadlineAura

Desktop widget per Linux/GNOME che crea pressione ambientale visiva basata sulle scadenze.

## Stack

- **Runtime:** Node.js 20 LTS (CJS)
- **Widget:** Electron 30.x
- **UI:** HTML/CSS/Vanilla JS
- **DB:** SQLite via better-sqlite3
- **Wallpaper:** canvas npm (PNG generation + gsettings)
- **AI scoring:** Multi-provider (Groq, Gemini, OpenAI, Anthropic) via HTTP diretto
- **Test:** Vitest
- **Lint:** ESLint 9 + Prettier

## Comandi

```bash
nvm use 20               # Obbligatorio — canvas non compila su Node 24
npm test                  # Vitest run
npm run test:watch        # Vitest watch mode
npm run test:coverage     # Coverage report
npm run lint              # ESLint
npm start                 # Avvia Electron
node core/sync-daemon.js  # Sync manuale
```

## Struttura

```
core/               — Business logic (engine, color-mapper, wallpaper, notifier, sync)
core/wallpaper-renderer.js  — Rendering wallpaper: sfondo immagine + tint + post-it + calendar
core/postit-renderer.js     — Disegno singolo post-it su canvas
core/display-manager.js     — Detect multi-monitor, geometria canvas composito
ai/                 — AI scoring (multi-provider con failover e key rotation)
ai/providers/       — Provider implementations (groq, gemini, openai, anthropic)
integrations/       — Client API esterne (Google Calendar, Jira)
store/              — SQLite init, migrations, query helpers
store/pinned-queries.js — CRUD pinned tasks (pin/unpin, posizioni, query per display)
store/local-queries.js  — CRUD task locali (source='local', no sync esterno)
config/             — Defaults e schema Zod
renderer/           — Sidebar + overlay UI (HTML/CSS/JS)
renderer/overlay.*  — Overlay trasparente per drag & drop posizionamento post-it
assets/backgrounds/ — 5 immagini sfondo mappate su bande urgenza
test/               — Mirror struttura src/
```

## Decisioni architetturali

- AI scoring olistico: batch completo eventi → valutazione carico cognitivo/emotivo
- AI invocata solo su cambio eventi (hash-based) o ogni 6 ore
- Fallback a formula meccanica se AI non disponibile
- Provider con failover in ordine di priorità configurabile
- `canvas` (non sharp) per supporto testo su wallpaper
- CJS per compatibilità better-sqlite3 + Electron
- Wallpaper composito spanned per multi-monitor (singolo PNG, picture-options=spanned)
- Post-it task renderizzati nel wallpaper PNG (non finestre sopra desktop)
- Overlay Electron trasparente effimero per drag & drop posizionamento
- Posizioni post-it in percentuale (x%, y%) per adattarsi a qualsiasi risoluzione
- Preload separato per overlay (principio minimo privilegio)
- Task locali (source='local'): CRUD dalla sidebar, no sync esterno, pinnabili come post-it
- Task locali non diventano stale e non hanno lookahead limit (come Jira)

## Configurazione

- File config: `~/.config/deadlineaura/config.json`
- Google token: `~/.config/deadlineaura/google-token.json`
- DB: `~/.local/share/deadlineaura/db.sqlite`
- Wallpaper: `~/.local/share/deadlineaura/wallpaper.png`
- API keys: variabili d'ambiente (vedi .env.example)
