## What's Changed in v1.7.1

> This release fixes private IPv6 host blocking, a Jira sync failure caused by a single rate-limited instance, and the post-it labels in the overlay.

### Bug fixes

- Block private IPv6 hosts (loopback, link-local, unique-local, IPv4-mapped) and trailing-dot `localhost.` for both external links and the Outlook feed, through a single check in `core/url-safety.js` (5097971)
- Keep syncing the other Jira instances when one answers 429 on every retry (3c58185)
- Show the same post-it label in the overlay as on the wallpaper instead of the raw id (5097971)

### Maintenance

- Move the IPC payload validation of local tasks and calendar events into pure modules, with unchanged error codes (5097971)
- Export the pure logic of four renderer scripts for testing; raise coverage to 95% and rewrite weak or tautological tests (529494c)

## What's Changed in v1.7.0

> This release replaces the mental load label on the wallpaper with a band showing Claude and Codex usage limits, fed by a Claude Code statusline capture you can install from the settings window.

### New features

- Draw an AI usage band on the wallpaper in place of the mental load label, spanning the full width and redrawn when the values change (ae47f2a, 83a66a5, 30e467b, 7476af2)
- Read Codex rate limits from local session logs (f760c6e)
- Read Claude limits from capture snapshots, discovering the configured accounts (8906a6c, 8196d4a, 1f8a932)
- Add a Claude Code statusline capture script with idempotent install and uninstall, run from a stable copy without a shell (18313b4, be58548, 457ef8a)
- Install and remove the capture from the settings window (88d47e8)
- Add the `wallpaper.show_ai_usage` toggle (3e97cb7)

### Bug fixes

- Never lose the original statusLine on an interrupted capture install (0873505)
- Keep the settings.json layout across install and uninstall (3803fbe)
- Log unsafe chain configs and keep settings backups apart (73d2f02)
- Round fallback percentages half up, like the band (aad464c)
- Pick the newest Codex rollouts by mtime, not readdir order (08d418c)
- Warn when a Claude snapshot exists but cannot be read (6a37b52)
- Show an unknown capture status instead of "not active" when it cannot be determined (1b4faad)
- Raise the capture control text to WCAG AA contrast (f1b2c59)

### Build

- Ship the capture scripts outside asar and require python3 in the .deb package (b88aca4)

### Maintenance

- Split band drawing and the daily agenda into their own modules, under the size limits (38b2837, 69e21c6, c658640, ee914e7)
- Compare band pixel buffers natively in tests (8a24805)
- Pin the clock in the Outlook fetchEvents tests and stub spawnSync in the notifier cooldown test (f0e47b3, 770997e)
- Apply prettier to drifted files, ignore Python caches and local specs (9f9da86, dd16335, de04b20)

### Documentation

- Add a step-by-step user guide in English and Italian (fee14d1)
- Document the Claude and Codex limit band and the statusline capture (7d8760b, 37be303)
- Record the plan, tasks and decisions for the AI usage band (2cffb1f, 90ac359, 5979727, 5f2378c)
- Drop decorative emoji and duplicated blocks from the changelog (40a7d20)

## What's Changed in v1.6.0

> This release adds Outlook as a second calendar source, read from the published ICS feed and configured from the settings window.

### New features

- Read the Outlook calendar from its published ICS feed, expanding recurring meetings per occurrence (2e56dd1, 9ddd558)
- Configure the feed URL from the settings window, handled as a secret like the other tokens (d1ea5ed, 7416189)
- Show Outlook events in the meeting dock and in their own sidebar section (10be3e2, 7416189)
- Count Outlook events as calendar commitments in the pressure engine and AI scoring rather than backlog (c3caca9)

### Bug fixes

- Drop occurrences an exception moved outside the lookahead window (e313db3)
- Key recurring event ids on the calendar date instead of a timestamp, so AI scores survive a system time zone change (e313db3)
- Raise the series expansion iteration cap, which could run out before reaching the window (e313db3)

### Maintenance

- Add the ical.js dependency for iCalendar parsing (113d6c5)
- Declare AbortSignal and Response as Node globals in the ESLint config (7fb0e48)
- Run database migration 008 inside an explicit transaction (10be3e2)

### Documentation

- Record the plan and architectural decisions behind the Outlook source (fa7d648)

## What's Changed in v1.5.0

> This release makes meeting alerts manageable straight from the flyby.

### New features

- Add a cat button to snooze or disable meeting alerts (8482c7a)

## What's Changed in v1.4.0

> This release changes the flyby character and hardens the test suite.

### New features

- Replace the pigeon with a pixel cat and yarn banner (621aac6)

### Bug fixes

