**English** | [Italiano](./SECURITY.it.md)

# Security Policy

## Supported Versions

The current release is `1.6.0`. Security fixes are applied to the latest release and to the `main` branch. Older releases are not patched: the upgrade path is to install the newest `.deb`, which keeps existing data.

| Version | Supported                         |
| ------- | --------------------------------- |
| 1.6.x   | Yes                               |
| < 1.6   | No, upgrade to the latest release |

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
Every `BrowserWindow` is created with `contextIsolation: true` and `nodeIntegration: false` (`main.js:103`, `main.js:138`, `main.js:242`, `main.js:355`, `main.js:569`). Renderer processes have no direct access to Node.js APIs.

**Content Security Policy on every renderer window**
Each renderer document declares `default-src 'self'; script-src 'self'` in a meta tag (`renderer/index.html:6`, and the same in `settings.html`, `strip.html`, `overlay.html`, `meeting-dock.html`, `flyby.html`). No remote script or stylesheet can load.

**Minimal IPC surface via contextBridge**
Five preload bridges each expose one named API object through `contextBridge.exposeInMainWorld`, carrying only the IPC channels that window needs: `preload.js:5`, `preload-settings.js:5`, `preload-overlay.js:5`, `preload-meeting-dock.js:5`, `preload-flyby.js:5`. No Node or Electron internals are exposed.

**URL validation before spawning a browser**
`isSafeExternalUrl` (`main.js:641`) rejects anything that is not http or https, URLs carrying embedded credentials, and hosts that are loopback or private (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`, `10.`, `192.168.`). The browser is launched through `spawn` with an argument array, never through a shell (`main.js:680`).

**CSRF protection on the OAuth callback**
The authorization URL carries a random `state` parameter, and the local callback server rejects any response whose `state` does not match (`integrations/google-calendar.js:88`, `integrations/google-calendar.js:100`). The callback server also shuts itself down after five minutes, so it is not left listening.

**Input validation with Zod**
User-editable configuration is validated against a Zod schema (`config/schema.js:5`) before being saved, on startup and on every settings save.

**File permissions on secrets**
The configuration file is written with `chmod 0600` on every save (`config/loader.js:58`), the Google OAuth token with `chmod 0600` (`integrations/google-calendar.js:75`, `integrations/google-calendar.js:119`), and the configuration directory is created with mode `0700` (`integrations/google-calendar.js:117`).

**Secrets masked before reaching the renderer**
The settings window never receives stored secrets. Jira API tokens, AI provider keys, the Google client secret and the Outlook feed URL are replaced by a placeholder before the config is handed to the renderer, and restored from the persisted config when a save comes back with the placeholder untouched (`config/secret-masking.js`).

**Outlook feed URL handled as a bearer credential**
The published ICS link grants read access to the whole calendar without authentication, so it is treated as a secret. The URL must be https (`webcal://` is normalized) and is refused when it points at a loopback, private, link-local or unique-local literal address (`integrations/outlook.js:46`, `integrations/outlook.js:62`). Redirects are followed only through the same validation, up to three hops (`integrations/outlook.js:103`). The response body is capped at 5 MB and the stream is cancelled past that (`integrations/outlook.js:69`). On failure only the hostname is logged, never the URL (`integrations/outlook.js:259`), and no Outlook task carries the URL into the renderer (`integrations/outlook.js:209`).

This is a literal-address check, not a DNS resolution: a hostname that resolves to a private address still passes. That is an accepted limit for a single-user desktop application, documented in the source.

**Database backup before destructive migrations**
Migrations that rebuild the `tasks` table snapshot the database first (`store/db-backup.js:70`). If the backup fails, the migration aborts rather than running without a recovery point (`store/db.js:137`).

**SQLite foreign key enforcement**
The database is opened with `PRAGMA foreign_keys = ON` (`store/db.js:29`).

**Dependency pinning**
`package-lock.json` is present and committed, pinning all transitive dependencies to specific versions.

## Known Limitations

These are properties of the current design, listed so nobody has to discover them by reading the source.

**The Google Calendar scope is read and write**
The OAuth authorization requests `https://www.googleapis.com/auth/calendar` (`integrations/google-calendar.js:15`), which includes write access. Read-only would be enough to display events, but the time log and the live timer create and update calendar events, so the wider scope is required for those features. Revoking the grant in your Google account disables the sync along with them.

**Secrets are stored in plaintext, protected by file permissions only**
API keys, the Jira token, the Google client secret and the Outlook feed URL live in `~/.config/deadlineaura/config.json` as readable text, with the file set to `0600`. There is no keyring integration and no encryption at rest. Anyone able to read files as your user, including any process running under your account, can read them.

**AI scoring sends event titles to third-party providers**
When AI scoring is enabled, the prompt carries the titles of upcoming events, and where present their description, organizer and attendee count, to the configured provider (Groq, Gemini, OpenAI or Anthropic) over HTTPS. Line breaks are collapsed and the text is truncated to a fixed length before insertion (`ai/prompt.js:25`), but the content is not otherwise filtered, so an event title is a possible prompt injection vector into the scoring response. If those titles are confidential, turn AI scoring off in Settings → AI.

## Security Best Practices for Users

- If you run from source, keep `.env` out of version control. It is already listed in `.gitignore`.
- The token at `~/.config/deadlineaura/google-token.json` grants read and write access to your calendar. Do not share it, and do not copy it to a shared machine. To invalidate it, revoke the application from your Google account and delete the file.
- Treat the Outlook ICS link as a password. Anyone who has it reads your calendar without logging in, and it cannot be revoked selectively: the only way to withdraw it is to stop publishing the calendar from Outlook, which invalidates the link for every consumer.
- Both `config.json` and the token file are written with `0600`, but they stay readable by anything running as your user. On a shared machine, prefer a separate account over relying on those permissions.
- AI provider API keys are forwarded to third-party APIs (Groq, Gemini, OpenAI, Anthropic) over HTTPS, together with the event titles being scored. Review each provider's data handling policy before enabling the feature.
- Install the `.deb` only from the [releases page](https://github.com/AndreaBonn/deadline-aura/releases) of this repository.

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
