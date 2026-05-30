import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DB_PATH = process.env.DB_PATH ?? './data/dashboard.db'

function openDatabase(): Database.Database {
  try {
    mkdirSync(dirname(DB_PATH), { recursive: true })
    const database = new Database(DB_PATH)
    database.pragma('journal_mode = WAL')
    return database
  } catch (e) {
    console.error(`[db] cannot open database at ${DB_PATH}: ${(e as Error).message}`)
    console.error('[db] is the data volume mounted and writable? (e.g. -v ./data:/data)')
    throw e
  }
}

export const db = openDatabase()

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    icon        TEXT,
    description TEXT,
    category    TEXT,
    sort_order  INTEGER DEFAULT 0,
    enabled     INTEGER DEFAULT 1,
    status      TEXT DEFAULT 'unknown',
    last_check  INTEGER,
    last_latency_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS checks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id TEXT NOT NULL,
    ts         INTEGER NOT NULL,
    status     TEXT NOT NULL,
    latency_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_checks_service_ts ON checks(service_id, ts);
  CREATE INDEX IF NOT EXISTS idx_checks_ts ON checks(ts);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS monitor_sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    ended_at     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_monitor_sessions_started ON monitor_sessions(started_at);
`)

// migrations for existing DBs
const cols = db.prepare("PRAGMA table_info(services)").all() as { name: string }[]
if (!cols.some((c) => c.name === 'last_latency_ms')) {
  db.exec('ALTER TABLE services ADD COLUMN last_latency_ms INTEGER')
}
if (!cols.some((c) => c.name === 'category')) {
  db.exec('ALTER TABLE services ADD COLUMN category TEXT')
}

// default settings
db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '7')",
).run()

export interface ServiceRow {
  id: string
  name: string
  url: string
  icon: string | null
  description: string | null
  category: string | null
  sort_order: number
  enabled: number
  status: 'online' | 'offline' | 'unknown'
  last_check: number | null
  last_latency_ms: number | null
}

export function getSetting(key: string): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}