- Report a mechanical-only blend when there are no tasks (8786603)

### Maintenance

- Isolate daemon and engine tests from the real integrations (90233de)
- Align Google Calendar error assertions with the settings-aware messages (9c64e17)

## What's Changed in v1.3.1

> This release moves the OAuth credentials into the settings window and fixes background loading inside the package.

### New features

- Configure Google OAuth credentials from the UI (352ecf4)

### Bug fixes

- Load background images from app.asar.unpacked (8bda854)

## What's Changed in v1.3.0

> This release introduces the installable .deb package, Google Tasks as an always-on source, and the animated flyby before meetings.

### New features

- Build an installable .deb and automate releases (68b060f)
- Integrate Google Tasks as an always-on data source (472f49f)
- Animate a notification before meetings, on every display, looping until the meeting starts (ee3fd14, 0bc947f, 4d0e5ac)
- Add a score explainability panel with the AI and mechanical breakdown (07f3154)
- Configure AI provider API keys from the settings window (a58161d)
- Snapshot the database before every destructive migration (641836a)
- Add a per-display dismiss button on meeting boxes (18cb81d)
- Keep stale pinned tasks on the desktop with a red highlight (9130919)
- Use a custom app icon in the GNOME dock (bf5be52)

### Bug fixes

- Preserve referencing rows during CHECK constraint migrations (5f39816)
- Re-authenticate automatically on an expired OAuth token (57fcf66)
- Propagate the error when every Google Calendar fetch fails (42052bd)
- Exclude ended events from the active tasks query (930dcf7)
- Exclude OOO and declined events from cognitive load scoring (0abf831)
- Reduce score inflation from backlog volume and idle weeks (4040297, 7fdcb8d)
- Invalidate the AI cache when the prompt structure changes (5a0de5b)
- Show the strip on all monitors and position it on the right edge (0511ce0, f470e13)
- Remove the dual autostart conflict (9061781)
- Fix meeting dock click-through on Linux (3a44b7f, e3ee667)
- Score global_stress as a decimal instead of an integer (242ceed)
- Disable the implicit electron-builder publish on tags (0236be9)

### Documentation

- Document .deb installation with a latest-release link (6549ec5)
- Add a donation section and GitHub Sponsor button to the README (93ff833)

### Style

- Replace abstract backgrounds with naturalistic landscapes (b912b2e)
- Rebalance the scoring prompt from a clinical to a coaching tone (c32543c)

## What's Changed in v1.2.0

> This release splits the sync intervals apart, gives the meeting dock its own timing, and shows the live state of Google Calendar events in the sidebar.

### New features

- Extract Teams and Zoom links from Google Calendar events (7ceb91a)
- Differentiated sync, meeting dock timing, and Google Calendar event states (feeba91)

### Bug fixes

- Prevent content overflow at any sidebar width (58f2734)
- Switch Mermaid diagrams to neutral theme for dark mode readability (13285ae)
- Remove DOCK window type to preserve transparency on GNOME (82d7a31)

### Documentation

- Add Mermaid diagrams for system architecture (023a29d)
- Update README with meeting dock, event states, and sync intervals (7f52e31)

### Maintenance

- Update CHANGELOG.md for v1.1.0 [skip ci] (9c02c4d)
- Update CHANGELOG.en.md for v1.1.0 [skip ci] (c130f1f)
- Remove docs/decisions from tracked files (f03022d)
- Remove doc_progetto from tracking and add to gitignore (089d5d4)
- Update badges [skip ci] (98cc1c1)

---

_Generated by [ai-changelog-generator](https://github.com/AndreaBonn/ai-changelog-generator)_

## What's Changed in v1.1.0

> This release introduces an upcoming meetings dock and auto-unpinning of stale tasks.

### New features

- Add upcoming meetings dock with clickable Meet links (aa37351)
- Auto-unpin stale tasks and add remove button in overlay (9abd296)

### Bug fixes

- Prevent auto-show from reopening manually closed sidebar (af1c2e2)
- Prevent stale marking on fetch failure and add startup sync (fb6f87c)
- Replace transparent window with opaque background in meeting dock (7d8b023)
- Pull --rebase before push in badge update step (6d42acc)

### Documentation

- Rename DeadlineAura to Deadline Aura by Bonn (f44d202)
- Add screenshots and fix settings tab count (f6a845e)

### Maintenance

- Update badges (05dbc93, e7380b7)
- Update CHANGELOG.md for v1.0.0 and v1.1.0 (b0fc3aa, 226e598)
- Add english changelog generation (db5aa2a)

### Other changes

- Display stress forecast as percentage (8ee85ed)
