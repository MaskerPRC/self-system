/**
 * SQLite 客户端 —— 模拟 Supabase JS 客户端的链式 API
 * 当未配置 Supabase 时作为本地数据库使用
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../../data');
const DB_PATH = resolve(DATA_DIR, 'local.db');

// 确保 data 目录存在
mkdirSync(DATA_DIR, { recursive: true });

const db = Database(DB_PATH);

// 启用 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ==================== 建表 ====================

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '新对话',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    attachments TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS interactive_pages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    route_path TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'building')),
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_public INTEGER NOT NULL DEFAULT 0,
    last_heartbeat TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_pages_conversation ON interactive_pages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_pages_status ON interactive_pages(status);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '未命名项目',
    description TEXT,
    canvas_state TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS canvas_nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('text','image','file','iframe','request','text-input','number-input','button','image-viewer')),
    content TEXT NOT NULL DEFAULT '{}',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    width REAL NOT NULL DEFAULT 200,
    height REAL NOT NULL DEFAULT 150,
    z_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_canvas_nodes_project ON canvas_nodes(project_id);

  CREATE TABLE IF NOT EXISTS canvas_edges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    from_port_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    to_port_id TEXT NOT NULL,
    edge_type TEXT NOT NULL CHECK (edge_type IN ('data', 'control')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_canvas_edges_project ON canvas_edges(project_id);
  CREATE INDEX IF NOT EXISTS idx_canvas_edges_from ON canvas_edges(from_node_id);
  CREATE INDEX IF NOT EXISTS idx_canvas_edges_to ON canvas_edges(to_node_id);
`);

// ==================== 迁移：更新 canvas_nodes 类型约束 ====================
// SQLite 不支持 ALTER CHECK，需要重建表来支持新的节点类型
try {
  // 检查是否需要迁移：读取表 DDL 来判断是否包含新类型
  const tableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='canvas_nodes'`).get();
  const needsMigration = tableInfo && tableInfo.sql && !tableInfo.sql.includes('text-input');
  if (needsMigration) {
    // CHECK 约束不支持新类型，需要重建表
    console.log('[SQLite] Migrating canvas_nodes table to support new node types...');
    // 先删除引用 canvas_nodes 的 canvas_edges 表（如果存在）
    db.exec(`DROP TABLE IF EXISTS canvas_edges`);
    db.exec(`
      CREATE TABLE canvas_nodes_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('text','image','file','iframe','request','text-input','number-input','button','image-viewer')),
        content TEXT NOT NULL DEFAULT '{}',
        x REAL NOT NULL DEFAULT 0,
        y REAL NOT NULL DEFAULT 0,
        width REAL NOT NULL DEFAULT 200,
        height REAL NOT NULL DEFAULT 150,
        z_index INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO canvas_nodes_new SELECT * FROM canvas_nodes;
      DROP TABLE canvas_nodes;
      ALTER TABLE canvas_nodes_new RENAME TO canvas_nodes;
      CREATE INDEX IF NOT EXISTS idx_canvas_nodes_project ON canvas_nodes(project_id);
    `);
    // 重新创建 canvas_edges 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS canvas_edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        from_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        from_port_id TEXT NOT NULL,
        to_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
        to_port_id TEXT NOT NULL,
        edge_type TEXT NOT NULL CHECK (edge_type IN ('data', 'control')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_canvas_edges_project ON canvas_edges(project_id);
      CREATE INDEX IF NOT EXISTS idx_canvas_edges_from ON canvas_edges(from_node_id);
      CREATE INDEX IF NOT EXISTS idx_canvas_edges_to ON canvas_edges(to_node_id);
    `);
    console.log('[SQLite] Migration complete.');
  }
} catch (e) {
  console.error('[SQLite] Migration check error:', e.message);
}

// ==================== 辅助函数 ====================

/** 解析 Supabase 风格的 select 字符串，检测关联查询 */
function parseSelect(selectStr) {
  if (!selectStr || selectStr === '*') return { columns: ['*'], joins: [] };

  const joins = [];
  // 匹配 "conversations(title)" 这种关联查询语法
  const joinRegex = /(\w+)\(([^)]+)\)/g;
  let cleaned = selectStr;
  let match;

  while ((match = joinRegex.exec(selectStr)) !== null) {
    joins.push({ table: match[1], columns: match[2].split(',').map(c => c.trim()) });
    cleaned = cleaned.replace(match[0], '');
  }

  const columns = cleaned.split(',').map(c => c.trim()).filter(Boolean);
  if (columns.length === 0) columns.push('*');

  return { columns, joins };
}

