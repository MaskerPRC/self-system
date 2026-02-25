import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your_supabase_url_here') {
  console.warn('[Supabase] 警告: SUPABASE_URL 或 SUPABASE_ANON_KEY 未配置');
}

export const supabase = (supabaseUrl && supabaseKey && supabaseUrl !== 'your_supabase_url_here')
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase 未配置，请在根目录 .env 中设置 SUPABASE_URL 和 SUPABASE_ANON_KEY');
  }
  return supabase;
}
