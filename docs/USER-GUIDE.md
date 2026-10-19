**English** | [Italiano](./USER-GUIDE.it.md)

# User guide

Everything you need to install Deadline Aura and use it day to day. No programming knowledge is assumed. If you want to build the app from source instead, that is covered in the [README](../README.md).

## Contents

- [Before you start](#before-you-start)
- [Install the app](#install-the-app)
- [What you see on first start](#what-you-see-on-first-start)
- [Connect Google Calendar](#connect-google-calendar)
- [Connect Outlook](#connect-outlook)
- [Connect Jira](#connect-jira)
- [Turn on AI scoring](#turn-on-ai-scoring)
- [Reading the colors](#reading-the-colors)
- [Seeing your Claude and Codex limits](#seeing-your-claude-and-codex-limits)
- [Working with tasks](#working-with-tasks)
- [Tracking your time](#tracking-your-time)
- [Meeting reminders](#meeting-reminders)
- [Understanding the score](#understanding-the-score)
- [Settings, tab by tab](#settings-tab-by-tab)
- [Where your data lives](#where-your-data-lives)
- [When something does not work](#when-something-does-not-work)
- [Updating and uninstalling](#updating-and-uninstalling)

## Before you start

Deadline Aura runs on Linux with GNOME on X11. It does not run on Wayland, Windows or macOS. If you are unsure which session you are in, open your system settings and look at the "About" page, or log out and check the gear icon on the login screen, where the session type is selectable.

If you start the app in a Wayland session, it shows a desktop notification explaining what to do: log out, open the gear icon on the login screen and choose "GNOME on Xorg".

Nothing else is required to install. Accounts for Google, Outlook and Jira are all optional: the app also works with only the tasks you type in yourself.

## Install the app

**1. Download.** Open the [latest release](https://github.com/AndreaBonn/deadline-aura/releases/latest). Under **Assets**, click the file ending in `.deb` and save it, usually to your `Downloads` folder.

**2. Install.** Double-click the downloaded file. Your system's software installer opens; click **Install** and type your password.

If you prefer the terminal:

```bash
cd ~/Downloads
sudo apt install ./deadlineaura_*.deb
```

**3. Start.** Search for "DeadlineAura" in your applications menu and open it. From then on it starts by itself every time you log in. To stop that, turn it off in the GNOME startup applications settings.

## What you see on first start

A thin colored strip appears on the right edge of every screen you have connected. That strip is the whole interface at rest: its color is your current workload.

On the very first launch the sidebar opens by itself, once, with a hint: you open and close it by clicking the colored strip on the screen edge, and the strip's color shows your workload. Press **Got it** to close the hint. It does not come back on later launches.

At the top of the sidebar you get the clock, the urgency bar with its score out of 100 (for example 63/100) next to the band word, and a cat icon. In the middle, your tasks grouped by where they came from. At the bottom, a row of buttons: settings (gear), **Move post-its**, refresh now, and close. Above the buttons sits the line **Updated HH:MM**, the time of the last data refresh. If a source failed, an orange line appears, for example **Not responding: Jira**, with an **Open settings** link.

With no accounts connected the sidebar shows a **Start here** card with three steps: write your first task (**New task** button), connect a calendar or Jira (**Open connections** button, which opens settings), and learn what the colors mean. The **+** to create a personal task is always there, even with zero tasks. The next sections fill the rest.

## Connect Google Calendar

This is the longest part of the setup, and it is a one-time job. Google requires every application that reads a calendar to be registered, so you create your own set of credentials. They stay on your machine.

**1. Create a Google Cloud project.** Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in. At the top of the page, open the project selector and create a new project. Any name will do.

**2. Enable the Calendar API.** In the left menu choose **APIs & Services → Library**, search for "Google Calendar API", open it and click **Enable**. Repeat the search for "Google Tasks API" and enable that too if you want your Google Tasks to appear.

**3. Create the credentials.** Go to **APIs & Services → Credentials**, click **Create Credentials → OAuth client ID**. If Google asks you to configure a consent screen first, do that: choose **External**, fill in the app name and your email address where required, and add your own Google account under **Test users**.

Back on the credentials page, choose application type **Desktop app**. Under **Authorized redirect URIs** add exactly:

```
http://localhost:34567/oauth/callback
```

Click **Create**. Google shows you a **Client ID** and a **Client Secret**. Keep that window open.

**4. Paste them into the app.** In Deadline Aura, click the gear button at the bottom of the sidebar, go to the **Connections** tab, and paste the client ID and client secret into the Google fields. While credentials are missing, the tab shows a 3-step guide that sums up these same points: an **Open the console** link, the redirect URI with a **Copy** button, and the fields where you paste Client ID and Client Secret. Filling them in switches Google Calendar on by itself.

**5. Authorize.** Press **Connect Google account**. The app saves any pending changes and opens the browser, where you are asked to grant access: sign in with the account whose calendar you want, and confirm. When it is done, the app tells you how it went: connected, already connected, credentials missing, port 34567 busy, or the reason for the problem. The authorization no longer waits for the next background sync: it finishes right away.

The app asks for read and write access to the calendar, not read-only. Reading is what colors your desktop; writing is what lets the time log and the live timer create calendar entries. If you never intend to use those, you can still grant it and simply not press those buttons.

After you confirm, the sidebar starts filling with your upcoming events.

**Which events count as important.** An event you colored red in Google Calendar is treated as top priority. An event whose title or description contains one of the priority keywords (by default `urgent`, `deadline`, `release`, `deploy`, `critico`) comes next, and everything else is normal. You can change the keyword list in **Settings → Connections → More options**, and Outlook has its own list in the same tab.

**If you use more than one Google account in your browser**, type the one tied to your work calendar in the **Google Account** field of the same tab, also under **More options**. The choice of calendars is there too. Meet links from the dock then open with that account instead of whichever profile the browser picks.

## Connect Outlook

Outlook needs no account, no password and no permission from your IT department. Deadline Aura reads the calendar through the public link that Outlook itself can publish.

**1. Publish the calendar.** In Outlook on the web, open **Settings → Calendar → Shared calendars → Publish a calendar**. Choose the calendar, set the permission to **Can view all details**, and publish. Outlook shows you two links; copy the **ICS** one.

**2. Paste it into the app.** In Deadline Aura open **Settings → Connections → Outlook**, paste the link and save. Filling in the link switches Outlook on by itself.

Two things worth knowing:

- **The link is a password.** Anyone who has it can read your entire calendar without signing in anywhere. Do not paste it into a chat or a ticket. If it leaks, the only fix is to stop publishing the calendar in Outlook, which invalidates it for everyone.
- **The feed is not live.** Microsoft regenerates the published file every few hours. A meeting somebody adds this morning may not show up until the afternoon. For anything time-critical, Google Calendar is the more responsive source.

Recurring meetings are handled properly: each occurrence appears on its own date, moved instances land where they were moved to, and cancelled ones do not appear at all.

## Connect Jira

Open **Settings → Connections → Jira** and fill in:

- **Domain**: your Atlassian address, such as `yourcompany.atlassian.net`
- **Email**: the address of your Atlassian account
- **API token**: create one at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens). Like the other secrets it stays hidden: the **Show** button reveals it
- **Which issues to show** (the JQL field): which issues to pull in. The default, `assignee = currentUser() AND statusCategory != Done`, means "everything assigned to me that is not finished". The **Restore default** link puts it back

Completing an instance switches Jira on by itself. A source that is on but not yet configured shows **On but not connected**.

Each instance has a **Verify connection** button: it reports how many issues the filter finds, or the problem (email or token not valid, site not found, filter not valid, site not reachable, domain must be just the address).

If you work on more than one Jira site, click **+ Add instance** and fill in a second set of fields. Each site can have its own filter. When a site is slow or refuses requests for a while, the app retries a few times and then skips it for that round: the other sites still update, and the tasks of the site that does not answer stay on your desktop as they were. The bottom of the sidebar shows “Not responding: Jira” until the site is reachable again.

## Turn on AI scoring

This step is optional and the app works without it. When enabled, an AI model reads the titles of your upcoming commitments and estimates how heavy the load is, which usually tracks reality better than counting deadlines does.

Open **Settings → AI**: the keys come first. Paste an API key for at least one of Groq, Gemini, OpenAI or Anthropic. Groq and Gemini are marked "free" and each has a **Get a key** link. If you list several, the app tries them in order and moves to the next one when a provider is unavailable. Provider order, timeout and **Response creativity** (the temperature) are under **Advanced options**, collapsed by default.

Be aware of what leaves your machine: the titles of your events, and where present their description, organizer and attendee count, are sent to the provider you chose. If your meeting titles are confidential, leave this off. The rest of the app is unaffected; the score is then computed from dates and priorities alone. With AI on but no key set, the tab shows "AI is off: add at least one key...".

## Reading the colors

The strip, the wallpaper tint and the urgency bar all show the same number, mapped onto five bands:

| Color                 | What it means                          |
| --------------------- | -------------------------------------- |
| Green                 | Calm. Nothing pressing.                |
| Light green to yellow | Normal working load.                   |
| Yellow                | Worth paying attention to.             |
| Orange                | Urgent. Something needs to move today. |
| Red                   | Critical.                              |

The color comes from a blend: the AI assessment weighs 70 percent, the mechanical calculation on dates and priorities 30 percent. Without an AI provider, the mechanical part is the whole score.

The display refreshes every 60 seconds. The underlying data is downloaded every 10 minutes (the **Download data every** field in the General tab, which takes effect without a restart), and the AI recalculates when your events change or every 6 hours, whichever comes first. All three intervals are configurable.

The wallpaper also carries a short agenda in its top-left corner, headed **NEXT 24H**: the time, the source and the title of every event or task due in the next 24 hours. When the list is too long for the space, the last line says how many more there are.

## Seeing your Claude and Codex limits

At the bottom of the wallpaper a band runs across the whole screen, with one card for every Claude account on the computer and one for Codex. If you use several Claude accounts through Cloak, you get one card per profile; without Cloak, a single card for your regular account.

Under the account name, each card has two lines:

- **5h**: how much of the 5-hour limit you have used and when it resets, for example `14:30 (~2h 15m)`.
- **7d**: how much of the weekly limit you have used and when it resets, for example `Fri 09:00 (3d 4h)`.

The bar is white below 70 percent, amber up to 89 and red from 90 up. A few markers to know:

| What you see | What it means                                                                   |
| ------------ | ------------------------------------------------------------------------------- |
| `~0%` free   | The window has already reset: the value is an estimate until fresh data arrives |
| `n/a`        | There is no data yet                                                            |
| `upd. 01:06` | The last reading is more than 30 minutes old: no newer one has arrived since    |

Codex data arrives on its own, from the logs Codex writes on your computer. Claude needs a one-time step: in **Settings → Claude/Codex limits** press **Install capture**. The app places a small script in front of the Claude Code statusline, which keeps working as before. The script stores only percentages and reset times, never reads your credentials, and needs `python3`. The change goes into `~/.claude/settings.json`, so it applies to every Cloak profile sharing that file; before writing it the app saves a copy in `~/.local/share/deadlineaura/backups/statusline`.

An account updates only while a Claude Code session on that account is open. The wallpaper is redrawn when something visible changes and at least every 15 minutes, so a percentage can lag a few points behind, for at most a quarter of an hour.

If you do not need the band, turn it off in **Settings → Claude/Codex limits → Show Claude/Codex limit usage**.

## Working with tasks

Open the sidebar by clicking the strip. Tasks are grouped into sections, and any section with nothing in it is simply not drawn:

1. **In Progress** - the task whose timer is running
2. **Local** - what you typed in yourself
3. **Google Tasks** - your open Google tasks
4. **Google Calendar** - upcoming events
5. **Outlook** - events from the published feed
6. **Jira Favorites** - the Jira issues you starred
7. **Jira** - everything else matching your filter

Each card shows the title, a countdown, its urgency color on the left edge and the priority in words (Critical, High, Medium, Low). Clicking a Jira or Google Calendar card opens it in your browser. Outlook cards do not open anything, because a published feed carries no per-event page.

**Create a task.** Click **+** in the Personal section header, type a title, pick a date and a priority (from “P1 - Critical” to “P4 - Low”), and press Enter.

**Act on a task.** Three actions are always visible on a card: complete (personal tasks only), star (Jira only) and start timer (Jira and personal tasks). The others are in the **⋯** menu, with written labels: **Edit**, **Pin to desktop** (or **Unpin from desktop**), **Log time** and **Delete** (personal tasks only).

Delete is not immediate: for 5 seconds a bar saying "“title” deleted" appears with an **Undo** button. After those 5 seconds the task is deleted for good. Jira favorites no longer show up a second time in the Jira list below.

Under the urgency bar there is an **AI note and 5-day forecast** button, which opens a written assessment of your current load and a five-day stress forecast. It appears only when there is a note or a forecast.

**Pin to the desktop.** **Pin to desktop**, in the **⋯** menu, turns a task into a post-it drawn straight into your wallpaper, so you see it without opening anything. To rearrange the notes, click **Move post-its** at the bottom of the sidebar: a transparent overlay opens where you drag each note where you want it. Click Save, or press Escape to discard. Positions are stored as percentages, so they survive a change of resolution or monitor. To take a note off the desktop from the overlay, click the × in its corner and then Save.

**When a pinned task disappears.** If a pinned issue is closed in Jira or a pinned event is deleted from the calendar, the post-it does not vanish: it gets a red border and the note "Closed at the source: disappears on its own in 48 hours", so you can't miss it. Personal tasks are labelled "Personal". After 48 hours the task is removed for good, and the post-it with it.

## Tracking your time

Two ways, both of which write to your Google Calendar.

**Log time after the fact.** Open the **⋯** menu of a card and choose **Log time**. A small form appears with the fields **Day** and **Start** (defaulting to now, rounded to the nearest quarter hour), **Duration (minutes)** between 15 and 480 with quick buttons 15 min, 30 min, 1h and 1h 30m, and the **Calendar** to write to. If something is missing, a red line says what (for example, choose the calendar). The entry is created as `[JIRA-KEY] - Title`, which is the format Tempo and similar tools expect. Your calendar choice is remembered for next time.

**Time it live.** Click the green play button on the card. A calendar entry is created immediately and its end time is pushed forward every 60 seconds while the timer runs. The button becomes a red stop button showing elapsed time; pressing it closes the entry at the exact duration. Only one timer runs at a time, and starting a second one stops the first. If the app closes mid-timer, it picks the timer back up when you reopen it.

For a personal task the Jira key is optional: **+ Link to a Jira issue (optional)** lets you pick one from your Jira issues or type a code. The live timer on a personal task without a Jira key starts at once, if the app already knows a default calendar.

Without Google Calendar connected, the timer button is hidden and the **⋯** menu offers **Connect Google** (it opens settings) instead of **Log time**. A running timer always keeps its stop button.

## Meeting reminders

Three separate things warn you about a meeting, from quietest to loudest.

**The dock.** A translucent bar at the bottom of each screen listing meetings that start within the next 10 minutes, with a **Join** button for Meet, Teams or Zoom. It appears when there is something to show and disappears when there is not, and it never steals space from your windows. The × on a meeting hides it on that screen only, if you have already seen it and want the space back.

**The flyby.** Sixty seconds before the start, a pixel cat walks across every screen towing a banner with the meeting title and countdown, then leaves after about 20 seconds. It exists for the case where the dock is hidden behind a full-screen window.

To control it, click the cat icon at the top of the sidebar. The menu opens with the header **Meeting alert cat** and the current state (on, snoozed until a given time, off):

| Menu entry           | Effect                                                                          |
| -------------------- | ------------------------------------------------------------------------------- |
| Snooze 1h / 3h / 24h | Silence, then it comes back by itself                                           |
| Forever              | Off until you switch it back on                                                 |
| Reactivate           | Undo a snooze or a shutdown immediately (shown only while alerts are suspended) |

While alerts are suspended the cat icon is drawn crossed out, so you can tell at a glance.

**Desktop notifications.** Standard system notifications when the score crosses a threshold you set, plus burnout warnings. The burnout detector looks at 7 days of AI history and fires when it sees sustained stress, too little recovery, or a high emotional load. It needs no setup.

## Understanding the score

Next to the urgency score there is a `?` button. It opens a panel explaining where the number came from, in this order:

1. **What weighs most right now**: the three tasks pushing the number up, each with an **Open** button when it has a link.
2. **Why this color**: the explanation in plain sentences.
3. **How it is calculated**, a section closed by default: what the AI assessed and how much its opinion weighed, what the mechanical calculation produced (including the amplifier that kicks in on a crowded calendar and how many out-of-office events were left out), and the 70/30 blend of the two.

Days marked as leave or out of office do not count as load, so a week of holiday reads as quiet rather than as a wall of events. If no AI provider answered, the panel says so and reports the mechanical score by itself.

## Settings, tab by tab

Click the gear at the bottom of the sidebar. The window opens on the **Connections** tab. Each tab has its own **Reset section** button, so you can undo your changes in one area without touching the rest.

| Tab                 | What lives here                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Connections         | Connection status, Google credentials and calendars, the Outlook feed, Jira instances and filter                   |
| AI                  | Provider keys; under Advanced options the order they are tried in, timeout and response creativity                 |
| Notifications       | Desktop notifications, the urgency threshold that triggers them, the pause between them, and the meeting dock      |
| Shift               | Your working days and hours, and your holidays                                                                     |
| Wallpaper           | Whether to tint the wallpaper, which background images to use, post-it options                                     |
| Claude/Codex limits | Whether to show the Claude and Codex usage band, and the buttons to install or remove the Claude capture           |
| Sidebar             | Which edge it opens on, how wide, how transparent                                                                  |
| Interface           | Language, how many tasks to show, countdown format                                                                 |
| General             | How often the display refreshes, how often data is downloaded (**Download data every**), **How far ahead to look** |
| Advanced            | The constants behind the urgency calculation (the **Urgency calculation** group, with **Growth speed (K)**)        |

At the top of the Connections tab, **Connection status** shows one of these for Google Calendar, Outlook and Jira: Connected, Off, Needs setup, Needs authorization, Error at the last refresh. Next to it you see the time of the last refresh. The status refers to the settings already saved, not to what you are still typing.

When you have unsaved changes, **● Unsaved changes** appears next to **Save**. Closing the window with the × then asks "You have unsaved changes", with three choices: **Save and exit**, **Exit without saving**, **Keep editing**. If a save fails, the app names the tab and the limit, for example "Check the “AI” tab: Enter a value no greater than 30000.", and jumps to that tab.

The **Shift** tab drives the countdown shown under the clock: how long until your shift ends, or when the next one starts. It does not change the urgency score. There are two ways to describe your hours:

- **Regular**: the same week every week. You pick the working days, one or more time slots (09:00-13:00 and 14:00-18:00, Monday to Friday, out of the box) and your days off.
- **Variable**: a calendar for each month where you set the hours day by day, for rotating or irregular shifts.

You do not need to tidy up afterwards: holidays and months that are over are removed by themselves the next time the app starts.

Secrets you have already saved are shown as dots rather than their real value. Leaving those dots alone keeps the stored value; typing over them replaces it.

## Where your data lives

Everything stays on your machine.

| Path                                        | What it holds                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.config/deadlineaura/config.json`        | Your settings, including the tokens and keys                                                                                                                          |
| `~/.config/deadlineaura/google-token.json`  | The Google authorization                                                                                                                                              |
| `~/.local/share/deadlineaura/db.sqlite`     | Tasks and score history                                                                                                                                               |
| `~/.local/share/deadlineaura/wallpaper.png` | The generated wallpaper                                                                                                                                               |
| `~/.local/share/deadlineaura/ai-usage/`     | Percentages and reset times of your Claude accounts                                                                                                                   |
| `~/.local/share/deadlineaura/bin/`          | The capture script used by the Claude Code statusline                                                                                                                 |
| `~/.local/share/deadlineaura/backups/`      | Copies of the database taken before an update changes its structure (the last 3), and of `~/.claude/settings.json` from before each install or removal of the capture |

Both files under `.config` are written readable by your account only. They are not encrypted, so anything running as you can read them. For the full picture, see the [security policy](../SECURITY.md).

## When something does not work

**No strip appears after installing.** Almost always a Wayland session. Log out, and on the login screen use the gear icon to pick the X11 or "Xorg" variant of GNOME.

**The wallpaper never changes color.** The app sets the wallpaper through GNOME. On a different desktop environment it falls back to `feh`, which may not be installed. The sidebar and the strip work regardless.

**No desktop notifications.** They go through `notify-send`, from the `libnotify-bin` package. Install it if it is missing.

**The calendar stays empty.** Check the **Updated HH:MM** time at the bottom of the sidebar and the orange **Not responding: ...** line, if there is one, then press the refresh button to force a round. Also open **Connection status** in **Settings → Connections**: it tells you which source is off, needs setup or is in error, and for Jira **Verify connection** gives the reason. If nothing changes, the usual cause is a mistyped redirect URI in the Google Cloud console: it has to be exactly `http://localhost:34567/oauth/callback`, with no trailing slash.

**Google stops working after a while.** If your Google Cloud consent screen is still in testing mode, Google expires the authorization periodically. Publishing the consent screen, or reauthorizing when it happens, both work.

**An Outlook meeting is missing or out of date.** Expected within a few hours of a change, since Microsoft rebuilds the published file on its own schedule. If an event never appears at all, republish the calendar with the **Can view all details** permission: a feed published with limited detail hides titles.

**The cat never shows up.** Check the cat icon at the top of the sidebar. If it is crossed out, the alerts are snoozed or off, and **Reactivate** brings them back.

**Everything is red and it should not be.** Open the `?` panel next to the score to see what is driving it. A common cause is a stretch of leave that is not marked as out of office in the calendar, which the app then reads as a solid block of commitments. Marking those days out of office in Google Calendar removes them from the count.

## Updating and uninstalling

To update, download the newer `.deb` from the [releases page](https://github.com/AndreaBonn/deadline-aura/releases/latest) and install it the same way as the first time. It replaces the old version and keeps your data.

To remove it:

```bash
sudo apt remove deadlineaura
```

If you installed the Claude limit capture, press **Remove capture** in **Settings → Claude/Codex limits** first: it puts your statusline back as it was. If you forget, nothing breaks: the script stays in `~/.local/share/deadlineaura/bin` and keeps passing the data to your statusline; to remove it afterwards, run `~/.local/share/deadlineaura/bin/claude-capture.py uninstall`.

Your settings and database are left in place, so reinstalling later picks up where you left off. To erase those too, delete `~/.config/deadlineaura` and `~/.local/share/deadlineaura`.

---

[Back to README](../README.md) | [Security policy](../SECURITY.md) | [Architecture](./ARCHITECTURE.md)
