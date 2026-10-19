[English](./ARCHITECTURE.md) | [Italiano](./ARCHITECTURE.it.md)

# Architecture

Technical diagrams for DeadlineAura internals. For a high-level overview, see the [README](../README.md#architecture).

## Sync and AI Scoring Pipeline

Three triggers start a sync: app startup, a periodic timer (`sync.data_interval_minutes`, default 10) and the sidebar "sync now" action. A single `DataSync` object (`core/data-sync.js`) owns all three and runs each through the same cycle (`core/sync-runner.js`): call the sync daemon, reduce the result to a status (`core/sync-status.js`: completion time and failed sources, AI errors not counted), log the source errors, then redraw through the update cycle. Startup and periodic cycles force the wallpaper redraw; a manual one does not. A failure anywhere in the cycle is logged and never propagated.

The sync daemon queries the four sources one after another, persists what came back into SQLite, then triggers AI scoring if the event set has changed (hash-based cache) or the last score is older than the configured interval (default: 6 hours). The AI scorer tries providers in priority order with automatic failover.

Each fetch is wrapped in `fetchWithErrorCapture`, so a source that is down records an error and leaves the others untouched. Persistence is then conditional: only the sources that answered are marked stale and rewritten, which prevents a network failure from wiping a source's tasks off the desktop.

Outlook is the only source that is not an API client. It downloads the published ICS document and expands it locally (`core/ics-parser.js`), turning each occurrence of a recurring series into its own task, applying the exceptions and dropping the cancellations.

The update cycle (`core/update-cycle.js`) turns the stored data into what the windows show. `core/update-payload.js` derives the engine options from the config, reads the AI notes (the note and the daily stress forecast) from the latest `ai_cache` row, and assembles the sidebar update together with the sync status, whether Google Calendar is authorized and the first-run hint flag. The same sync status lets the settings window tell a failing source from a healthy one (`core/source-status.js`). Google OAuth lives in `integrations/google-auth.js`.

```mermaid
sequenceDiagram
  participant ds as DataSync
  participant sd as SyncDaemon
  participant gcal as GoogleCalendar
  participant gtasks as GoogleTasks
  participant jira as Jira
  participant outlook as OutlookICS
  participant db as SQLite
  participant ai as AIScorer
  participant pm as ProviderManager
  participant prov as Provider
  participant uc as UpdateCycle

  ds->>+sd: sync(config)
  sd->>+gcal: fetchEvents
  gcal-->>-sd: events[]

  sd->>+gtasks: fetchTasks
  gtasks-->>-sd: tasks[]

  sd->>+jira: fetchIssues
  jira-->>-sd: issues[]

  sd->>+outlook: fetchFeed
  outlook->>outlook: parseIcs, expand recurrences
  outlook-->>-sd: occurrences[]

  loop Per source that did not fail
    sd->>+db: markStale + upsertTask (transaction)
    db-->>-sd: ok
  end

  sd->>sd: computeEventsHash (SHA-256)
  sd->>+db: getAiCache(hash)
  db-->>-sd: cached / null

  alt Cache miss or stale
    sd->>+ai: scoreTasks(events)
    ai->>+pm: scoreEvents(prompt)
    pm->>+prov: score (priority 1)

    alt Provider fails
      prov-->>-pm: error
      pm->>+prov: score (priority 2)
      prov-->>-pm: response
    else Provider succeeds
      prov-->>pm: response
    end

    pm-->>-ai: parsed result
    ai-->>-sd: scores

    sd->>db: setAiCache(hash, result)
    sd->>db: updateAiScores per task
  end

  sd-->>-ds: counts + errors[]
  ds->>ds: summarizeSync (time, failed sources)
  ds->>uc: refresh (forced on startup and periodic)
```

Key files: `core/data-sync.js`, `core/sync-runner.js`, `core/sync-status.js`, `core/sync-daemon.js`, `core/update-cycle.js`, `core/update-payload.js`, `core/source-status.js`, `integrations/google-auth.js`, `integrations/outlook.js`, `core/ics-parser.js`, `ai/provider-manager.js`, `ai/prompt.js`

## Database Schema

SQLite with WAL mode. Five tables: `tasks` is the central entity, `pinned_tasks` and `jira_favorites` reference it with CASCADE delete. `scores` stores global score history (7-day retention). `ai_cache` is keyed by SHA-256 hash of the active event set.

The `source` column carries a CHECK constraint listing the accepted values, currently `gcal`, `gtasks`, `jira`, `local` and `outlook`. SQLite cannot alter a constraint in place, so every new source means rebuilding the table: the migrations in `store/migrations.js` do it idempotently, copying the rows across and snapshotting the database first (`store/db-backup.js`). A failed backup aborts the migration. Plain table creation and the secondary tables are the numbered SQL files in `store/migrations/` (001 to 007), applied in order on every start; column additions (`web_url`, `ai_cognitive_type`, `start_at`, `meet_url`) are guarded `ALTER TABLE` statements in the same module, and the `local`, `gtasks`, `off` category and `outlook` extensions are table rebuilds.

Not every source fills every column. `start_at` is set by calendar events (`gcal`, `outlook`) and left null by backlog items; `web_url` is null for Outlook, because a published feed carries no per-event page; `meet_url` holds the video call link when one was found in the event.

```mermaid
erDiagram
  TASKS {
    text id PK
    text source
    text title
    int due_at
    int start_at
    int priority
    int is_done
    int is_stale
    int ai_stress
    text ai_category
    text ai_cognitive_type
    text web_url
    text meet_url
  }

  SCORES {
    int id PK
    real global_score
    int computed_at
  }

  AI_CACHE {
    text events_hash PK
    text response_json
    int computed_at
  }

  PINNED_TASKS {
    text task_id FK
    text display_id
    real x_pct
    real y_pct
    int pinned_at
  }

  JIRA_FAVORITES {
    text task_id FK
    int favorited_at
  }

  TASKS ||--o{ PINNED_TASKS : "pinned on"
  TASKS ||--o| JIRA_FAVORITES : "favorited"
```

Key files: `store/db.js`, `store/migrations.js`, `store/migrations/`, `store/db-backup.js`

## Task Lifecycle

Tasks enter the system through sync (`gcal`, `gtasks`, `jira`, `outlook`) or local creation. The `is_stale` and `is_done` flags determine visibility. Active tasks can be pinned to the wallpaper as post-it notes. Stale tasks are cleaned up after 48 hours. Local tasks can be deleted directly (hard delete).

```mermaid
stateDiagram-v2
  [*] --> Active : sync upsert / local create

  Active --> Stale : markStale (synced sources)
  Stale --> Active : re-sync upsert
  Active --> Completed : complete / is_done in source
  Active --> [*] : deleteLocalTask
  Stale --> [*] : cleanup 48h

  state Active {
    direction LR
    [*] --> Visible
    Visible --> Pinned : pin to wallpaper
    Pinned --> Visible : unpin
  }
```

Key files: `core/sync-daemon.js`, `store/db.js`, `store/local-queries.js`, `store/pinned-queries.js`

## IPC Communication

`main.js` is the bootstrap: it builds the windows, the stores and the sync object, then wires them together. It no longer holds handlers. Windows live in `main-process/` (`sidebar-window.js`, `strip-windows.js`, `overlay-window.js`, `settings-window.js`, `meeting-dock-windows.js`). Request handlers are grouped by topic in `core/ipc/` as factories that receive their dependencies, and `main-process/app-ipc.js` merges the groups (a duplicate channel throws at startup) and hands them to `registerIpc` (`core/ipc/register-ipc.js`), which binds each channel with `ipcMain.handle` or `ipcMain.on`. The overlay and the meeting dock register their own channels; the flyby window's two channels are registered by `core/meeting-flyby.js`.

The main process talks to six renderer windows through five preload bridges (`contextIsolation: true`; the sidebar and the strips share `preload.js`). Push channels (main to renderer) deliver state updates. Request channels (renderer to main) handle user actions and invoke/handle pairs.

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph TD
  main["Electron Main Process<br/>main.js bootstrap"]
  ipc["core/ipc handlers<br/>via app-ipc.js"]

  subgraph renderers["Renderer Windows"]
    sidebar["Sidebar<br/>preload.js"]
    strip["Strip<br/>preload.js"]
    overlay["Overlay<br/>preload-overlay.js"]
    settings["Settings<br/>preload-settings.js"]
    meet_dock["Meeting Dock<br/>preload-meeting-dock.js"]
    flyby["Meeting Flyby<br/>preload-flyby.js"]
  end

  main -->|"update, config-changed"| sidebar
  main -->|"strip-color"| strip
  main -->|"overlay-init"| overlay
  main -->|"meetings-update"| meet_dock
  main -->|"flyby-init"| flyby

  sidebar -->|"sync:run, task:favorite"| ipc
  sidebar -->|"local-task:*, calendar:*"| ipc
  sidebar -->|"flyby:set-state, flyby:get-state"| ipc
  sidebar -->|"pin-task, open-overlay"| main
  settings -->|"settings:save-config, google:authorize"| ipc
  settings -->|"ai-usage:capture-*"| ipc
  ipc --> main

  classDef core fill:#2563eb,stroke:#1d4ed8,color:#fff
  classDef data fill:#d97706,stroke:#b45309,color:#fff
  classDef ext fill:#6b7280,stroke:#4b5563,color:#fff

  class main,ipc core
  class sidebar,strip,overlay,settings,meet_dock,flyby data
```

The cat menu writes through `flyby:set-state`, which patches only the `meeting_flyby` block of the config rather than saving the whole object, so a settings window open at the same time does not overwrite the snooze (`core/flyby-snooze.js`).

Key files: `main.js`, `main-process/app-ipc.js`, `main-process/window-handlers.js`, `core/ipc/register-ipc.js`, `core/ipc/` (handler groups), `main-process/overlay-window.js`, `main-process/meeting-dock-windows.js`, `preload.js`, `preload-settings.js`, `preload-overlay.js`, `preload-meeting-dock.js`, `preload-flyby.js`

## AI Usage Band

A band along the bottom of the wallpaper shows how much of the Claude and Codex rate limits is used. It reads only percentages and reset times, for the 5-hour and the 7-day window, and shows one card per Claude account plus one for Codex. The band is drawn when `wallpaper.show_ai_usage` is on (default) and there is at least one row.

Claude does not expose its limits to other programs; Claude Code only passes them to its statusline command. An installer (`ai-usage:capture-install` from the settings window, `scripts/ai-usage/capture_install.py`) puts `claude-capture.py` in front of the statusline in every `settings.json` it finds (`~/.claude` and each Cloak profile), after backing the file up and recording the previous statusline. On each prompt the capture reads the payload from stdin, keeps only `used_percentage` and `resets_at` of the two windows, and writes one snapshot per account (the account id is the name of `CLAUDE_CONFIG_DIR`, or `default`) to `~/.local/share/deadlineaura/ai-usage/latest/<account>.json`. It then forwards the payload to the previous statusline so the user's own output is unchanged, or prints a short `5h x% | 7d y%` line when there was none. It never fails the statusline. At startup the app copies the scripts to `~/.local/share/deadlineaura/bin`, so the installed command survives app updates.

Codex needs no installation: `core/ai-usage-codex.js` reads the tail of the 20 most recent rollout files under `$CODEX_HOME/sessions` (default `~/.codex/sessions`), newest first, until both windows are found. Only `rate_limits` events of the `codex` limit count, and each window is assigned by its length (300 and 10080 minutes).

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph LR
  statusline["Claude Code statusline"]
  capture["claude-capture.py"]
  snapshots["latest/account.json"]
  rollouts["Codex rollout logs"]
  collect["collectUsage<br/>core/ai-usage.js"]
  cycle["Update cycle"]
  band["Wallpaper band<br/>ai-usage-band.js"]

  statusline -->|"payload on stdin"| capture
  capture -->|"percentages and resets"| snapshots
  capture -->|"forwards payload"| statusline
  snapshots --> collect
  rollouts --> collect
  collect -->|"usage rows"| cycle
  cycle --> band

  classDef core fill:#2563eb,stroke:#1d4ed8,color:#fff
  classDef data fill:#d97706,stroke:#b45309,color:#fff
  classDef ext fill:#6b7280,stroke:#4b5563,color:#fff

  class collect,cycle,band core
  class snapshots,rollouts data
  class statusline,capture ext
```

`collectUsage` returns one row per Claude account (alphabetical) and then Codex; a reader that fails is logged and drops only its own rows. A row is marked stale 30 minutes after its capture. When the wallpaper is enabled, the update cycle collects the rows at every run, and the wallpaper changer compares a signature of what the band would draw (5% bucket, threshold level, countdown bucket) with the previous one, so it redraws only when the visible text changes. The thresholds are 70 (warning), 90 (critical) and 100 (full). The agenda above the band is shortened to leave room for it.

Key files: `core/ai-usage.js`, `core/ai-usage-claude.js`, `core/ai-usage-codex.js`, `core/ai-usage-codex-fs.js`, `core/ai-usage-format.js`, `core/ai-usage-band.js`, `core/ai-usage-band-layout.js`, `core/ai-usage-card.js`, `core/ai-usage-capture-bin.js`, `core/ipc/ai-usage-handlers.js`, `scripts/ai-usage/claude-capture.py`, `scripts/ai-usage/capture_install.py`, `scripts/ai-usage/ai_usage_common.py`
