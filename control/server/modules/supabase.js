import { sqliteClient } from './sqlite.js';

console.log('[DB] 使用本地 SQLite 数据库');

export const supabase = null;

export function getSupabase() {
  return sqliteClient;
}
