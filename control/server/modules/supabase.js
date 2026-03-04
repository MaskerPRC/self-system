import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sqliteClient } from './sqlite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const isSupabaseConfigured = supabaseUrl && supabaseKey && supabaseUrl !== 'your_supabase_url_here';

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (isSupabaseConfigured) {
  console.log('[DB] 使用 Supabase 数据库');
} else {
  console.log('[DB] Supabase 未配置，使用本地 SQLite 数据库');
}

export function getSupabase() {
  if (supabase) return supabase;
  return sqliteClient;
}
