## What's Changed in v1.6.0

> This release adds Outlook as a second calendar source, read from the published ICS feed and configured from the settings window.

### ✨ New Features

- Read the Outlook calendar from its published ICS feed, expanding recurring meetings per occurrence (2e56dd1, 9ddd558)
- Configure the feed URL from the settings window, handled as a secret like the other tokens (d1ea5ed, 7416189)
- Show Outlook events in the meeting dock and in their own sidebar section (10be3e2, 7416189)
- Count Outlook events as calendar commitments in the pressure engine and AI scoring rather than backlog (c3caca9)

### 🐛 Bug Fixes

- Drop occurrences an exception moved outside the lookahead window (e313db3)
- Key recurring event ids on the calendar date instead of a timestamp, so AI scores survive a system time zone change (e313db3)
- Raise the series expansion iteration cap, which could run out before reaching the window (e313db3)

### 🔧 Maintenance

- Add the ical.js dependency for iCalendar parsing (113d6c5)
- Declare AbortSignal and Response as Node globals in the ESLint config (7fb0e48)
- Run database migration 008 inside an explicit transaction (10be3e2)

### 📚 Documentation

- Record the plan and architectural decisions behind the Outlook source (fa7d648)

## What's Changed in v1.5.0

> This release makes meeting alerts manageable straight from the flyby.

### ✨ New Features

- Add a cat button to snooze or disable meeting alerts (8482c7a)

## What's Changed in v1.4.0

> This release changes the flyby character and hardens the test suite.

### ✨ New Features

- Replace the pigeon with a pixel cat and yarn banner (621aac6)

### 🐛 Bug Fixes

- Report a mechanical-only blend when there are no tasks (8786603)

### 🔧 Maintenance

- Isolate daemon and engine tests from the real integrations (90233de)
- Align Google Calendar error assertions with the settings-aware messages (9c64e17)

## What's Changed in v1.3.1

> This release moves the OAuth credentials into the settings window and fixes background loading inside the package.

### ✨ New Features

- Configure Google OAuth credentials from the UI (352ecf4)

### 🐛 Bug Fixes

- Load background images from app.asar.unpacked (8bda854)

## What's Changed in v1.3.0

> This release introduces the installable .deb package, Google Tasks as an always-on source, and the animated flyby before meetings.

### ✨ New Features

- Build an installable .deb and automate releases (68b060f)
- Integrate Google Tasks as an always-on data source (472f49f)
- Animate a notification before meetings, on every display, looping until the meeting starts (ee3fd14, 0bc947f, 4d0e5ac)
- Add a score explainability panel with the AI and mechanical breakdown (07f3154)
- Configure AI provider API keys from the settings window (a58161d)
- Snapshot the database before every destructive migration (641836a)
- Add a per-display dismiss button on meeting boxes (18cb81d)
- Keep stale pinned tasks on the desktop with a red highlight (9130919)
- Use a custom app icon in the GNOME dock (bf5be52)

### 🐛 Bug Fixes

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

### 📚 Documentation

- Document .deb installation with a latest-release link (6549ec5)
- Add a donation section and GitHub Sponsor button to the README (93ff833)

### 🎨 Style

- Replace abstract backgrounds with naturalistic landscapes (b912b2e)
- Rebalance the scoring prompt from a clinical to a coaching tone (c32543c)

## What's Changed in v1.2.0

> This release introduces differentiated sync, meeting dock timing, and Google Calendar event states, along with various bug fixes and documentation updates.

### ✨ New Features

- Extract Teams and Zoom links from Google Calendar events (7ceb91a)
- Differentiated sync, meeting dock timing, and Google Calendar event states (feeba91)

### 🐛 Bug Fixes

- Prevent content overflow at any sidebar width (58f2734)
- Switch Mermaid diagrams to neutral theme for dark mode readability (13285ae)
- Remove DOCK window type to preserve transparency on GNOME (82d7a31)

### 📚 Documentation

- Add Mermaid diagrams for system architecture (023a29d)
- Update README with meeting dock, event states, and sync intervals (7f52e31)

### 🔧 Maintenance

- Update CHANGELOG.md for v1.1.0 [skip ci] (9c02c4d)
- Update CHANGELOG.en.md for v1.1.0 [skip ci] (c130f1f)
- Remove docs/decisions from tracked files (f03022d)
- Remove doc_progetto from tracking and add to gitignore (089d5d4)
- Update badges [skip ci] (98cc1c1)

---

_Generated by [ai-changelog-generator](https://github.com/AndreaBonn/ai-changelog-generator)_

## What's Changed in v1.1.0

> This release introduces an upcoming meetings dock and auto-unpinning of stale tasks.

### ✨ New Features

- Add upcoming meetings dock with clickable Meet links (aa37351)
- Auto-unpin stale tasks and add remove button in overlay (9abd296)

### 🐛 Bug Fixes

- Prevent auto-show from reopening manually closed sidebar (af1c2e2)
- Prevent stale marking on fetch failure and add startup sync (fb6f87c)
- Replace transparent window with opaque background in meeting dock (7d8b023)
- Pull --rebase before push in badge update step (6d42acc)

### 📚 Documentation

- Rename DeadlineAura to Deadline Aura by Bonn (f44d202)
- Add screenshots and fix settings tab count (f6a845e)

### 🔧 Maintenance

- Update badges (05dbc93, e7380b7)
- Update CHANGELOG.md for v1.0.0 and v1.1.0 (b0fc3aa, 226e598)
- Add english changelog generation (db5aa2a)

### 🎨 Other Changes

- Display stress forecast as percentage (8ee85ed)
