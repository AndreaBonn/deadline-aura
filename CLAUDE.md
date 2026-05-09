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
npm run lint:fix           # ESLint auto-fix
npm run format             # Prettier write
npm run format:check       # Prettier check
npm run sync               # Sync manuale (alias node core/sync-daemon.js)
node scripts/seed-demo.js  # Popola DB con task demo
npm start                 # Avvia Electron
```

## Struttura

```
core/               — Business logic (engine, color-mapper, wallpaper, notifier, sync)
core/wallpaper-renderer.js  — Rendering wallpaper: sfondo immagine + tint + post-it + calendar
core/postit-renderer.js     — Disegno singolo post-it su canvas
core/display-manager.js     — Detect multi-monitor, geometria canvas composito
core/display-controller.js  — Gestione strip + sidebar + auto-show su display libero
core/burnout-detector.js    — Early warning burnout da storico AI (7 giorni, 3 trigger)
ai/                 — AI scoring (multi-provider con failover e key rotation)
ai/providers/       — Provider implementations (groq, gemini, openai, anthropic)
integrations/       — Client API esterne (Google Calendar, Jira)
store/              — SQLite init, migrations, query helpers
store/pinned-queries.js — CRUD pinned tasks (pin/unpin, posizioni, query per display)
store/local-queries.js  — CRUD task locali (source='local', no sync esterno)
config/             — Defaults e schema Zod
i18n/               — Internazionalizzazione (modulo CJS + locale JSON)
i18n/index.js       — t(), setLanguage(), getTranslations() per main process
i18n/locales/       — File traduzione (it.json, en.json)
renderer/i18n-renderer.js — t() globale per renderer (browser context)
renderer/           — Sidebar + overlay UI (HTML/CSS/JS)
renderer/overlay.*  — Overlay trasparente per drag & drop posizionamento post-it
renderer/strip.*    — Striscia 20px bordo destro, click toggle sidebar, DOCK X11
renderer/settings.* — Pannello impostazioni (8 tab, validazione Zod)
assets/backgrounds/ — 5 immagini sfondo mappate su bande urgenza
test/               — Mirror struttura src/
scripts/            — Utility (seed-demo.js)
autostart/          — .desktop file per GNOME autostart
systemd/            — Service + timer per sync background
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
- i18n: bilingue IT/EN via config `language`, traduzioni JSON in `i18n/locales/`, `t()` con dot-notation e interpolazione `{placeholder}`
- Renderer i18n: `i18n-renderer.js` carica traduzioni via IPC, espone `t()` globale + `translateDom()` per attributi `data-i18n`
- Core i18n: `require('../i18n').t` diretto nel main process
- Lookahead dinamico: finestra eventi = max(7 giorni da oggi arrotondati a domenica successiva, config lookahead_hours). Task Jira e locali sempre inclusi senza limite temporale
- Burnout detector: analisi storico AI 7 giorni, 3 trigger indipendenti (stress medio, recovery insufficiente, emotional load alto), severity none/moderate/high
- Notifiche desktop via `notify-send`: threshold score + cooldown configurabile, urgency critical per burnout
- Strip come `_NET_WM_WINDOW_TYPE_DOCK` con `_NET_WM_STRUT_PARTIAL` per riservare spazio schermo
- Auto-show sidebar su display senza finestre (rilevamento via `wmctrl`)
- Single instance lock via `app.requestSingleInstanceLock()`
- Tre preload separati (sidebar, overlay, settings) con `contextIsolation: true`
- AI clinical note: testo in lingua da psicologo occupazionale + stress forecast 5 giorni
- AI notes collassabile nella sidebar via click su urgency bar

## Configurazione

- File config: `~/.config/deadlineaura/config.json`
- Google token: `~/.config/deadlineaura/google-token.json`
- DB: `~/.local/share/deadlineaura/db.sqlite`
- Wallpaper: `~/.local/share/deadlineaura/wallpaper.png`
- API keys: variabili d'ambiente (vedi .env.example)
