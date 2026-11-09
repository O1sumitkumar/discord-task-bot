# discord-task-bot

![CI](https://github.com/philaconvalley/discord-task-bot/actions/workflows/ci.yml/badge.svg)

Discord bot for PhilaCon Valley task assignments, due-date reminders, and
Scheduled Event creation. PhilaCon Valley is a Philadelphia tech community,
and this bot runs its task coordination in Discord.

## How it works

TypeScript on Node 20, running as one long-lived process with **two**
`discord.js` clients sharing one SQLite handle: the Task Bot (this repo's
original purpose) and Roost (a second Discord application — see below).
`src/index.ts` loads configuration from the environment, opens the SQLite
database, wires up the slash commands, and starts the reminder cron once the
Task Bot client is ready, then boots Roost alongside it. Command errors are
caught in the dispatcher and answered with an ephemeral reply rather than
taking the process down.

**Commands**

- `/task add | list | done | delete` (`src/commands/task.ts`) — assign a task
  to a Discord user with a due date, list tasks filtered by assignee or
  status, mark a task done, or delete it. Due dates are typed in plain
  language, e.g. `friday` or `july 17`.
- `/event add` (`src/commands/event.ts`) — create a Discord Scheduled Event
  from a name, start time, end time, and location, and reply with the event
  URL. Requires the bot's `Manage Events` permission.

Command definitions are registered to the guild by `npm run deploy-commands`
(`src/deploy-commands.ts`), separate from running the bot.

**Storage**

Tasks are stored in SQLite through `better-sqlite3`. `src/db.ts` creates the
`tasks` table on startup, and every read and write goes through
`src/repositories/taskRepository.ts`, so command handlers and the reminder job
never issue SQL themselves. That boundary is also what makes the data layer
testable against an in-memory database.

**Reminders**

`src/reminderJob.ts` schedules a `node-cron` job at 09:00 America/New_York. It
finds open tasks due today or tomorrow, posts one message per reminder to
`TASKS_CHANNEL_ID` mentioning the assignee, and then flags the task
(`reminded_day_before` / `reminded_due_date`) so the same reminder is not sent
again on a later run.

**Dates**

`src/lib/parseDate.ts` wraps `chrono-node` to turn typed input into a date,
resolving ambiguous input forward in time. `src/lib/date.ts` holds the
timezone-aware conversion to `YYYY-MM-DD`. Dates are stored and compared in
America/New_York, so "due today" means today in Philadelphia no matter which
timezone the host runs in.

**Configuration**

`src/config.ts` requires `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `GUILD_ID`,
`TASKS_CHANNEL_ID`, `DB_PATH`, `ROOST_TOKEN`, `ROOST_CLIENT_ID`,
`WELCOME_CHANNEL_ID`, `MOD_LOG_CHANNEL_ID`, `NEIGHBOR_ROLE_ID`, and
`INTRODUCTIONS_CHANNEL_ID`. If any
are absent it throws at startup naming the missing ones, so a misconfigured
deploy fails immediately instead of behaving oddly later. See
`.env.example`.

**Roost — membership bot**

Roost is a second Discord application, run from `src/roost/` in this same
process, that replaces the third-party carl-bot dependency for auto-role,
welcome, sticky roles, and mod-log. Full design and rationale:
`docs/superpowers/specs/2026-08-12-roost-membership-bot-design.md`.
Implementation plan: `docs/plans/2026-08-13-roost-phase1-implementation.md`.

- **Join gate.** Roost grants nothing on join. It keeps one message with an
  **I'm in** button in `#welcome`; clicking it grants `Neighbor` (baseline
  server access — `@everyone` holds no permissions), greets the member in
  `#introductions`, and logs it. A bot that joins with a scraped invite stays
  at the door. Changed 2026-11-09; see the design doc.
- On join, it restores any previously-held role from a fixed allowlist
  (`Builder`, `Connector`, `Voice` — never `Crew` or bot roles, which would be
  a privilege escalation). Those roles open no channels on their own.
- On leave, it snapshots that member's allowlisted roles to the
  `member_roles` table so they can be silently restored on rejoin.
- On every startup it runs a self-check (Roost's role must sit above
  `Neighbor` and hold Manage Roles, the welcome/introductions/mod-log channels
  must resolve, and Roost must be able to post in them) and refuses to arm its
  handlers if the check fails. It then posts the join prompt if it is missing,
  and logs how many people are waiting. It never grants `Neighbor` on startup.
- Every join, leave, and failure is logged to `MOD_LOG_CHANNEL_ID`.
- **Automod is deliberately not built.** Discord's native AutoMod replaces
  carl-bot's spam/link filtering instead — see the design doc for why.

Setting up the Roost Discord application (creating it, enabling the Server
Members intent, positioning its role above `Neighbor`, and the carl-bot
dual-run cutover) is a manual, one-time process — see "Migration" in the
design doc.

**Tests**

Vitest suites in `tests/` cover configuration loading (`config.test.ts`),
date conversion (`date.test.ts`), due-date parsing (`parseDate.test.ts`),
the task repository including the reminder query
(`taskRepository.test.ts`), the `member_roles` repository
(`memberRoleRepository.test.ts`), and Roost's pure decision functions, including the join gate, and
mod-log writer (`tests/roost/`). Roost's self-check, reconciliation, and
live Discord event handling are deliberately not unit tested — the manual
carl-bot dual-run period is the test for those (see the design doc's
"Testing" section).

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values (see "Discord setup"
   below for where to find them).
