# Roost Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Roost, a second Discord application in this repo, that replaces carl-bot's auto-role,
welcome, sticky-roles, and mod-log functions.

**Architecture:** One Node process, two `discord.js` `Client` instances on two tokens, sharing one
SQLite handle. Discord calls stay at the edges (`roost/onMemberJoin.ts`, `roost/onMemberLeave.ts`,
`roost/client.ts`); decisions are pure functions (`roost/planJoinActions.ts`,
`roost/planLeaveActions.ts`, `roost/welcome.ts`) tested with no discord.js mocking, matching the split
already used by `lib/parseDate.ts` and `lib/poll.ts`.

**Tech Stack:** TypeScript, discord.js v14, better-sqlite3, vitest. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-08-12-roost-membership-bot-design.md` — read it for the
"why" behind each decision below. This plan only covers Phase 1 (auto-role, welcome, sticky roles,
mod-log). Phase 2 (patch badges) is out of scope.

---

### Task 1: Config — extend for Roost

**Files:**
- Modify: `src/config.ts`
- Test: `tests/config.test.ts`
- Modify: `.env.example`

**Step 1: Write the failing test**

Add to `tests/config.test.ts`, inside the existing `describe('loadConfig')` block:

```ts
  it('returns Roost fields when all variables are present', () => {
    const config = loadConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
      GUILD_ID: 'guild',
      TASKS_CHANNEL_ID: 'channel',
      DB_PATH: './data/tasks.db',
      ROOST_TOKEN: 'roost-token',
      ROOST_CLIENT_ID: 'roost-client',
      WELCOME_CHANNEL_ID: 'welcome-channel',
      MOD_LOG_CHANNEL_ID: 'mod-log-channel',
      NEIGHBOR_ROLE_ID: 'neighbor-role',
    } as NodeJS.ProcessEnv);

    expect(config.roostToken).toBe('roost-token');
    expect(config.roostClientId).toBe('roost-client');
    expect(config.welcomeChannelId).toBe('welcome-channel');
    expect(config.modLogChannelId).toBe('mod-log-channel');
    expect(config.neighborRoleId).toBe('neighbor-role');
  });
```

Also update the existing "throws listing only the missing variables" test — it will now fail for a
different reason (more required keys), so extend its input to include the new Roost keys and assert
only the task-bot keys are reported missing:

```ts
  it('throws listing only the missing variables', () => {
    expect(() =>
      loadConfig({
        DISCORD_TOKEN: 'x',
        GUILD_ID: 'y',
        ROOST_TOKEN: 'r',
        ROOST_CLIENT_ID: 'r',
        WELCOME_CHANNEL_ID: 'r',
        MOD_LOG_CHANNEL_ID: 'r',
        NEIGHBOR_ROLE_ID: 'r',
      } as NodeJS.ProcessEnv)
    ).toThrow(/DISCORD_CLIENT_ID, TASKS_CHANNEL_ID, DB_PATH/);
  });
```

And extend the "returns a populated config" test's input object with the five new env vars (same
values pattern) so it keeps passing once the keys become required.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `config.roostToken` is `undefined`, and the "missing variables" test fails because
the new keys are not yet required (so they wouldn't appear in the thrown message either way — the
real signal is the new field assertions failing).

**Step 3: Write minimal implementation**

Replace `src/config.ts` with:

```ts
export interface Config {
  discordToken: string;
  discordClientId: string;
  guildId: string;
  tasksChannelId: string;
  dbPath: string;
  roostToken: string;
  roostClientId: string;
  welcomeChannelId: string;
  modLogChannelId: string;
  neighborRoleId: string;
}

