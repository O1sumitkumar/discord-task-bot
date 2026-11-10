# Contributing to discord-task-bot

Thank you for wanting to help. The general rules for every PhilaCon Valley repository are in the
[org contributing guide](https://github.com/philaconvalley/.github/blob/main/CONTRIBUTING.md), and
everyone follows the
[Code of Conduct](https://github.com/philaconvalley/community-handbook/blob/main/CODE_OF_CONDUCT.md).
This file adds what is specific to this bot.

You do not need access to the PhilaCon Valley Discord server to work on this code. You build and
test everything on **your own test server**, which is free and takes about 15 minutes to set up.

Questions? Ask in our Discord: [philaconvalley.com/discord](https://philaconvalley.com/discord).

---

## What you need

- **Node 20.** The version is pinned in `.nvmrc` and `package.json`. With nvm, run `nvm use`.
- **A Discord account.**
- **Your own Discord server** for testing (see below).
- **Two bot applications** in the Discord Developer Portal: one for the Task Bot and one for Roost.
  The bot reads 11 settings at startup and stops with a clear error if any are missing, so you need
  both, even if you only work on one.

## 1. Make a test server

1. In Discord, click **+** in the server list, then **Create My Own**. Name it anything.
2. Create these text channels: `#tasks`, `#welcome`, `#introductions`, and `#mod-log`.
3. Create a role named `Neighbor`. In Server Settings → Roles → `Neighbor` → Permissions, turn on
   View Channels and Send Messages.
4. To test the join gate the way the real server runs it, turn **off** View Channels for
   `@everyone` in Server Settings → Roles → `@everyone`. Then give `@everyone` View Channel on
   `#welcome` only. A member with no role now sees only `#welcome`.

## 2. Make the two bot applications

At <https://discord.com/developers/applications>, click **New Application** twice: one named
anything like "Task Bot (test)", one like "Roost (test)". For **each** one:

1. **Bot** page: click **Reset Token** and copy the token. Treat it like a password.
2. **Bot** page: under Authorization Flow, turn **Requires OAuth2 Code Grant** off. If it stays on,
   the invite link fails.
3. **General Information** page: copy the **Application ID**.

For **Roost only**: on the **Bot** page, turn on **Server Members Intent**. Without it, Roost cannot
log in ("Used disallowed intents").

Invite each bot to your test server. Go to **OAuth2 → URL Generator**, check the `bot` and
`applications.commands` scopes, and pick these permissions:

| Bot | Permissions |
|---|---|
| Task Bot | View Channels, Send Messages, Manage Events |
| Roost | View Channels, Send Messages, Read Message History, **Manage Roles** |

Open the generated URL and add the bot to your test server.

Then set up Roost's role, or its startup self-check refuses to run:

1. Server Settings → Roles: drag the `Roost (test)` role **above** `Neighbor`.
2. Give the Roost role View Channel, Send Messages, and Read Message History on `#welcome`, and
   View Channel and Send Messages on `#introductions` and `#mod-log`.

## 3. Fill in `.env`

```bash
cp .env.example .env
```

Turn on Developer Mode in Discord (User Settings → Advanced). Then right-click a server, channel, or
role and choose **Copy ID**.

| Key | Where it comes from |
|---|---|
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | The Task Bot application |
| `ROOST_TOKEN`, `ROOST_CLIENT_ID` | The Roost application |
| `GUILD_ID` | Your test server |
| `TASKS_CHANNEL_ID` | `#tasks` |
| `WELCOME_CHANNEL_ID` | `#welcome` |
| `INTRODUCTIONS_CHANNEL_ID` | `#introductions` |
| `MOD_LOG_CHANNEL_ID` | `#mod-log` |
| `NEIGHBOR_ROLE_ID` | The `Neighbor` role |
| `DB_PATH` | Leave as `./data/tasks.db` |

`.env` is in `.gitignore`. **Never commit it, and never paste a token into an issue, a pull request,
or Discord.** If a token leaks, reset it in the Developer Portal at once.

`.env` wins over variables already exported in your shell (`dotenv` runs with `override: true`), so
a `DISCORD_TOKEN` in your `~/.zshrc` for another bot cannot shadow it.

## 4. Run it

```bash
npm install
npm run deploy-commands   # registers /task, /event, and /poll on your test server
npm run dev               # runs both bots with live reload
```

You are set up when the log shows:

```
Logged in as <your Task Bot>
[roost] Logged in as <your Roost>
[roost] self-check passed — handlers armed
```

If the self-check fails, its log line names the missing setting or permission.

To test the join gate, use a **second Discord account** with no role: open `#welcome`, tap the
button, and answer the question. Do not test by removing `Neighbor` from your main account on the
real server.

---

## Making a change

1. **Open an issue first** for anything bigger than a small fix, so we agree on the plan before you
   write code. Look for issues labeled
   [`good first issue`](https://github.com/philaconvalley/discord-task-bot/labels/good%20first%20issue).
2. **Branch from `main`.** `main` is protected: every change goes through a pull request, and CI
   must pass.
3. **Write the test first** when you can. Run `npm test` and watch it fail, then make it pass.
4. **Before you push,** run both checks that CI runs:

   ```bash
   npm run build   # TypeScript type check
   npm test        # Vitest suite
   ```

5. **Open a pull request.** Fill in the template: what changed, why, and how you tested it.

### How the code is laid out

- `src/commands/` — slash commands. `src/lib/` — pure helpers, such as date parsing and poll
  validation.
- `src/roost/` — the join bot. **`joinGate.ts` holds decisions and text** (pure functions, fully
  tested). **`client.ts` holds the Discord wiring** (thin, tested by hand).
- `src/repositories/` — all SQL. Command handlers never write SQL themselves.
- `tests/` — Vitest, one file per module.

**The rule that keeps this codebase testable:** put decisions and text in plain functions that take
plain values, and test those. Keep the code that talks to Discord as thin as possible. A function
that needs a live Discord connection cannot be tested in CI.

### Rules that protect the community

These come from how the server runs. A pull request that breaks one will not be merged.

- **Nobody gets `Neighbor` except through the join button.** Do not add a code path, command, or
  fallback that grants it some other way, even "just when the button fails." The button is how
  people agree to the community guidelines.
- **Mod-log messages never ping anyone.** They quote member text, so `logToModLog` sends with no
  allowed mentions. Keep it that way.
- **Sticky roles restore from an allowlist only** (`Builder`, `Connector`, `Voice`). Never add
  `Crew` or a bot role to it: that would hand out privileges on rejoin.
- **Member-facing text** (button labels, prompts, greetings) is written for someone who may not code
  at all yet. Plain, warm, no jargon.

## Deploying

Maintainers only. A merge to `main` deploys to Railway automatically. See "Deploying to Railway" in
the README.
