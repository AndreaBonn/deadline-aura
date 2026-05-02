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
core/           — Business logic (engine, color-mapper, wallpaper, notifier, sync)
ai/             — AI scoring (multi-provider con failover e key rotation)
ai/providers/   — Provider implementations (groq, gemini, openai, anthropic)
integrations/   — Client API esterne (Google Calendar, Jira)
store/          — SQLite init, migrations, query helpers
config/         — Defaults e schema Zod
renderer/       — Sidebar UI (HTML/CSS/JS)
test/           — Mirror struttura src/
```

## Decisioni architetturali

- AI scoring olistico: batch completo eventi → valutazione carico cognitivo/emotivo
- AI invocata solo su cambio eventi (hash-based) o ogni 6 ore
- Fallback a formula meccanica se AI non disponibile
- Provider con failover in ordine di priorità configurabile
- `canvas` (non sharp) per supporto testo su wallpaper
- CJS per compatibilità better-sqlite3 + Electron

## Configurazione

- File config: `~/.config/deadlineaura/config.json`
- Google token: `~/.config/deadlineaura/google-token.json`
- DB: `~/.local/share/deadlineaura/db.sqlite`
- Wallpaper: `~/.local/share/deadlineaura/wallpaper.png`
- API keys: variabili d'ambiente (vedi .env.example)
