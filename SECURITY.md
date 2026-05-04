**English** | [Italiano](./SECURITY.it.md)

# Security Policy

## Supported Versions

DeadlineAura has not yet reached a stable release. The current version is `0.1.0` (unreleased tag). Only the latest commit on the `main` branch receives security updates.

| Version | Supported |
|---|---|
| 0.1.x (main) | Yes |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities through GitHub Security Advisories:
[https://github.com/AndreaBonn/deadline-aura/security/advisories/new](https://github.com/AndreaBonn/deadline-aura/security/advisories/new)

Include in your report:
- A description of the vulnerability and the component affected
- Steps to reproduce, including any required configuration
- The potential impact (data exposure, privilege escalation, denial of service, etc.)
- Your assessment of exploitability

**Response timeline:**
- Acknowledgment within 72 hours
- Status update within 7 days
- Fix for critical vulnerabilities within 30 days where feasible

This project follows coordinated disclosure: vulnerabilities are kept private until a fix is available, after which details may be published together with the fix.

## Security Measures Implemented

The following measures have been verified by reading the source code. File and line references are included.

**Electron context isolation**
All `BrowserWindow` instances are created with `contextIsolation: true` and `nodeIntegration: false` (`main.js` lines 84, 119, 216, 435). Renderer processes have no direct access to Node.js APIs.

**Minimal IPC surface via contextBridge**
The preload script (`preload.js:5`) exposes a named API object through `contextBridge.exposeInMainWorld` containing only the specific IPC calls needed by the renderer. No Node or Electron internals are exposed.

**URL validation before spawning external process**
Before opening a link in the browser, `main.js:479` validates the URL against the regex `^https?:\/\/`. Only http and https URLs result in a `spawn` call.

**Input validation with Zod**
User-editable configuration is validated against a Zod schema (`config/schema.js:5`) before being saved. The same schema is applied on every settings save (`main.js:495-496`).

**Google OAuth token file permissions**
The Google OAuth token is written to disk with `chmod 0600` (`integrations/google-calendar.js:59`), restricting read access to the file owner.

**Minimal Google Calendar scope**
The OAuth authorization requests only `https://www.googleapis.com/auth/calendar.readonly` (`integrations/google-calendar.js:13`). No write access to the calendar is requested.

**API keys loaded from environment, not hardcoded**
All provider API keys are read from environment variables via `dotenv` (`main.js:3`, `sync-daemon.js:3`). The `provider-manager.js` reads `GROQ_API_KEYS`, `GEMINI_API_KEYS`, `OPENAI_API_KEYS`, `ANTHROPIC_API_KEYS` from `process.env`.

**SQLite foreign key enforcement**
The database is opened with `PRAGMA foreign_keys = ON` (`store/db.js:22`).

**Dependency pinning**
`package-lock.json` is present and committed, pinning all transitive dependencies to specific versions.

## Security Best Practices for Users

- Store your `.env` file outside version control. Add it to `.gitignore`.
- The Google OAuth token at `~/.config/deadlineaura/google-token.json` grants read access to your calendar. Do not share this file.
- Jira credentials are stored in `~/.config/deadlineaura/config.json` in plaintext. Restrict file permissions on that path if other users share the machine.
- AI provider API keys sent to this application are forwarded to third-party APIs (Groq, Gemini, OpenAI, Anthropic) over HTTPS. Review each provider's data handling policy before use.

## Out of Scope

The following are not considered vulnerabilities for this project:

- Vulnerabilities requiring physical access to the machine
- Social engineering attacks
- Issues in third-party dependencies already publicly disclosed (report those to the respective upstream projects)
- Self-XSS (requires attacker to already control the session)
- Denial of service attacks against the local Electron process

## Acknowledgments

None at this time.

---

[Back to README](./README.md)
