import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const dbPath = process.env.DATABASE_URL?.replace("sqlite:", "") || "./data.db";
const dbDir = dbPath.substring(0, dbPath.lastIndexOf("/"));

if (dbDir && !existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    shop TEXT NOT NULL,
    state TEXT NOT NULL,
    is_online INTEGER DEFAULT 0,
    scope TEXT,
    expires TEXT,
    access_token TEXT,
    user_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS merchants (
    shop TEXT PRIMARY KEY,
    printavo_api_key TEXT,
    sync_enabled INTEGER DEFAULT 1,
    skip_gift_cards INTEGER DEFAULT 1,
    skip_non_physical INTEGER DEFAULT 1,
    excluded_tags TEXT DEFAULT '',
    billing_status TEXT DEFAULT 'pending',
    billing_subscription_id TEXT,
    trial_ends_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop TEXT NOT NULL,
    order_id TEXT,
    order_name TEXT,
    status TEXT NOT NULL,
    message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop) REFERENCES merchants(shop)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_shop ON sessions(shop);
  CREATE INDEX IF NOT EXISTS idx_activity_shop ON activity_logs(shop);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
`);

export { db };


