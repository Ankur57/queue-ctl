import db from '../database/database.js';

class ConfigRepository {
  get(key) {
    const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
  }

  set(key, value) {
    const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
    stmt.run(key, value);
  }

  getAll() {
    const stmt = db.prepare('SELECT key, value FROM config');
    return stmt.all();
  }

  remove(key) {
    const stmt = db.prepare('DELETE FROM config WHERE key = ?');
    stmt.run(key);
  }
}

export default new ConfigRepository();
