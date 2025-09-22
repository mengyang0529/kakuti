# KAKUTI

[English](README.en.md) | [中文](README.cn.md)

ドキュメント管理と閲覧のツールです。PDF/テキストのアップロード、ワークスペースでの整理、全文検索、ダウンロードに対応。ノート・ハイライト、選択テキストの翻訳、ドキュメントに基づく AI 質問（RAG）も提供します。まもなく Magic Wand（線を引く→下のテキストを自動選択→ 検索/解説/翻訳/注釈）を追加予定です。

## 機能

- ドキュメントのアップロード：任意でワークスペースに紐付け。全文検索のため本文を自動抽出。
- ワークスペース：作成・名称変更・削除。ワークスペース単位で文書を閲覧・管理。
- ビューア：スムーズなズーム/スクロール、全文検索、スクリーンショット、テキストのハイライトと注釈。
- 翻訳：選択したテキストをワンクリック翻訳（LLM プロバイダの選択・キャッシュ対応）。
- AI 質問（RAG）：現在のドキュメントまたはワークスペース全体を対象に質問、出典を添えて回答。
- 削除・ダウンロード：単一のドキュメント（レコードとファイル）を削除、または元ファイルをダウンロード。
- 近日対応：Magic Wand の線 → 同一ページで線の下かつ水平に重なるテキストを自動選択 → アクションダイアログ（検索/解説/翻訳/注釈）。

### 開発中の機能

- Magic Wand のさらなる強化（精度向上、表や画像のキャプチャ対応）
- 表の構造化抽出・画像キャプチャ
- パーソナルノート / 個人ナレッジベース機能

## クイックスタート

### 🚀 自動セットアップ（推奨）

**Linux/macOS：**
```bash
bash scripts/dev.sh setup --env kakuti --ocr
bash scripts/dev.sh start --env kakuti
# http://localhost:5173 を開く
```

**Windows：**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 setup --env kakuti --ocr
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 start --env kakuti
# http://localhost:5173 を開く
```

**Docker（フルスタック）：**
```bash
bash scripts/docker-fullstack.sh build
export GEMINI_API_KEY="your-api-key"
bash scripts/docker-fullstack.sh start --port 8080
# http://localhost:8080 を開く
```

### 📖 完全インストールガイド

詳細なインストールオプション、手動セットアップ、高度な設定、プロダクション デプロイについては **[INSTALLATION.md](INSTALLATION.md)** を参照してください。

## デプロイ環境

要件：

- Python 3.11+（仮想環境推奨）
- Node.js 18+（20+ 推奨）
- SQLite（OS 標準で可）

デフォルトポート：

- バックエンド：`8001`
- フロントエンド：`5173`

認証：

- 既定で全 API が `X-API-Key` ヘッダを要求（環境変数で変更可）。

## バックエンド（FastAPI）

1) 依存関係のインストール

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

2) 環境設定（`backend/.env`）

```env
REQUIRE_API_KEY=true
API_KEY=test-key
# 任意：LLM プロバイダの選択
LLM_PROVIDER=gemini  # または openai|ollama
# 任意：LLM API キー
GEMINI_API_KEY=your-key
OPENAI_API_KEY=your-key
# 任意：DB パス（デフォルトは backend/storage/docmind.db）
DOCMIND_DB=/absolute/or/relative/path/to/docmind.db
```

3) サーバ起動

```bash
uvicorn app.main:app --reload --port 8001
```

## フロントエンド（Vite + React）

```bash
cd web
npm install
npm run dev
# http://localhost:5173 を開く
```

フロントエンドは既定で `http://localhost:8001/api/v1` にリクエストします。必要に応じてベース URL を変更するか、リバースプロキシを設定してください。

## 既定の保存パス

- データベース：`backend/storage/docmind.db`（WAL モード）
- ドキュメントファイル：`backend/storage/doc_files/{doc_id}.ext`
- ノートファイル：`backend/storage/note_files/{doc_id}.md`

## 基本的な使い方

- ワークスペース作成：UI から、または `POST /api/v1/workspaces`
- ドキュメントのアップロード：UI から、または `POST /api/v1/documents/upload`（`workspace_id` を付与可）
- 閲覧・検索：ビューアで全文検索、選択テキストの翻訳、ハイライト/注釈を追加
- AI 質問：ドキュメント単位または全体（RAG）で質問
- ドキュメント削除：UI の削除ボタン、または `DELETE /api/v1/documents/{doc_id}`

## トラブルシューティング

- 認証 401/403
  - リクエストに `X-API-Key` が含まれ、`backend/.env` の `API_KEY` と一致しているか確認。
- DB ロック/書き込み不可
  - 手動操作の前にバックエンドを停止（WAL/SHM ファイルの削除は停止後に実施）。
- 削除後も DB ファイルが大きい
  - SQLite は自動で縮小しません。以下で圧縮：
  - `sqlite3 backend/storage/docmind.db "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"`
- DB ファイルの取り違え
  - `backend/storage/docmind.db` を使用（`backend/docmind.db` ではありません）。

## 注意事項

- 直接ダウンロードのリンクはヘッダを送れないため、URL に `?api_key=` を付与してください。
- 本番環境の推奨：
  - DB パスのカスタマイズ、CORS の許可元制限、強固な API Key の設定。
  - DB とドキュメントファイルの定期バックアップ。
  - 可能ならリバースプロキシ（HTTPS）配下で運用。
