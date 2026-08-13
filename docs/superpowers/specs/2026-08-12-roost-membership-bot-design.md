# Roost — the membership bot

**Status:** Design approved 2026-08-12. Phase 1 built 2026-08-13
(`docs/plans/2026-08-13-roost-phase1-implementation.md`) — not yet deployed;
manual migration steps in "Migration" below are still outstanding.
**Owner:** Waskar
**Repo:** `philaconvalley/discord-task-bot`
**Supersedes nothing.** Related: `philaConValley/docs/superpowers/specs/2026-08-11-badge-system-design.md`
(source of truth for what a badge *means*), `philaConValley/community/discord/channel-map.md`
(server layout and permissions).

---

## Why this exists

PhilaCon Valley's Discord depends on **carl-bot**, a third-party hosted bot, for the one function that
decides whether a new member can use the server at all.

`@everyone` carries a permission bitfield of exactly `0`. Every permission a member holds comes from
the `Neighbor` role, and carl-bot assigns it on join. If that stops firing, new arrivals see an empty
server and leave. Nobody files a bug.

The goal is to remove that dependency without taking on the one job carl-bot does that PhilaCon
should not build: automod.

---

## What the live server audit found

Read directly from the Discord API on 2026-08-11, not from documentation.

### Role hierarchy — one bug, now fixed

Discord requires your highest role to be **strictly above** a target's highest role before you can
assign, kick, ban, or time out. Permissions alone are not enough.

Before the fix, `Crew` sat at position 5 while `Neighbor` sat at 9. Because every member — including
every Crew member — holds `Neighbor`, **no Crew member could kick, ban, time out, or assign any
member role.** Crew's Kick, Ban, Manage Guild, Manage Roles, and Moderate Members permissions were
all inert. Moderation was carl-bot plus the server owner, and nothing else.

**Fixed 2026-08-11:** `Crew` moved to position 10, above `Neighbor` at 9. Verified live.
**Also done:** the `Admin` role, which granted only Manage Roles and sat below the member roles, was
deleted.

### Bots on the server

| Bot | Purpose | Notes |
|---|---|---|
| carl-bot | Moderation, automod, welcome, auto-role | The dependency being removed |
| PhilaCon Task Bot | Tasks, reminders, events, polls | This repo |
| Perch | Community posting through `discord-mcp` | Holds **Moderate Members**, which `channel-map.md` does not record |
| PhilaCon Door | NFC check-in | View and Read History only |
| NoteCat | Unknown | **Not documented anywhere.** Can post in every channel it can see |

### Two unresolved findings, recorded here, out of scope for this build

1. **`Neighbor` grants Manage Events to all 46 members.** Not documented. Any member can create,
   edit, or delete server events.
2. **The Task Bot holds `Neighbor`.** Carl-bot assigned it on join, and that borrowed role is the
   only reason `/event` works — the bot's own role has View and Send only. A command in production
   depends on an auto-role meant for humans. The fix is to remove Manage Events from `Neighbor`, add
   it to the Task Bot's own role, and drop `Neighbor` from the bot.

---

## Scope

**Phase 1 — carl-bot replacement.** Auto-role, welcome, sticky roles, mod-log. This is what gets
built.

**Phase 2 — patch badges.** The wall, `/patches`, the earn-night post. Decided but not built;
recorded below so the decisions survive.

**Explicitly not built: automod.** It is the only function on carl-bot's list with an adversary. A
spam filter is tuned against attacks a server has already seen; PhilaCon has seen none. Replace it
with **Discord's native AutoMod**, which is built in, free, and maintained by Discord. That removes
the carl-bot dependency without owning an adversarial system.

---

## Architecture

**One repo, one process, two Discord applications.**

```
src/
  index.ts        boots both clients, shares one db handle
  config.ts       extended
  db.ts           adds the member_roles table
  commands/       unchanged — task, event, poll
  reminderJob.ts  unchanged
  repositories/   unchanged, plus memberRoleRepository
  lib/            unchanged
  roost/          NEW
```

A Discord *application* is not a process. One Node process runs two `Client` instances on two
tokens. In Discord they are separate identities with separate permissions and separate audit-log
entries. Roost holds Manage Roles and sits above `Neighbor`; the Task Bot keeps View, Send, and
Manage Events, and declares only the `Guilds` intent, so it gains no new reach.

**Honest limit.** Both tokens live in one `.env` and one Railway service. This buys Discord-side
scoping and audit clarity. It does **not** buy the property the team doctrine states — that a
compromised token cannot reach the others — because anything reading the environment gets both. The
Perch incident of 2026-08-01 was over-broad permissions on one identity, not a stolen token, and two
applications address that directly. Full process isolation defends a threat that has not
materialised, at a cost paid on every deploy.

**Splitting later stays cheap** because Roost lives entirely in `src/roost/` and shares no data with
the task code. Task Bot owns tasks and events; Roost owns member roles. Nothing crosses.

