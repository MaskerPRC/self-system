# 实现计划

## 功能一：精选页 Tab

### 数据层
- Supabase `interactive_pages` 表添加 `is_featured BOOLEAN DEFAULT false` 列
- 更新 `supabase/schema.sql`

### 后端 (control/server/index.js)
- `GET /api/pages/featured` — 获取当前精选页
- `POST /api/pages/:id/feature` — 设置精选（先取消已有精选，再设新的）
- `DELETE /api/pages/:id/feature` — 取消精选

### 前端
- **router/index.js** — 新增路由 `/featured` → `FeaturedView`
- **App.vue** — 底栏在「页面集合」和「AI 对话」之间插入「精选」Tab（星形图标）
- **FeaturedView.vue** — 新页面：
  - 有精选时：全屏 iframe 展示精选页
  - 无精选时：空状态提示「去页面集合中设置精选页」
- **CollectionView.vue / PageCard.vue** — 每张卡片增加「设为精选/取消精选」按钮（星形图标）

## 功能二：文件管理器（在页面集合页中）

### 后端 (control/server/index.js)
通过 `docker exec` 在 app 容器中操作文件系统：
- `GET /api/app/files?path=/` — 列出目录内容（ls -la，返回名称/类型/大小/时间）
- `GET /api/app/files/content?path=/xxx` — 读取文件内容（cat）
- `POST /api/app/files/upload` — 上传文件（multipart → docker cp 到容器）
- `DELETE /api/app/files?path=/xxx` — 删除文件/目录

路径限制：所有操作锁定在 `/app` 目录下，防止路径遍历攻击。

### 前端 (CollectionView.vue)
在页面集合页的卡片网格下方，新增「文件系统」区块：
- 面包屑导航显示当前路径
- 目录/文件列表（点击目录进入，点击文件查看内容）
- 文件内容弹窗（代码高亮展示）
- 上传按钮（选择文件后上传到当前目录）
- 删除按钮（确认后删除）
