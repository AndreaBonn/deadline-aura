**English** | [Italiano](./README.it.md)

# DeadlineAura

Desktop widget for Linux that maps your workload into an ambient visual signal — a colored strip, a tinted wallpaper, and sticky-note tasks that update as deadlines approach.

[![CI](https://github.com/AndreaBonn/deadline-aura/actions/workflows/ci.yml/badge.svg)](https://github.com/AndreaBonn/deadline-aura/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-see%20CI-informational)](https://github.com/AndreaBonn/deadline-aura/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/AndreaBonn/deadline-aura?style=social)](https://github.com/AndreaBonn/deadline-aura)

## What it does

DeadlineAura pulls tasks from Google Calendar and Jira, computes an urgency score for each one, and reflects the aggregate load as color: calm green at low pressure, through yellow, to deep red at critical. The color appears on a persistent sidebar strip on each display, as a wallpaper tint, and optionally as post-it notes rendered directly into the desktop background.

An optional AI scoring layer (Groq, Gemini, OpenAI, or Anthropic) evaluates cognitive and emotional load across the full event window and blends that assessment (70%) with the time-based mechanical score (30%). If no AI provider is configured, the mechanical formula runs alone.

This is an early release (v0.1.0). Rough edges exist. Linux/X11/GNOME only.

## Features

- Persistent 20px strip on every connected display; color interpolates across five urgency bands (calm → normal → attention → urgent → critical)
- Sidebar panel with tasks sorted by urgency score, toggled by clicking the strip
- Wallpaper generated as a composite PNG spanning all displays, with per-task post-it notes at drag-and-drop positions stored as percentages
- Urgency engine: exponential decay formula with priority weights and volume amplification above 5 concurrent events
- AI scoring with provider failover (Groq → Gemini → OpenAI → Anthropic), hash-based cache, configurable refresh interval (default: 6 hours)
- Google Calendar sync via OAuth2 (read-only scope: `calendar.readonly`)
- Jira sync via API token with configurable JQL
- Multi-monitor support: one strip per display, single spanned wallpaper PNG
- Config validated with Zod on startup and on every settings save
- X11 strut reservation so the strip does not overlap the GNOME work area
- Local tasks: create, edit, complete, and delete personal tasks directly from the sidebar — no external sync needed
- Burnout early warning: analyzes 7 days of AI scoring history across three independent triggers (sustained stress, insufficient recovery, high emotional load) and fires desktop notifications at moderate/high severity
- AI clinical note: natural-language assessment from a simulated occupational psychologist, plus a 5-day stress forecast chart — both visible in a collapsible panel toggled by clicking the urgency bar
- Desktop notifications via `notify-send` with configurable score threshold and cooldown; critical urgency for burnout alerts
- Bilingual interface (Italian/English) switchable from settings; translations loaded via IPC with dot-notation keys and placeholder interpolation
- Settings panel with 8 configuration tabs (General, Sources, AI, Wallpaper, Sidebar, Notifications, Interface, Advanced) and per-section reset
- Auto-show sidebar on any display with no visible windows (detected via `wmctrl`)
- Single-instance lock prevents duplicate widget processes
- Dynamic lookahead window: events fetched for at least 7 days ahead, extended to the following Sunday; Jira and local tasks are always included regardless of due date

## Setup

### Step 1 — Install system dependencies

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

`xprop` and `wmctrl` are required at runtime. The wallpaper is set via `gsettings` (GNOME); `feh` is used as a fallback. `notify-send` handles desktop notifications.

### Step 2 — Install Node.js 20 via nvm

The `canvas` package does not compile on Node 24. Node 20 LTS is required.

If you don't have nvm: [https://github.com/nvm-sh/nvm#installing-and-updating](https://github.com/nvm-sh/nvm#installing-and-updating)

```bash
nvm install 20
nvm use 20
node --version   # should print v20.x.x
```

### Step 3 — Clone and build

```bash
git clone https://github.com/AndreaBonn/deadline-aura.git
cd deadline-aura
npm install
npx electron-rebuild   # rebuilds better-sqlite3 and canvas against Electron's Node ABI
```

`npx electron-rebuild` is required after `npm install`. It recompiles the native addons (`better-sqlite3`, `canvas`) against the Node version embedded in Electron. Without this step, the app will fail to start.

### Step 4 — Create Google Cloud credentials

DeadlineAura needs OAuth 2.0 credentials to read your Google Calendar.

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a new project (or use an existing one)
2. In the left menu: **APIs & Services → Library** → search for "Google Calendar API" → Enable it
3. Go to **APIs & Services → Credentials** → **Create Credentials → OAuth client ID**
4. Choose application type: **Desktop app**
5. Under **Authorized redirect URIs**, add exactly: `http://localhost:34567/oauth/callback`
6. Click Create — note the **Client ID** and **Client Secret**

### Step 5 — Create the .env file

In the project root, create a file named `.env`:

```dotenv
# Google Calendar OAuth credentials (required for calendar sync)
GOOGLE_CLIENT_ID=paste_your_client_id_here
GOOGLE_CLIENT_SECRET=paste_your_client_secret_here

# AI provider API keys — comma-separated to enable key rotation
# All optional. If none are set, AI scoring is disabled.
GROQ_API_KEYS=key1,key2
GEMINI_API_KEYS=key1
OPENAI_API_KEYS=key1
ANTHROPIC_API_KEYS=key1
```

Fill in at minimum `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The AI keys are optional.

### Step 6 — First run and Google authorization

```bash
nvm use 20
npm start
```

On first run, a browser window opens for Google Calendar authorization. Log in with the Google account whose calendar you want to sync and click Allow. The token is saved automatically to `~/.config/deadlineaura/google-token.json` with permissions `0600`. You will not be asked again unless the token is deleted or revoked.

After authorization, the colored strip appears on the right edge of each display. Click it to open the sidebar.

### Step 7 — Configure Jira (optional)

Click the gear icon in the sidebar to open the settings panel. In the Jira section, enter:

- **Domain**: your Atlassian domain (e.g. `yourcompany.atlassian.net`)
- **Email**: the email address of your Atlassian account
- **API token**: generate one at [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **JQL**: filter for the issues you want to track (default: `assignee = currentUser() AND statusCategory != Done`)

Credentials are stored in `~/.config/deadlineaura/config.json`, which is set to permissions `0600` on every save — readable only by your user account. This is the same security model used for the Google OAuth token at `~/.config/deadlineaura/google-token.json`. The file is local to the machine and is never transmitted.

### Step 8 — Autostart (optional)

**GNOME autostart — launch the widget on login:**

Run these commands from inside the project directory:

```bash
mkdir -p ~/.config/autostart
ELECTRON_BIN=$(node -e "console.log(require('electron'))")
PROJECT_DIR=$(realpath .)

sed "s|Exec=.*|Exec=$ELECTRON_BIN $PROJECT_DIR --no-sandbox|" \
  autostart/deadlineaura.desktop > ~/.config/autostart/deadlineaura.desktop
```

**Systemd timer — background sync every 5 minutes:**

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

## Usage

The sidebar updates automatically every 60 seconds. To force an immediate sync:

```bash
npm run sync
```

**File locations:**
| Path | Content |
|---|---|
| `~/.config/deadlineaura/config.json` | User configuration |
| `~/.config/deadlineaura/google-token.json` | Google OAuth token (0600) |
| `~/.local/share/deadlineaura/db.sqlite` | SQLite database |
| `~/.local/share/deadlineaura/wallpaper.png` | Generated wallpaper |

Advanced configuration (sync interval, lookahead window, notification thresholds, sidebar width, etc.) is available through the in-app settings panel. The full schema with defaults is in `config/defaults.js`.

## Testing

```bash
npm test                  # run all tests
npm run test:coverage     # run with v8 coverage report
npm run lint              # ESLint
```

Tests run under Node 20 directly (not inside Electron). If you previously ran `npx electron-rebuild` to start the app, the native modules will be compiled for Electron's ABI and `npm test` will fail with a version mismatch. Recompile for Node 20 before running tests:

```bash
nvm use 20
npm rebuild
npm test
```

To return to running the app after testing, recompile for Electron again:

```bash
npx electron-rebuild
npm start
```

Tests are in `test/` and mirror the structure of `core/`, `store/`, `ai/`, `integrations/`, and `renderer/`.

## Architecture decisions

Key design choices are documented as Architecture Decision Records in [`docs/decisions/`](./docs/decisions/):

- [ADR-001: canvas over sharp for wallpaper rendering](./docs/decisions/001-canvas-over-sharp.md)
- [ADR-002: CommonJS over ESM](./docs/decisions/002-cjs-over-esm.md)
- [ADR-003: AI/mechanical score blending](./docs/decisions/003-ai-mechanical-blend.md)

## Contributing

Open an issue to discuss changes before submitting a pull request. Code must pass `npm run lint` and `npm test` before review. There is no formal contributing guide at this stage.

## Security

To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## License

Released under the [Apache License 2.0](./LICENSE).

Commercial use is permitted. If you use DeadlineAura in a commercial product or service, attribution to the original author is required per the license terms.

## Author

Andrea Bonacci — [@AndreaBonn](https://github.com/AndreaBonn)

---

If this project is useful to you, a [star on GitHub](https://github.com/AndreaBonn/deadline-aura) helps others find it.
