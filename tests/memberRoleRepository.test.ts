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