const REQUIRED_KEYS = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'GUILD_ID',
  'TASKS_CHANNEL_ID',
  'DB_PATH',
  'ROOST_TOKEN',
  'ROOST_CLIENT_ID',
  'WELCOME_CHANNEL_ID',
  'MOD_LOG_CHANNEL_ID',
  'NEIGHBOR_ROLE_ID',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    discordToken: env.DISCORD_TOKEN!,
    discordClientId: env.DISCORD_CLIENT_ID!,
    guildId: env.GUILD_ID!,
    tasksChannelId: env.TASKS_CHANNEL_ID!,
    dbPath: env.DB_PATH!,
    roostToken: env.ROOST_TOKEN!,
    roostClientId: env.ROOST_CLIENT_ID!,
    welcomeChannelId: env.WELCOME_CHANNEL_ID!,
    modLogChannelId: env.MOD_LOG_CHANNEL_ID!,
    neighborRoleId: env.NEIGHBOR_ROLE_ID!,
  };
}
```

Update `.env.example` to add the five new keys:

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
GUILD_ID=
TASKS_CHANNEL_ID=
DB_PATH=./data/tasks.db
ROOST_TOKEN=
ROOST_CLIENT_ID=
WELCOME_CHANNEL_ID=
MOD_LOG_CHANNEL_ID=
NEIGHBOR_ROLE_ID=
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS, all cases.

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts .env.example
git commit -m "feat(roost): add Roost configuration keys"
```

---

### Task 2: Database — add the member_roles table

**Files:**
- Modify: `src/db.ts`

**Step 1: Write the implementation**

`db.ts` has no dedicated test file — its behavior is exercised through repository tests (Task 3). Add
the table to the existing `initDb` function in `src/db.ts`, inside the same `db.exec` call or as a
second one:

```ts
import Database from 'better-sqlite3';

export function initDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      assignee_id TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      reminded_day_before INTEGER NOT NULL DEFAULT 0,
      reminded_due_date INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_roles (
      user_id TEXT PRIMARY KEY,
      role_ids TEXT NOT NULL,
      left_at TEXT NOT NULL
    )
  `);
  return db;
}
```

**Step 2: Verify**

This has no direct test; Task 3's repository tests exercise it. No commit yet — fold into Task 3's
commit so the table and its only consumer land together.

---

### Task 3: `memberRoleRepository` — sticky-role storage

**Files:**
- Create: `src/repositories/memberRoleRepository.ts`
- Test: `tests/memberRoleRepository.test.ts`

**Step 1: Write the failing test**

Create `tests/memberRoleRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { initDb } from '../src/db';
import { saveRoles, getRoles } from '../src/repositories/memberRoleRepository';