**No refactor of existing code.** The task code is not being moved into a parallel `bots/task/`
folder. Mixing a refactor into a feature makes the diff hard to review, and moving files later is
mechanical.

### Configuration

Five new keys, all added to the required list so the process refuses to start without them:

```
ROOST_TOKEN
ROOST_CLIENT_ID
WELCOME_CHANNEL_ID
MOD_LOG_CHANNEL_ID
NEIGHBOR_ROLE_ID
```

Failing fast on a misconfigured deploy is the behaviour `config.ts` already has, and the right one.

---

## Components

| Unit | Does | Depends on |
|---|---|---|
| `roost/client.ts` | Builds the client, logs in, runs the self-check, arms the handlers | discord.js, config |
| `roost/onMemberJoin.ts` | Assign `Neighbor` → restore markers → welcome → log | repository, welcome, modLog |
| `roost/onMemberLeave.ts` | Snapshot markers → log | repository, modLog |
| `roost/planJoinActions.ts` | Pure decision function | nothing |
| `roost/welcome.ts` | Builds welcome text | nothing — pure |
| `roost/modLog.ts` | One structured line per event | discord.js channel |
| `repositories/memberRoleRepository.ts` | `saveRoles`, `getRoles` | SQLite only |

Discord calls stay at the edges. The decisions sit in pure functions, the same split already used for
`parseDate` and `buildPoll`.

### Sticky roles restore from an allowlist, never from "whatever they had"

Roost restores only:

```
Builder · Connector · Voice
```

The obvious implementation — snapshot every role, hand them all back — is a privilege escalation.
Someone holds `Crew`, steps back from the team, loses `Crew`, later leaves, then rejoins, and the bot
silently restores Kick, Ban, and Manage Roles. No alert, and no audit entry that reads as suspicious.

`Crew`, bot roles, and any role added in future default to **not restored**. The list is explicit in
configuration and extending it is a deliberate act. `Neighbor` is not on the list because it is
granted unconditionally on every join.

**The allowlist stores role IDs, not names.** A rename — for instance `Voice` to `Explorer`, which
phase 2 proposes — must not silently empty the list. IDs survive renames; names do not.

This is the same shape as the Perch finding: the danger was never a stolen token, it was a permission
nobody decided to grant.

---

## Data flow

### Storage

```sql
CREATE TABLE IF NOT EXISTS member_roles (
  user_id  TEXT PRIMARY KEY,
  role_ids TEXT NOT NULL,   -- JSON array, allowlisted ids only
  left_at  TEXT NOT NULL
);
```

One row per person, overwritten on each departure. No history — restore needs only the last snapshot.
`db.ts` already uses `CREATE TABLE IF NOT EXISTS`, so this drops in beside `tasks` with no migration
machinery.

### On leave

```
guildMemberRemove
  → read the member's roles from cache
  → keep only allowlisted ids
  → UPSERT the row
  → log
```

**Always write the row, even when the filtered list is empty.** If a member loses `Builder` and later
leaves, skipping the write leaves the *old* snapshot in place — still containing `Builder`. They
rejoin and receive a role they no longer hold, with no trace of why. Writing an empty array
overwrites the stale snapshot.

### On join

```
guildMemberAdd
  → assign Neighbor            (access — always, unconditional)
  → restore allowlisted markers from the snapshot
  → post the welcome
  → log
```

`Neighbor` goes first because it grants View and Send. Everything after it is cosmetic, so a later
failure still leaves a usable server.

The row is **not** deleted after restore. The next departure overwrites it, and keeping it means a
partial failure is recoverable rather than erased.

Role assignment is **idempotent** in Discord — assigning a role someone already holds is a no-op.
That is what makes the dual-run safe.

### Reconciliation on startup — required, not optional

**Discord does not replay gateway events.** A join that happens while Roost is offline — a deploy, a
restart, a crash — is gone. No retry, no queue. The member sits with no permissions and nobody finds
out.

```
on ready
  → fetch the full member list
  → find anyone without Neighbor
  → assign it, restore markers, log each fix
```

On 46 members this runs in seconds. It converts a missed event from permanent to a delay of minutes,
makes the system self-healing across restarts, and catches anyone carl-bot missed historically. It is
what makes taking the server's front door in-house defensible.

---

## Error handling

Each step is wrapped independently. A failed welcome must not undo a successful role assignment.
Every failure writes to `#mod-log` with the member and the step that broke. **If `#mod-log` is itself
unreachable, fall back to `console.error`** — a logging failure must never break the operation it was
logging.

**The startup self-check is the important one.** Before arming any handler, Roost verifies:

1. Its highest role is **above** `Neighbor`
2. It holds **Manage Roles**
3. `#welcome`, `#mod-log`, and `NEIGHBOR_ROLE_ID` all resolve

If any check fails it logs loudly and **does not arm the handlers.** The alternative is the worst
failure mode in the design: a bot that looks healthy, accepts joins, and assigns nothing. The member
sees an empty server; the deploy shows green.

Other cases:

