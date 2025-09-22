# KAKUTI
[日文](README.jp.md)|[English](README.en.md)
文档管理与阅读工具，支持上传 PDF/文本、工作区管理、全文搜索、下载；提供笔记与高亮、选中文本翻译、基于文档的问答（RAG）。后续将上线 Magic Wand 画线智能选区，快速对所选内容进行查询/解释/翻译/注释。

## 功能概览

- 文档上传：可挂到指定工作区，自动提取正文以便全文检索。
- 工作区管理：创建、重命名、删除；按工作区查看与管理文档。
- 阅读器：平滑缩放滚动、全文搜索、截图、文本高亮与注释。
- 翻译：对选中内容一键翻译（可配置 LLM 提供商或使用缓存）。
- AI 查询（RAG）：就当前文档或工作区范围进行问答，附来源引用。
- 删除与下载：可直接删除单个文档（库与文件），或下载原文件。
- 即将上线：Magic Wand 画线 → 自动选中"画线下方同页且水平范围重叠"的文本，弹出对话框选择 查询/解释/翻译/注释。

### 正在开发中的功能

- Magic Wand 智能选区进一步完善（更精准的选区、抓取表格与图片）
- 表格结构化识别与图片内容抓取
- 随身笔记 / 个人知识库能力

## 快速开始

### 🚀 自动化安装（推荐）

**Linux/macOS：**
```bash
bash scripts/dev.sh setup --env kakuti --ocr
bash scripts/dev.sh start --env kakuti
# 打开 http://localhost:5173
```

**Windows：**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 setup --env kakuti --ocr
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 start --env kakuti
# 打开 http://localhost:5173
```

**Docker（全栈）：**
```bash
bash scripts/docker-fullstack.sh build
export GEMINI_API_KEY="your-api-key"
bash scripts/docker-fullstack.sh start --port 8080
# 打开 http://localhost:8080
```

### 📖 完整安装指南

详细的安装选项、手动配置、高级设置和生产部署，请参见 **[INSTALLATION.md](INSTALLATION.md)**。

## 部署环境

必备环境：

- Python 3.11+（建议使用虚拟环境）
- Node.js 18+（建议 20+）
- SQLite（系统自带即可）

默认端口：

- 后端：`8001`
- 前端：`5173`

认证方式：

- 所有 API 默认需要请求头 `X-API-Key`（可在环境变量中关闭或修改）

## 后端启动（FastAPI）

1) 安装依赖

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

2) 配置环境（创建/编辑 `backend/.env`）

```env
REQUIRE_API_KEY=true
API_KEY=test-key
# 可选：选择 LLM 提供商
LLM_PROVIDER=gemini  # 或 openai|ollama
# 可选：LLM API Key
GEMINI_API_KEY=your-key
OPENAI_API_KEY=your-key
# 可选：自定义数据库路径（默认 backend/storage/docmind.db）
DOCMIND_DB=/absolute/or/relative/path/to/docmind.db
```

3) 运行服务

```bash
uvicorn app.main:app --reload --port 8001
```

## 前端启动（Vite + React）

```bash
cd web
npm install
npm run dev
# 打开浏览器访问 http://localhost:5173
```

前端默认将请求发送到 `http://localhost:8001/api/v1`，如需调整可在服务层修改或通过反向代理统一域名与端口。

## 默认存储路径

- 数据库：`backend/storage/docmind.db`（WAL 模式）
- 文档文件：`backend/storage/doc_files/{doc_id}.ext`
- 笔记文件：`backend/storage/note_files/{doc_id}.md`

## 基础用法

- 创建工作区：前端顶部工作区区块或调用 `POST /api/v1/workspaces`
- 上传文档：前端“Upload”或 `POST /api/v1/documents/upload`（可带 `workspace_id`）
- 阅读与搜索：在阅读器进行全文搜索、选择文本翻译、添加高亮与注释
- AI 查询：在阅读器发起问答（RAG），支持按文档或全局范围
- 删除文档：前端卡片的删除按钮或 `DELETE /api/v1/documents/{doc_id}`

## 常见问题

- 认证失败（401/403）
  - 确认前端请求带 `X-API-Key`，并与 `backend/.env` 的 `API_KEY` 一致。
- 数据库锁定/无法写入
  - 停止后端进程后再操作（WAL/SHM 文件需后端关闭后才能安全删除）。
- 删除后数据库文件仍然较大
  - SQLite 不会自动收缩：可执行收缩命令（停后端后）
  - `sqlite3 backend/storage/docmind.db "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"`
- 查错了数据库路径
  - 请确保使用 `backend/storage/docmind.db`（不是 `backend/docmind.db`）。

## 提示与约定

- 下载直链无法附带请求头，可在 URL 上使用 `?api_key=` 作为查询参数。
- 生产环境建议：
  - 自定义 DB 路径、限制 CORS 的来源域名、使用更强的 API Key；
  - 定期备份数据库与文档文件；
  - 如需外部公开，建议置于反向代理（HTTPS）之后。