/** 将 SQLite 行的 boolean 整数转换为 JS boolean，并解析 JSON 字段 */
function transformRow(row, tableName) {
  if (!row) return row;
  const result = { ...row };

  // boolean 字段转换
  if (tableName === 'interactive_pages') {
    if ('is_featured' in result) result.is_featured = !!result.is_featured;
    if ('is_public' in result) result.is_public = !!result.is_public;
  }

  // JSON 字段解析
  if ('attachments' in result && typeof result.attachments === 'string') {
    try { result.attachments = JSON.parse(result.attachments); } catch { /* keep as string */ }
  }
  if (tableName === 'canvas_nodes' && 'content' in result && typeof result.content === 'string') {
    try { result.content = JSON.parse(result.content); } catch { /* keep as string */ }
  }
  if (tableName === 'projects' && 'canvas_state' in result && typeof result.canvas_state === 'string') {
    try { result.canvas_state = JSON.parse(result.canvas_state); } catch { /* keep as string */ }
  }

  return result;
}

/** 将 JS boolean 转为 SQLite 整数 */
function transformValueForInsert(key, value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if ((key === 'attachments' || key === 'content' || key === 'canvas_state') && typeof value === 'object') return JSON.stringify(value);
  return value;
}

// ==================== 查询构建器 ====================

class QueryBuilder {
  constructor(tableName) {
    this._table = tableName;
    this._operation = null; // 'select' | 'insert' | 'update' | 'delete'
    this._selectStr = '*';
    this._insertData = null;
    this._updateData = null;
    this._conditions = [];
    this._orderBy = [];
    this._limitVal = null;
    this._single = false;
    this._maybeSingle = false;
    this._returnData = false; // .select() after insert/update
  }

  select(columns) {
    if (this._operation === 'insert' || this._operation === 'update') {
      // .insert().select() 或 .update().select() → 返回修改的数据
      this._returnData = true;
      return this;
    }
    this._operation = 'select';
    this._selectStr = columns || '*';
    return this;
  }

  insert(data) {
    this._operation = 'insert';
    this._insertData = data;
    return this;
  }