- A snapshot referencing a deleted role: skipped, logged once, not retried.
- A failed database write on leave: logged and accepted. That person loses their markers on rejoin.
  Blocking a departure on a disk write is worse.

---

## Testing

The real behaviour lives in gateway events, which cannot be exercised locally. So the decisions are
pulled out of the handlers:

```ts
planJoinActions({ storedRoleIds, currentRoleIds, allowlist, neighborId })
  → { rolesToAdd: string[] }
```

The handler becomes a thin adapter: read the Discord objects, call this, apply the result. The
interesting logic is then testable with no discord.js mocking.

**Covered:**

- `planJoinActions` — no snapshot; empty snapshot; a non-allowlisted role in the snapshot; a deleted
  role id; a member who already holds everything
- The leave filter, including the empty-write case
- `memberRoleRepository` — round trip, upsert overwrites, unknown user. Same temp-database pattern as
  `taskRepository.test.ts`
- The welcome text builder

**Not covered, deliberately:** gateway delivery, permission enforcement, hierarchy behaviour. **The
dual-run window is the test for those.**

---

## Migration

Prerequisites, all manual, all Waskar's:

1. Create the **Roost** application. Enable the **Server Members Intent** in the Developer Portal.
   Invite it with Manage Roles.
2. Drag the `Roost` role **above `Neighbor`**. Without this, assignment fails at runtime.
3. Add the five configuration keys to `.env` and to Railway.

Then:

4. Deploy with carl-bot's auto-role **still on**. Both bots assign `Neighbor`; the second is a no-op.
5. Watch `#mod-log` across real joins. Roost should log an assignment for every arrival.
6. Switch carl-bot's auto-role off once **Roost has logged a clean assignment for 10 consecutive real
   joins, and at least 21 days have passed.** Both conditions, not either. A vague exit criterion is
   how a dual-run becomes permanent — name the number now, while nobody is impatient.
7. Configure **Discord native AutoMod** to replace carl-bot's spam and link filtering.
8. Remove carl-bot once nothing depends on it.

There is no window in which a new member can be locked out, because carl-bot keeps working until
Roost has demonstrably taken over.

---

## Phase 2 — patch badges, decided but not built

**The model is Scouts, with two of its three layers.**

| Layer | Scouts | PhilaCon | Built? |
|---|---|---|---|
| Troop | Which group you belong to | Flock badge — Builder / Connector / Explorer. One per person, permanent | Exists as Discord roles |
| Merit badges | Collect what you like | Patch badges — one per event, earned by finishing the build | Phase 2 |
| Rank | Tenderfoot → Eagle | **Deferred** | No |

The rank ladder is deferred deliberately. It carries the highest operating cost — promotion logic,
per-person state, a policy on who authorises a promotion — and the least present value. Two events
have run. A ladder nobody has climbed reads as aspirational rather than earned. Nothing in phases 1
or 2 blocks adding it later.

**Discord has no badge feature**, so the collection needs somewhere to live. Decided:

- **The wall leads.** A read-only `#the-flock` channel. Roost posts one card per member and **edits
  it in place** forever after. Nothing scrolls away. It is the closest thing Discord offers to the
  exhibition named as the destination in `PATCH_SERIES.md`.
- **The auto-post triggers it.** On the night someone earns a patch, Roost posts the updated card to
  `#wins-and-work`. Nobody has to ask, and it points people at the wall on the one night they care
  most.
- **`/patches` stays** as the detail view.

Rejected: a Discord role per event (the role list grows without bound and every coloured role
competes with the house for the name colour), and physical-only (no record anyone can see online).

### Open, and blocking phase 2

- **`Builder` currently means three different things** — a workshop attendee in `channel-map.md`, an
  archetype in Brand Book §08, and a middle rung in `workshop-program.md`'s First Timer → Builder →
  Architect ladder. One layer keeps the name; the others need new ones.
- **`Voice` should be renamed `Explorer`** to match Brand Book §08, per the 2026-08-11 badge spec.
  Pending Waskar's call.
- **The order of `Builder` / `Connector` / `Voice` is unresolved and deliberately untouched.** Under
  the archetype model each person holds one, so colour precedence never fires and the order is
  decoration. Under an achievement model it decides which marker the room sees. Both roles have zero
  members today, so the change stays free until the model is settled.
- **`Builder`'s 32 members did not earn it at a workshop.** The badge spec records these as granted
  by hand off a join-date proxy. PATCH 002 drew about 24 people.

---

## Deferred, related, not part of this build

- Remove **Manage Events** from `Neighbor`; grant it to the Task Bot's own role; drop `Neighbor` from
  the Task Bot.
- Remove **Moderate Members** from Perch. It cannot use the permission at position 3, which is the
  only reason it has not mattered. Perch posts announcements.
- Identify **NoteCat**, or remove it.
- Turn on carl-bot's **sticky roles** as an interim measure. It is one toggle and it fixes the
  `Builder`/`Voice` erasure today, before Roost exists.
