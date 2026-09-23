# まなびクイズ — React × Python API のクイズアプリ（見本）

大人・子ども向けの教材を想定した、4択クイズのWebアプリです。
画面は **React**、問題の出題と答え合わせは **Python（FastAPI）の API** が担当します。

## できること

- **レベルを選んでスタート**（こども／おとな）。1回5問、全問から毎回ランダムに出題
- **答えを選ぶと、その場で正解・不正解と解説**を表示。正しい選択肢は緑、選んだ誤答は赤
- **結果画面**で得点と、1問ずつの○×をふり返り。「もう一度」で別の組み合わせに挑戦
- **こども向けは、ひらがなの言葉づかい・大きな文字・オレンジ基調**に自動で切り替え
- キーボードだけでも遊べる（数字キー 1〜4 で回答、Enter で次へ）
- スマホ幅・ダークモードに対応

## つくりの要点

| 要点 | 理由 |
|---|---|
| **正解と解説はサーバー（API）だけが持つ** | 画面側のコードや通信を覗いても答えが分からない。答え合わせは `POST /api/answer` |
| **選択肢の並び順は毎回変わるが、答え合わせは元の番号（id）で行う** | 「正解はいつも1番」にならない。表示の順番と正誤判定を切り離している |
| **問題は `backend/questions.json` を書き換えるだけで増やせる** | 教材の作り手がコードに触れずに問題を追加・修正できる |
| **起動時に問題ファイルを検査する** | 正解番号の範囲外・ID の重複・未定義のレベルがあれば起動しない（壊れた問題を出さない） |
| **テスト 12 件**（`backend/test_app.py`） | 問題データの整合性と、API の動き（正解が漏れないこと・答え合わせ・入力の検査）を確認 |

```
[ブラウザ]  React（Vite）  ──  /api/*  ──▶  Python FastAPI  ──▶  questions.json
             画面・操作                    出題・答え合わせ        問題・正解・解説
```

## 動かし方

必要なもの: Python 3.10 以上、Node.js 20.19 以上（22 系なら 22.12 以上）

### 1. API（Python）

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   /  macOS・Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8787
```

`http://127.0.0.1:8787/docs` を開くと、API の説明と試し打ちの画面が出ます（FastAPI の自動ドキュメント）。

> ポートを 8787 にしているのは、Windows では 8000 番が予約されていて使えない環境があるためです。

### 2. 画面（React）

別のターミナルで:

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:5173` を開きます。開発中は `/api` への通信を Vite が 8787 番へ中継します（`vite.config.js`）。

### テスト

```bash
cd backend
python -m pytest -q
```

## API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/health` | 動作確認 |
| GET | `/api/levels` | レベルの一覧と問題数 |
| GET | `/api/quizzes?level=kids&limit=5` | 問題を出す（**正解・解説は含まない**）。`seed` を付けると出題順を固定できる |
| POST | `/api/answer` | `{"question_id": "k01", "choice_id": 2}` → 正誤・正しい選択肢・解説 |

## 問題の足し方

`backend/questions.json` の `questions` に1つ足すだけです。

```json
{
  "id": "k07",
  "level": "kids",
  "category": "さんすう",
  "question": "10 から 3 を ひくと？",
  "choices": ["5", "6", "7", "8"],
  "answer": 2,
  "explanation": "10 − 3 = 7 だよ。"
}
```

- `answer` は `choices` の **0 から数えた番号**（上の例では "7"）
- `level` を増やすときは、先頭の `levels` にも追加します
- 保存したら API を再起動。書き間違いがあれば、起動時にどの問題が壊れているかを表示して止まります

## 開発について

このアプリは **AI（Anthropic の Claude Code）を使って開発しました**。設計・実装・テストを AI が行い、人が画面で動作を確かめています。
問題の内容（事実関係）は、一般的な教科書レベルの知識の範囲で作成しています。実際の教材に使う場合は、対象学年に合わせて内容の確認をお願いします。
