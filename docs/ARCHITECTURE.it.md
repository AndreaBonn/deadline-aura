[English](./ARCHITECTURE.md) | [Italiano](./ARCHITECTURE.it.md)

# Architettura

Diagrammi tecnici degli internals di DeadlineAura. Per una panoramica ad alto livello, vedi il [README](../README.it.md#architettura).

## Pipeline Sync e AI Scoring

Il sync daemon recupera eventi da Google Calendar e Jira in parallelo, li persiste in SQLite, poi avvia l'AI scoring se il set di eventi e cambiato (cache basata su hash) o l'ultimo score e piu vecchio dell'intervallo configurato (default: 6 ore). L'AI scorer prova i provider in ordine di priorita con failover automatico.

```mermaid
sequenceDiagram
  participant sd as SyncDaemon
  participant gcal as GoogleCalendar
  participant jira as Jira
  participant db as SQLite
  participant ai as AIScorer
  participant pm as ProviderManager
  participant prov as Provider

  par Recupera sorgenti
    sd->>+gcal: fetchEvents
    gcal-->>-sd: eventi[]
  and
    sd->>+jira: fetchIssues
    jira-->>-sd: issue[]
  end

  sd->>+db: markStale + upsertTask (transazione)
  db-->>-sd: ok

  sd->>sd: computeEventsHash (SHA-256)
  sd->>+db: getAiCache(hash)
  db-->>-sd: in cache / null

  alt Cache miss o scaduta
    sd->>+ai: scoreTasks(eventi)
    ai->>+pm: scoreEvents(prompt)
    pm->>+prov: score (priorita 1)

    alt Provider fallisce
      prov-->>-pm: errore
      pm->>+prov: score (priorita 2)
      prov-->>-pm: risposta
    else Provider riesce
      prov-->>pm: risposta
    end

    pm-->>-ai: risultato parsato
    ai-->>-sd: score

    sd->>db: setAiCache(hash, risultato)
    sd->>db: updateAiScores per task
  end
```

File chiave: `core/sync-daemon.js`, `ai/provider-manager.js`, `ai/prompt.js`

## Schema Database

SQLite con WAL mode. Cinque tabelle: `tasks` e l'entita centrale, `pinned_tasks` e `jira_favorites` la referenziano con CASCADE delete. `scores` conserva lo storico del global score (retention 7 giorni). `ai_cache` e indicizzata per hash SHA-256 del set di eventi attivi.

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

  TASKS ||--o{ PINNED_TASKS : "pinnato su"
  TASKS ||--o| JIRA_FAVORITES : "nei preferiti"
```

File chiave: `store/db.js`, `store/migrations/`

## Ciclo di Vita dei Task

I task entrano nel sistema via sync (gcal/jira) o creazione locale. I flag `is_stale` e `is_done` determinano la visibilita. I task attivi possono essere pinnati sul wallpaper come post-it. I task stale vengono rimossi dopo 48 ore. I task locali possono essere eliminati direttamente (hard delete).

```mermaid
stateDiagram-v2
  [*] --> Attivo : sync upsert / creazione locale

  Attivo --> Stale : markStale (gcal/jira)
  Stale --> Attivo : re-sync upsert
  Attivo --> Completato : completa / is_done nella sorgente
  Attivo --> [*] : elimina task locale
  Stale --> [*] : cleanup 48h

  state Attivo {
    direction LR
    [*] --> Visibile
    Visibile --> Pinnato : pin su wallpaper
    Pinnato --> Visibile : unpin
  }
```

File chiave: `core/sync-daemon.js`, `store/local-queries.js`, `store/pinned-queries.js`

## Comunicazione IPC

Il processo main di Electron comunica con cinque finestre renderer attraverso quattro preload bridge separati (`contextIsolation: true`). I canali push (main verso renderer) consegnano aggiornamenti di stato. I canali request (renderer verso main) gestiscono le azioni utente e le coppie invoke/handle.

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph TD
  main["Processo Main Electron"]

  subgraph renderers["Finestre Renderer"]
    sidebar["Sidebar<br/>preload.js"]
    strip["Striscia<br/>preload.js"]
    overlay["Overlay<br/>preload-overlay.js"]
    settings["Impostazioni<br/>preload-settings.js"]
    meet_dock["Meeting Dock<br/>preload-meeting-dock.js"]
  end

  main -->|"update, config-changed"| sidebar
  main -->|"strip-color"| strip
  main -->|"overlay-init"| overlay
  main -->|"meetings-update"| meet_dock

  sidebar -->|"sync:run, pin-task"| main
  sidebar -->|"local-task:*, calendar:*"| main
  settings -->|"settings:save-config"| main

  classDef core fill:#2563eb,stroke:#1d4ed8,color:#fff
  classDef data fill:#d97706,stroke:#b45309,color:#fff
  classDef ext fill:#6b7280,stroke:#4b5563,color:#fff

  class main core
  class sidebar,strip,overlay,settings,meet_dock data
```

File chiave: `main.js`, `preload.js`, `preload-settings.js`, `preload-overlay.js`, `preload-meeting-dock.js`
