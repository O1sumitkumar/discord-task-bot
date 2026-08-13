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
