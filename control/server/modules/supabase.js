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
  // 启动时检测 canvas_nodes 类型约束和 canvas_edges 表
  setTimeout(async () => {
    try {
      // 检测 canvas_edges 表是否存在
      const { error: edgesError } = await supabase.from('canvas_edges').select('id').limit(1);
      if (edgesError && edgesError.message.includes('does not exist')) {
        console.warn('[DB] ⚠️  canvas_edges 表不存在，请在 Supabase SQL Editor 执行以下迁移：');
        console.warn(`
  CREATE TABLE canvas_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_node_id UUID NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    from_port_id TEXT NOT NULL,
    to_node_id UUID NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    to_port_id TEXT NOT NULL,
    edge_type TEXT NOT NULL CHECK (edge_type IN ('data', 'control')),
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE INDEX idx_canvas_edges_project ON canvas_edges(project_id);
  CREATE INDEX idx_canvas_edges_from ON canvas_edges(from_node_id);
  CREATE INDEX idx_canvas_edges_to ON canvas_edges(to_node_id);
        `);
      }
      // 检测 canvas_nodes 类型约束是否支持新类型
      const testId = '00000000-0000-0000-0000-000000000000';
      const { error: typeError } = await supabase.from('canvas_nodes').insert({
        id: testId, project_id: testId, type: 'text-input', content: {}
      });
      if (typeError) {
        if (typeError.message.includes('check') || typeError.message.includes('violates')) {
          console.warn('[DB] ⚠️  canvas_nodes 类型约束需要更新，请在 Supabase SQL Editor 执行：');
          console.warn(`
  ALTER TABLE canvas_nodes DROP CONSTRAINT canvas_nodes_type_check;
          `);
        }
        // 清理测试记录（可能因为 FK 约束插入也失败了，忽略即可）
      } else {
        // 测试插入成功，清理
        await supabase.from('canvas_nodes').delete().eq('id', testId);
      }
    } catch (e) {
      // 检测失败不阻塞启动
    }
  }, 2000);
} else {
  console.log('[DB] Supabase 未配置，使用本地 SQLite 数据库');
}

export function getSupabase() {
  if (supabase) return supabase;
  return sqliteClient;
}