3. `npm run dev` — runs the bot with live reload against your `.env` config.

## Discord setup

1. Create an application at https://discord.com/developers/applications.
2. Under **Bot**, create a bot user and copy the token into `DISCORD_TOKEN`.
3. Copy the **Application ID** (General Information tab) into
   `DISCORD_CLIENT_ID`.
4. Under **Bot**, scroll to **Authorization Flow** and turn **Requires OAuth2
   Code Grant** OFF. It's on by default for new applications and silently
   breaks the invite link below (see Troubleshooting).
5. Under **OAuth2 → URL Generator**, check the `bot` and
   `applications.commands` scopes, then under bot permissions check
   `View Channels`, `Send Messages`, and `Manage Events`. Open the generated
   URL and invite the bot to the PhilaCon Valley server.
6. Enable Developer Mode in Discord (Settings → Advanced), right-click the
   server icon → Copy Server ID → `GUILD_ID`. Right-click the `#tasks`
   channel → Copy Channel ID → `TASKS_CHANNEL_ID`.
7. If `#tasks` is a private channel, open its channel settings → Permissions
   → Add members or roles → add the bot, with View Channel and Send Messages
   allowed. Slash-command replies work in a private channel without this,
   but the reminder cron's direct channel posts do not (see Troubleshooting).
8. Register slash commands: `npm run deploy-commands`. Re-run this any time
   command definitions change.

**Roost setup** (separate Discord application — see "Migration" in the
design doc at `docs/superpowers/specs/2026-08-12-roost-membership-bot-design.md`
for the full carl-bot dual-run cutover, not repeated here):

1. Create a second application, **Roost**. Under **Bot**, enable the
   **Server Members Intent** and copy the token into `ROOST_TOKEN`, and the
   Application ID into `ROOST_CLIENT_ID`.
2. Invite it to the server with the **Manage Roles** permission.
3. In Server Settings → Roles, drag the `Roost` role **below** `Crew` and
   **above** `Neighbor`. Roost's startup self-check refuses to arm its
   handlers if this isn't true — role assignment fails without it.
4. In `#welcome`, give the `Roost` role View Channel, Send Messages, and Read
   Message History. The channel denies Send Messages to `@everyone`.
5. Copy channel/role IDs into `WELCOME_CHANNEL_ID`, `MOD_LOG_CHANNEL_ID`,
   `INTRODUCTIONS_CHANNEL_ID`, and `NEIGHBOR_ROLE_ID`.

## Deploying to Railway

1. Push this repo to GitHub under the `philaconvalley` org.
2. In Railway, create a new service from this GitHub repo (existing Hobby
   plan project).
3. Add a volume mounted at `/data`.
4. Set environment variables: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`,
   `GUILD_ID`, `TASKS_CHANNEL_ID`, `DB_PATH=/data/tasks.db`, `ROOST_TOKEN`,
   `ROOST_CLIENT_ID`, `WELCOME_CHANNEL_ID`, `MOD_LOG_CHANNEL_ID`,
   `NEIGHBOR_ROLE_ID`, and `INTRODUCTIONS_CHANNEL_ID`. Set these **before** a
   deploy that adds a new key: `loadConfig` throws on a missing key, and the
   Task Bot shares the process, so it would go down too.
5. Deploy. Railway runs `npm run build` then `npm run start` automatically
   (Nixpacks detects the `build` script).
6. Run `npm run deploy-commands` once (locally, with the same `.env` values
   as production) to register the slash commands to the guild.

`main` is connected to this Railway service — every push to `main` (i.e.
every merged PR) auto-deploys. There's no manual `railway up` step in normal
operation.

## Testing & CI

- `npm test` runs the Vitest suite locally.
- Every push and pull request against `main` runs `npm ci`, `npm run build`
  (TypeScript check), and `npm test` via GitHub Actions
  (`.github/workflows/ci.yml`). `main` is branch-protected to require this
  check before merging — work in a branch and open a PR rather than pushing
  directly to `main`.

## Troubleshooting / Gotchas

Real issues hit setting this up the first time, kept here so they don't
have to be rediscovered:

**Discord invite link fails with "Integration requires code grant."**
New Discord applications default to **Requires OAuth2 Code Grant** = on,
under the **Bot** page's **Authorization Flow** section. This blocks the
plain `bot` + `applications.commands` invite link the OAuth2 URL Generator
produces. Turn it off, save, and regenerate the invite link.

**Reminders never post, but slash commands work fine in the same channel**
If `#tasks` (or whatever `TASKS_CHANNEL_ID` points to) is a private channel,
a slash-command reply can still render there because it rides on the
interaction itself — but the reminder cron's `channel.send()` is a direct
channel post, which needs the bot to actually have channel access. Add the
bot to that channel's permissions (View Channel + Send Messages). The
failure surfaces as `DiscordAPIError[50001]: Missing Access` in the logs.

**Railway build fails on `better-sqlite3` with a Python/node-gyp error**
`better-sqlite3` ships prebuilt binaries for common Node versions; if
Railway's Nixpacks builder auto-selects a very new Node version with no
matching prebuild, npm falls back to compiling from source via node-gyp,
which needs Python — not present in the build image, so it fails with
`Could not find any Python installation to use`. This is why
`package.json`'s `engines.node` is pinned to an exact `"20.x"` rather than
an open range like `">=20"` — an open range lets Nixpacks pick the newest
available Node instead of a version with a working prebuild. Don't loosen
this pin without confirming the target Node version has a `better-sqlite3`
prebuild for it.