  update(data) {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  delete() {
    this._operation = 'delete';
    return this;
  }

  eq(column, value) {
    this._conditions.push({ column, op: '=', value });
    return this;
  }

  neq(column, value) {
    this._conditions.push({ column, op: '!=', value });
    return this;
  }

  lt(column, value) {
    this._conditions.push({ column, op: '<', value });
    return this;
  }

  order(column, options = {}) {
    const dir = options.ascending === false ? 'DESC' : 'ASC';
    this._orderBy.push(`${this._table}.${column} ${dir}`);
    return this;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }

  single() {
    this._single = true;
    this._limitVal = 1;
    return this;
  }

  maybeSingle() {
    this._maybeSingle = true;
    this._limitVal = 1;
    return this;
  }

  /** 执行查询（实现 thenable，支持 await） */
  then(resolve, reject) {
    try {
      const result = this._execute();
      resolve(result);
    } catch (e) {
      if (reject) reject(e);
      else resolve({ data: null, error: { message: e.message } });
    }
  }

  _execute() {
    switch (this._operation) {
      case 'select': return this._execSelect();
      case 'insert': return this._execInsert();
      case 'update': return this._execUpdate();
      case 'delete': return this._execDelete();
      default: return { data: null, error: { message: 'No operation specified' } };
    }
  }

  _buildWhere() {
    if (this._conditions.length === 0) return { clause: '', params: [] };
    const parts = [];
    const params = [];
    for (const cond of this._conditions) {
      parts.push(`${this._table}.${cond.column} ${cond.op} ?`);
      // SQLite 不支持绑定 boolean，转为整数
      const val = typeof cond.value === 'boolean' ? (cond.value ? 1 : 0) : cond.value;
      params.push(val);
    }
    return { clause: `WHERE ${parts.join(' AND ')}`, params };
  }

  _execSelect() {
    const { columns, joins } = parseSelect(this._selectStr);
    const { clause: where, params } = this._buildWhere();

    let selectCols = '';
    let joinClause = '';

    if (joins.length > 0) {
      // 构建 JOIN 查询
      const mainCols = columns.includes('*') ? `${this._table}.*` : columns.map(c => `${this._table}.${c}`).join(', ');
      const joinParts = [];
      const joinColParts = [];

      for (const join of joins) {
        // 确定外键关系
        const fk = `${this._table}.${join.table.replace(/s$/, '')}_id`;
        joinParts.push(`LEFT JOIN ${join.table} ON ${fk} = ${join.table}.id`);
        // 嵌套对象列名，用 __join__ 前缀标记
        for (const col of join.columns) {
          joinColParts.push(`${join.table}.${col} AS "__join__${join.table}__${col}"`);
        }
      }

      selectCols = [mainCols, ...joinColParts].join(', ');
      joinClause = joinParts.join(' ');
    } else {
      selectCols = columns.includes('*') ? '*' : columns.join(', ');
    }

    let sql = `SELECT ${selectCols} FROM ${this._table} ${joinClause} ${where}`;

    if (this._orderBy.length > 0) {
      sql += ` ORDER BY ${this._orderBy.join(', ')}`;
    }

    if (this._limitVal !== null) {
      sql += ` LIMIT ${this._limitVal}`;
    }

    const rows = db.prepare(sql).all(...params);

    // 后处理：转换 boolean / JSON，重构嵌套对象
    const data = rows.map(row => {
      const result = {};
      const nested = {};

      for (const [key, value] of Object.entries(row)) {
        if (key.startsWith('__join__')) {
          const parts = key.replace('__join__', '').split('__');
          const joinTable = parts[0];
          const joinCol = parts[1];
          if (!nested[joinTable]) nested[joinTable] = {};
          nested[joinTable][joinCol] = value;
        } else {
          result[key] = value;
        }
      }

      // 将嵌套对象合并到结果中（模拟 Supabase PostgREST 关联结果）
      for (const [table, obj] of Object.entries(nested)) {
        // 如果所有值都是 null，说明没有关联记录
        const allNull = Object.values(obj).every(v => v === null);
        result[table] = allNull ? null : obj;
      }

      return transformRow(result, this._table);
    });

    if (this._single) {
      if (data.length === 0) return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
      return { data: data[0], error: null };
    }

    if (this._maybeSingle) {
      return { data: data.length > 0 ? data[0] : null, error: null };
    }

    return { data, error: null };
  }

  _execInsert() {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record = { id, ...this._insertData };

    // 添加默认时间戳
    if (!record.created_at) record.created_at = now;
    if (this._table === 'conversations' || this._table === 'interactive_pages' || this._table === 'projects' || this._table === 'canvas_nodes') {
      if (!record.updated_at) record.updated_at = now;
    }

    // 转换值
    const keys = Object.keys(record);
    const values = keys.map(k => transformValueForInsert(k, record[k]));
    const placeholders = keys.map(() => '?').join(', ');

    const sql = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES (${placeholders})`;
    db.prepare(sql).run(...values);

    if (this._returnData) {
      // 读回刚插入的记录
      const row = db.prepare(`SELECT * FROM ${this._table} WHERE id = ?`).get(id);
      const data = transformRow(row, this._table);
      if (this._single) return { data, error: null };
      return { data: [data], error: null };
    }

    return { data: null, error: null };
  }

  _execUpdate() {
    const { clause: where, params: whereParams } = this._buildWhere();

    const entries = Object.entries(this._updateData);
    const setClauses = entries.map(([k]) => `${k} = ?`).join(', ');
    const setValues = entries.map(([k, v]) => transformValueForInsert(k, v));

    const sql = `UPDATE ${this._table} SET ${setClauses} ${where}`;
    db.prepare(sql).run(...setValues, ...whereParams);

    if (this._returnData) {
      // 返回更新后的记录
      if (this._conditions.length > 0) {
        const selectSql = `SELECT * FROM ${this._table} ${where}`;
        const rows = db.prepare(selectSql).all(...whereParams);
        const data = rows.map(r => transformRow(r, this._table));
        if (this._single) return { data: data[0] || null, error: null };
        return { data, error: null };
      }
    }

    return { data: null, error: null };
  }

  _execDelete() {
    const { clause: where, params } = this._buildWhere();
    const sql = `DELETE FROM ${this._table} ${where}`;
    db.prepare(sql).run(...params);
    return { data: null, error: null };
  }
}

// ==================== SQLite 客户端（模拟 Supabase 客户端） ====================

class SqliteClient {
  from(table) {
    return new QueryBuilder(table);
  }
}

export const sqliteClient = new SqliteClient();
export { db as sqliteDb };
export default sqliteClient;
