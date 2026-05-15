import { db } from "./db";
import { DEFAULT_SETTINGS, Settings } from "./types";

export function getSettings(): Settings {
  const rows = db()
    .prepare<[], { key: string; value: string }>(
      `SELECT key, value FROM settings`,
    )
    .all();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out as unknown as Settings;
}

export function saveSettings(patch: Partial<Settings>) {
  const stmt = db().prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const tx = db().transaction((p: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(p)) {
      stmt.run(k, JSON.stringify(v));
    }
  });
  tx(patch as Record<string, unknown>);
  return getSettings();
}