describe('memberRoleRepository', () => {
  let db: Database;

  beforeEach(() => {
    db = initDb(':memory:');
  });

  it('returns an empty array for a user with no snapshot', () => {
    expect(getRoles(db, 'user-1')).toEqual([]);
  });

  it('round-trips a saved snapshot', () => {
    saveRoles(db, 'user-1', ['role-a', 'role-b']);
    expect(getRoles(db, 'user-1')).toEqual(['role-a', 'role-b']);
  });

  it('upsert overwrites the previous snapshot instead of adding a row', () => {
    saveRoles(db, 'user-1', ['role-a']);
    saveRoles(db, 'user-1', ['role-b']);

    expect(getRoles(db, 'user-1')).toEqual(['role-b']);
  });

  it('overwrites a stale snapshot with an empty array', () => {
    saveRoles(db, 'user-1', ['role-a']);
    saveRoles(db, 'user-1', []);

    expect(getRoles(db, 'user-1')).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/memberRoleRepository.test.ts`
Expected: FAIL — `../src/repositories/memberRoleRepository` does not exist.

**Step 3: Write minimal implementation**

Create `src/repositories/memberRoleRepository.ts`:

```ts
import type { Database } from 'better-sqlite3';

interface MemberRoleRow {
  role_ids: string;
}

export function saveRoles(db: Database, userId: string, roleIds: string[]): void {
  const leftAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO member_roles (user_id, role_ids, left_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET role_ids = excluded.role_ids, left_at = excluded.left_at`
  ).run(userId, JSON.stringify(roleIds), leftAt);
}

export function getRoles(db: Database, userId: string): string[] {
  const row = db.prepare('SELECT role_ids FROM member_roles WHERE user_id = ?').get(userId) as
    | MemberRoleRow
    | undefined;
  return row ? JSON.parse(row.role_ids) : [];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/memberRoleRepository.test.ts`
Expected: PASS, all 4 cases.

**Step 5: Commit**

```bash
git add src/db.ts src/repositories/memberRoleRepository.ts tests/memberRoleRepository.test.ts
git commit -m "feat(roost): add member_roles table and repository"
```

---

### Task 4: `planJoinActions` — pure join decision

**Files:**
- Create: `src/roost/planJoinActions.ts`
- Test: `tests/roost/planJoinActions.test.ts`

**Step 1: Write the failing test**

Create `tests/roost/planJoinActions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planJoinActions } from '../../src/roost/planJoinActions';

const allowlist = ['builder', 'connector', 'voice'];
const neighborId = 'neighbor';

describe('planJoinActions', () => {
  it('always adds Neighbor for a member who does not have it', () => {
    const result = planJoinActions({
      storedRoleIds: [],
      currentRoleIds: [],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual(['neighbor']);
  });

  it('does not re-add Neighbor if the member already holds it', () => {
    const result = planJoinActions({
      storedRoleIds: [],
      currentRoleIds: [neighborId],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual([]);
  });

  it('restores an allowlisted role from the snapshot', () => {
    const result = planJoinActions({
      storedRoleIds: ['builder'],
      currentRoleIds: [neighborId],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual(['builder']);
  });

  it('does not restore a role that is not on the allowlist', () => {
    const result = planJoinActions({
      storedRoleIds: ['crew'],
      currentRoleIds: [neighborId],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual([]);
  });

  it('does not re-add a stored role the member already holds', () => {
    const result = planJoinActions({
      storedRoleIds: ['builder'],
      currentRoleIds: [neighborId, 'builder'],
      allowlist,
      neighborId,
    });

    expect(result.rolesToAdd).toEqual([]);
  });

  it('includes a stored role even if it no longer exists as a live Discord role — the handler catches that failure', () => {
    const result = planJoinActions({
      storedRoleIds: ['deleted-role'],
      currentRoleIds: [neighborId],
      allowlist: ['deleted-role'],
      neighborId,
    });

    expect(result.rolesToAdd).toEqual(['deleted-role']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/roost/planJoinActions.test.ts`
Expected: FAIL — `../../src/roost/planJoinActions` does not exist.

**Step 3: Write minimal implementation**

Create `src/roost/planJoinActions.ts`:

```ts
export interface PlanJoinActionsInput {
  storedRoleIds: string[];
  currentRoleIds: string[];
  allowlist: string[];
  neighborId: string;
}

export interface PlanJoinActionsResult {
  rolesToAdd: string[];
}

export function planJoinActions(input: PlanJoinActionsInput): PlanJoinActionsResult {
  const rolesToAdd = new Set<string>();

  if (!input.currentRoleIds.includes(input.neighborId)) {
    rolesToAdd.add(input.neighborId);
  }

  for (const roleId of input.storedRoleIds) {
    if (input.allowlist.includes(roleId) && !input.currentRoleIds.includes(roleId)) {
      rolesToAdd.add(roleId);
    }
  }

  return { rolesToAdd: Array.from(rolesToAdd) };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/roost/planJoinActions.test.ts`
Expected: PASS, all 6 cases.

**Step 5: Commit**

```bash
git add src/roost/planJoinActions.ts tests/roost/planJoinActions.test.ts
git commit -m "feat(roost): add planJoinActions pure decision function"
```

---

### Task 5: `planLeaveActions` — pure leave filter

**Files:**
- Create: `src/roost/planLeaveActions.ts`
- Test: `tests/roost/planLeaveActions.test.ts`

**Step 1: Write the failing test**

Create `tests/roost/planLeaveActions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planLeaveActions } from '../../src/roost/planLeaveActions';

const allowlist = ['builder', 'connector', 'voice'];

describe('planLeaveActions', () => {
  it('keeps only allowlisted roles', () => {
    const result = planLeaveActions(['builder', 'crew', 'neighbor'], allowlist);
    expect(result).toEqual(['builder']);
  });

  it('returns an empty array when the member holds no allowlisted role', () => {
    const result = planLeaveActions(['crew', 'neighbor'], allowlist);
    expect(result).toEqual([]);
  });

  it('returns an empty array for a member with no roles', () => {
    const result = planLeaveActions([], allowlist);
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/roost/planLeaveActions.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Write minimal implementation**

Create `src/roost/planLeaveActions.ts`:

```ts
export function planLeaveActions(currentRoleIds: string[], allowlist: string[]): string[] {
  return currentRoleIds.filter((roleId) => allowlist.includes(roleId));
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/roost/planLeaveActions.test.ts`
Expected: PASS, all 3 cases.

**Note on the empty-write case:** this function returning `[]` is not itself "the empty-write case" —
that's a caller behavior (Task 7 always calls `saveRoles` with whatever this returns, never skipping
the write). This test only proves the filter is correct; Task 7 proves the write always happens.

**Step 5: Commit**

```bash
git add src/roost/planLeaveActions.ts tests/roost/planLeaveActions.test.ts
git commit -m "feat(roost): add planLeaveActions pure decision function"
```

---

### Task 6: `welcome` — pure message builder

**Files:**
- Create: `src/roost/welcome.ts`
- Test: `tests/roost/welcome.test.ts`

**Step 1: Write the failing test**

Create `tests/roost/welcome.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildWelcomeMessage } from '../../src/roost/welcome';

describe('buildWelcomeMessage', () => {
  it('mentions the joining member', () => {
    const message = buildWelcomeMessage('user-1');
    expect(message).toContain('<@user-1>');
  });

  it('mentions PhilaCon Valley', () => {
    const message = buildWelcomeMessage('user-1');
    expect(message).toContain('PhilaCon Valley');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/roost/welcome.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Write minimal implementation**

Create `src/roost/welcome.ts`. Waskar should review and edit this copy before the first real deploy —
the two assertions above are the only contract the rest of the system depends on.

```ts
export function buildWelcomeMessage(userId: string): string {
  return `Welcome to PhilaCon Valley, <@${userId}>! Say hello and tell us what you're building.`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/roost/welcome.test.ts`
Expected: PASS, both cases.

**Step 5: Commit**

```bash
git add src/roost/welcome.ts tests/roost/welcome.test.ts
git commit -m "feat(roost): add welcome message builder"
```

---

### Task 7: `modLog` — structured logging to `#mod-log`

**Files:**
- Create: `src/roost/modLog.ts`
- Test: `tests/roost/modLog.test.ts`

**Step 1: Write the failing test**

Create `tests/roost/modLog.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { logToModLog } from '../../src/roost/modLog';

describe('logToModLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the message to the channel when the channel is reachable', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await logToModLog({ send }, 'Joined: <@user-1>');
    expect(send).toHaveBeenCalledWith('Joined: <@user-1>');
  });

  it('falls back to console.error when there is no channel', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await logToModLog(null, 'Joined: <@user-1>');
    expect(errorSpy).toHaveBeenCalledWith('[mod-log]', 'Joined: <@user-1>');
  });

  it('falls back to console.error when send() throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error('channel gone'));
    await logToModLog({ send }, 'Joined: <@user-1>');
    expect(errorSpy).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/roost/modLog.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Write minimal implementation**

Create `src/roost/modLog.ts`. It depends only on a minimal shape, not the full discord.js channel
type, so it stays as easy to test as it is here — that's why `LoggableChannel` is a narrow interface,
not `TextBasedChannel`.

```ts
export interface LoggableChannel {
  send: (message: string) => Promise<unknown>;
}

export async function logToModLog(
  channel: LoggableChannel | null | undefined,
  message: string
): Promise<void> {
  if (!channel) {
    console.error('[mod-log]', message);
    return;
  }

  try {
    await channel.send(message);
  } catch (error) {
    console.error('[mod-log] failed to send, falling back to console:', message, error);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/roost/modLog.test.ts`
Expected: PASS, all 3 cases.

**Step 5: Commit**

```bash
git add src/roost/modLog.ts tests/roost/modLog.test.ts
git commit -m "feat(roost): add mod-log writer with console fallback"
```

---

### Task 8: `onMemberJoin` and `onMemberLeave` — thin Discord adapters

These wrap the pure functions from Tasks 4–6 with real discord.js objects. Per the design spec,
gateway delivery and permission enforcement are **not** unit tested — the dual-run window is the test
for those. These adapters stay thin on purpose so almost all the logic already has coverage.

**Files:**
- Create: `src/roost/onMemberJoin.ts`
- Create: `src/roost/onMemberLeave.ts`

**Step 1: Write `onMemberJoin.ts`**

```ts
import type { GuildMember, TextBasedChannel } from 'discord.js';
import type { Database } from 'better-sqlite3';
import { planJoinActions } from './planJoinActions';
import { getRoles } from '../repositories/memberRoleRepository';
import { buildWelcomeMessage } from './welcome';
import { logToModLog, type LoggableChannel } from './modLog';

export interface OnMemberJoinDeps {
  db: Database;
  neighborId: string;
  allowlist: string[];
  welcomeChannel: TextBasedChannel | null;
  modLogChannel: LoggableChannel | null;
}

export async function onMemberJoin(member: GuildMember, deps: OnMemberJoinDeps): Promise<void> {
  const storedRoleIds = getRoles(deps.db, member.id);
  const currentRoleIds = [...member.roles.cache.keys()];
  const { rolesToAdd } = planJoinActions({
    storedRoleIds,
    currentRoleIds,
    allowlist: deps.allowlist,
    neighborId: deps.neighborId,
  });

  for (const roleId of rolesToAdd) {
    try {
      await member.roles.add(roleId);
    } catch (error) {
      await logToModLog(
        deps.modLogChannel,
        `Failed to assign role ${roleId} to <@${member.id}> on join: ${error}`
      );
    }
  }

  try {
    if (deps.welcomeChannel && 'send' in deps.welcomeChannel) {
      await deps.welcomeChannel.send(buildWelcomeMessage(member.id));
    }
  } catch (error) {
    await logToModLog(deps.modLogChannel, `Failed to post welcome for <@${member.id}>: ${error}`);
  }

  await logToModLog(
    deps.modLogChannel,
    `Joined: <@${member.id}> — assigned [${rolesToAdd.join(', ') || 'none'}]`
  );
}
```

**Step 2: Write `onMemberLeave.ts`**

```ts
import type { GuildMember } from 'discord.js';
import type { Database } from 'better-sqlite3';
import { planLeaveActions } from './planLeaveActions';
import { saveRoles } from '../repositories/memberRoleRepository';
import { logToModLog, type LoggableChannel } from './modLog';

export interface OnMemberLeaveDeps {
  db: Database;
  allowlist: string[];
  modLogChannel: LoggableChannel | null;
}

export async function onMemberLeave(member: GuildMember, deps: OnMemberLeaveDeps): Promise<void> {
  const currentRoleIds = [...member.roles.cache.keys()];
  const rolesToStore = planLeaveActions(currentRoleIds, deps.allowlist);

  try {
    // Always write, even when rolesToStore is empty — see
    // docs/superpowers/specs/2026-08-12-roost-membership-bot-design.md, "On leave".
    // Skipping the write on an empty list leaves a stale, wrong snapshot in place.
    saveRoles(deps.db, member.id, rolesToStore);
  } catch (error) {
    console.error(`Failed to save role snapshot for <@${member.id}> on leave:`, error);
  }

  await logToModLog(
    deps.modLogChannel,
    `Left: <@${member.id}> — stored [${rolesToStore.join(', ') || 'none'}]`
  );
}
```

**Step 3: No new automated test for this task**

The spec explicitly scopes gateway delivery, permission enforcement, and hierarchy behavior out of
unit test coverage (see "Testing" in the design doc). Both functions above are thin enough that their
only untested surface is the discord.js calls themselves.

**Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 5: Commit**

```bash
git add src/roost/onMemberJoin.ts src/roost/onMemberLeave.ts
git commit -m "feat(roost): add onMemberJoin and onMemberLeave adapters"
```

---

### Task 9: `roost/client.ts` — self-check, reconciliation, handler arming

This is the highest-risk file in the build: per the design doc, a bot that "looks healthy, accepts
joins, and assigns nothing" is the worst failure mode. Read that section again before writing this
file — the ordering (self-check → reconciliation → arm handlers) is deliberate, not incidental.

**Files:**
- Create: `src/roost/client.ts`

**Step 1: Write the implementation**

```ts
import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Guild,
  type TextBasedChannel,
} from 'discord.js';
import type { Database } from 'better-sqlite3';
import type { Config } from '../config';
import { onMemberJoin } from './onMemberJoin';
import { onMemberLeave } from './onMemberLeave';
import { logToModLog } from './modLog';

// Sticky roles restore only from this allowlist — never "whatever they had".
// See "Sticky roles restore from an allowlist, never from 'whatever they had'"
// in the design doc for why Crew and bot roles must never be added here.
const STICKY_ROLE_ALLOWLIST_NAMES = ['Builder', 'Connector', 'Voice'];

async function resolveAllowlistIds(guild: Guild): Promise<string[]> {
  const roles = await guild.roles.fetch();
  return roles
    .filter((role) => STICKY_ROLE_ALLOWLIST_NAMES.includes(role.name))
    .map((role) => role.id);
}

async function runSelfCheck(
  guild: Guild,
  config: Config
): Promise<{ ok: true; welcomeChannel: TextBasedChannel; modLogChannel: TextBasedChannel } | { ok: false }> {
  const me = guild.members.me;
  if (!me) {
    console.error('[roost] self-check failed: not a member of the guild');
    return { ok: false };
  }

  const neighborRole = await guild.roles.fetch(config.neighborRoleId);
  if (!neighborRole) {
    console.error('[roost] self-check failed: NEIGHBOR_ROLE_ID does not resolve');
    return { ok: false };
  }

  if (me.roles.highest.position <= neighborRole.position) {
    console.error('[roost] self-check failed: Roost role is not above Neighbor');
    return { ok: false };
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.error('[roost] self-check failed: missing Manage Roles');
    return { ok: false };
  }

  const welcomeChannel = await guild.channels.fetch(config.welcomeChannelId);
  const modLogChannel = await guild.channels.fetch(config.modLogChannelId);
  if (!welcomeChannel || !welcomeChannel.isTextBased()) {
    console.error('[roost] self-check failed: WELCOME_CHANNEL_ID does not resolve to a text channel');
    return { ok: false };
  }
  if (!modLogChannel || !modLogChannel.isTextBased()) {
    console.error('[roost] self-check failed: MOD_LOG_CHANNEL_ID does not resolve to a text channel');
    return { ok: false };
  }

  return { ok: true, welcomeChannel, modLogChannel };
}

async function reconcile(
  guild: Guild,
  db: Database,
  config: Config,
  allowlist: string[],
  modLogChannel: TextBasedChannel
): Promise<void> {
  // Discord does not replay gateway events. A join missed while Roost was offline
  // (deploy, restart, crash) is gone with no retry — so on every boot we sweep the
  // full member list and fix anyone missing Neighbor. See "Reconciliation on
  // startup — required, not optional" in the design doc.
  const members = await guild.members.fetch();
  const missingNeighbor = members.filter((member) => !member.roles.cache.has(config.neighborRoleId));

  for (const member of missingNeighbor.values()) {
    await onMemberJoin(member, {
      db,
      neighborId: config.neighborRoleId,
      allowlist,
      welcomeChannel: null, // reconciliation fixes access silently; it does not re-welcome
      modLogChannel,
    });
  }

  if (missingNeighbor.size > 0) {
    await logToModLog(modLogChannel, `Reconciliation: fixed ${missingNeighbor.size} member(s) missing Neighbor`);
  }
}

export function createRoostClient(db: Database, config: Config): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once('ready', async () => {
    console.log(`[roost] Logged in as ${client.user?.tag}`);

    const guild = await client.guilds.fetch(config.guildId);
    const check = await runSelfCheck(guild, config);
    if (!check.ok) {
      console.error('[roost] self-check failed — handlers NOT armed. Roost will not assign roles.');
      return;
    }

    const allowlist = await resolveAllowlistIds(guild);
    await reconcile(guild, db, config, allowlist, check.modLogChannel);

    client.on('guildMemberAdd', (member) => {
      onMemberJoin(member, {
        db,
        neighborId: config.neighborRoleId,
        allowlist,
        welcomeChannel: check.welcomeChannel,
        modLogChannel: check.modLogChannel,
      }).catch((error) => console.error('[roost] onMemberJoin failed', error));
    });

    client.on('guildMemberRemove', (member) => {
      if (!('roles' in member)) return; // PartialGuildMember lacks role data; nothing to snapshot
      onMemberLeave(member, {
        db,
        allowlist,
        modLogChannel: check.modLogChannel,
      }).catch((error) => console.error('[roost] onMemberLeave failed', error));
    });

    console.log('[roost] self-check passed — handlers armed');
  });

  return client;
}
```

**Step 2: No automated test for this task**

Self-check and reconciliation require a live guild; per the design doc's testing section this is
deliberately left to the dual-run, not unit tests.

**Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `GuildMember` vs `PartialGuildMember` typing on `guildMemberRemove` complains,
narrow with the `'roles' in member` guard already in the code above — do not cast with `as`.

**Step 4: Commit**

```bash
git add src/roost/client.ts
git commit -m "feat(roost): add Roost client with self-check and startup reconciliation"
```

---

### Task 10: Wire Roost into `index.ts`

**Files:**
- Modify: `src/index.ts`

**Step 1: Write the implementation**

Add the Roost client alongside the existing Task Bot client. Both share the one `db` handle already
created. This is additive — nothing about the existing Task Bot client, its commands, or its intents
changes.

```ts
import { Client, GatewayIntentBits, Collection, ChatInputCommandInteraction } from 'discord.js';
import type { Database } from 'better-sqlite3';
import dotenv from 'dotenv';
import { loadConfig } from './config';
import { initDb } from './db';
import * as taskCommand from './commands/task';
import * as eventCommand from './commands/event';
import * as pollCommand from './commands/poll';
import { startReminderJob } from './reminderJob';
import { createRoostClient } from './roost/client';

// override: true so this repo's .env wins over anything already exported by the
// shell. A global DISCORD_TOKEN in ~/.zshrc (Perch's) otherwise shadows it
// silently, and the bot authenticates as the wrong application.
dotenv.config({ override: true });

const config = loadConfig();
const db = initDb(config.dbPath);

interface Command {
  data: { name: string };
  execute: (interaction: ChatInputCommandInteraction, db: Database) => Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(taskCommand.data.name, {
  data: taskCommand.data,
  execute: (interaction, db) => taskCommand.execute(interaction, db),
});
commands.set(eventCommand.data.name, {
  data: eventCommand.data,
  execute: (interaction) => eventCommand.execute(interaction),
});
commands.set(pollCommand.data.name, {
  data: pollCommand.data,
  execute: (interaction) => pollCommand.execute(interaction),
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
  startReminderJob(client, db, config.tasksChannelId);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, db);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}`, error);
    const errorReply = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorReply);
    } else {
      await interaction.reply(errorReply);
    }
  }
});

client.login(config.discordToken);

const roostClient = createRoostClient(db, config);
roostClient.login(config.roostToken);
```

**Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

**Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every test added in Tasks 1–7.

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(roost): boot Roost client alongside the Task Bot client"
```

---

### Task 11: Manual migration steps (Waskar, not code)

Not a coding task — recorded here so the plan matches the design doc's "Migration" section. Do this
after Task 10 lands and before flipping any Discord-side switch:

1. Create the **Roost** application in the Discord Developer Portal. Enable **Server Members Intent**.
   Invite it to the guild with **Manage Roles**.
2. Drag the `Roost` role **above `Neighbor`** in Server Settings → Roles. Assignment fails at runtime
   without this — the self-check in Task 9 refuses to arm handlers until it's true.
3. Add the five new keys (`ROOST_TOKEN`, `ROOST_CLIENT_ID`, `WELCOME_CHANNEL_ID`, `MOD_LOG_CHANNEL_ID`,
   `NEIGHBOR_ROLE_ID`) to `.env` locally and to the Railway service.
4. Deploy with carl-bot's auto-role **still on**. Watch `#mod-log` across real joins — Roost should log
   a clean assignment for every arrival.
5. Switch carl-bot's auto-role off only once Roost has logged **10 consecutive clean joins AND at
   least 21 days have passed.** Both conditions.
6. Configure Discord's native AutoMod to replace carl-bot's spam/link filtering.
7. Remove carl-bot once nothing depends on it.

---

## Verification checklist (run after Task 10)

```bash
npm test          # all unit tests pass
npx tsc --noEmit   # no type errors
```

No `lint:fix` script exists in this repo's `package.json` — skip it; do not invent one.
