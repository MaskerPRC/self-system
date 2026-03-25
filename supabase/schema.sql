-- 对话
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '新对话',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 对话消息
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 交互页面
CREATE TABLE interactive_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  route_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'building')),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_pages_conversation ON interactive_pages(conversation_id);
CREATE INDEX idx_pages_status ON interactive_pages(status);

-- 系统设置
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 画板项目
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '未命名项目',
  description TEXT,
  canvas_state JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 画板节点
CREATE TABLE canvas_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION NOT NULL DEFAULT 200,
  height DOUBLE PRECISION NOT NULL DEFAULT 150,
  z_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_canvas_nodes_project ON canvas_nodes(project_id);

-- 画板连线
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
