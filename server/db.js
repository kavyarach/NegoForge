import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../data/negoforge.db');

// Ensure parent dir exists if needed
import fs from 'fs';
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to NegoForge SQLite database at:', dbPath);
    initTables();
  }
});

function initTables() {
  db.serialize(() => {
    // 1. Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT,
        preferred_language TEXT DEFAULT 'en',
        theme TEXT DEFAULT 'dark',
        email_notifications INTEGER DEFAULT 1,
        is_verified INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // 2. Sessions Table (Durable persistence for negotiations)
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        scenario_id TEXT NOT NULL,
        scenario_title TEXT NOT NULL,
        mode TEXT NOT NULL,
        human_role TEXT,
        current_round INTEGER DEFAULT 1,
        current_agent_turn TEXT,
        status TEXT NOT NULL,
        deadlock_detected INTEGER DEFAULT 0,
        deadlock_reason TEXT,
        difficulty TEXT DEFAULT 'Medium',
        agent_configs_json TEXT,
        agent_stances_json TEXT,
        current_offer_json TEXT,
        previous_offer_json TEXT,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // 3. Reports Table
    db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT,
        scenario_id TEXT NOT NULL,
        status TEXT NOT NULL,
        rounds_taken INTEGER NOT NULL,
        agreement_term TEXT,
        final_price REAL,
        negotiation_score INTEGER,
        report_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `);

    // 4. Email Logs Table
    db.run(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        recipient_email TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        sent_at TEXT NOT NULL
      )
    `);
  });
}

/**
 * Promise-based DB query helpers
 */
export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
