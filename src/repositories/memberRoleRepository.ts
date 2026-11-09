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
