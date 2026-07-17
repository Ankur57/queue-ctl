import Database from "better-sqlite3";
import { config } from "../config/config.js";

const db = new Database(config.DATABASE_NAME);

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    state TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at INTEGER,
    locked_by TEXT,
    locked_at INTEGER,
    output TEXT,
    error TEXT,
    exit_code INTEGER,
    created_at INTEGER,
    updated_at INTEGER
);
`);

export default db;
