"""クイズアプリの API（FastAPI）。

問題と正解はサーバー側だけが持ち、画面（React）には正解を渡さない。
答え合わせは POST /api/answer でサーバーが行う。
問題は questions.json を編集すれば増やせる（コードの変更は不要）。
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATA_FILE = Path(__file__).with_name("questions.json")


def load_bank(path: Path = DATA_FILE) -> dict:
    """問題ファイルを読み込み、壊れていないかを確かめる。"""
    bank = json.loads(path.read_text(encoding="utf-8"))
    levels = bank["levels"]
    seen: set[str] = set()
    for q in bank["questions"]:
        if q["id"] in seen:
            raise ValueError(f"問題IDが重複しています: {q['id']}")
        seen.add(q["id"])
        if q["level"] not in levels:
            raise ValueError(f"{q['id']}: 未定義のレベル {q['level']}")
        if len(q["choices"]) < 2:
            raise ValueError(f"{q['id']}: 選択肢は2つ以上必要です")
        if not 0 <= q["answer"] < len(q["choices"]):
            raise ValueError(f"{q['id']}: 正解の番号が選択肢の範囲外です")
    return bank


BANK = load_bank()
BY_ID = {q["id"]: q for q in BANK["questions"]}

app = FastAPI(title="Quiz API", version="1.0.0")

# 開発時に別ポートの画面（Vite: 5173）から呼べるようにする
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class AnswerIn(BaseModel):
    question_id: str
    choice_id: int


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/levels")
def levels() -> list[dict]:
    """選べるレベルと、それぞれの問題数。"""
    out = []
    for key, meta in BANK["levels"].items():
        count = sum(1 for q in BANK["questions"] if q["level"] == key)
        out.append({"id": key, "label": meta["label"],
                    "description": meta["description"], "count": count})
    return out


@app.get("/api/quizzes")
def quizzes(
    level: str = Query(..., description="kids / adults"),
    limit: int = Query(5, ge=1, le=50),
    seed: int | None = Query(None, description="出題順を固定したいとき（テスト用）"),
) -> list[dict]:
    """問題を出す。正解と解説は含めない。問題の順番と選択肢の並びは毎回変わる。"""
    if level not in BANK["levels"]:
        raise HTTPException(404, f"レベル '{level}' はありません")
    rng = random.Random(seed)
    pool = [q for q in BANK["questions"] if q["level"] == level]
    rng.shuffle(pool)
    out = []
    for q in pool[:limit]:
        # choice_id は元の並びの番号。表示の順番だけを混ぜる
        choices = [{"id": i, "text": t} for i, t in enumerate(q["choices"])]
        rng.shuffle(choices)
        out.append({"id": q["id"], "category": q["category"],
                    "question": q["question"], "choices": choices})
    return out


@app.post("/api/answer")
def answer(body: AnswerIn) -> dict:
    """答え合わせ。正解・不正解と、正しい選択肢・解説を返す。"""
    q = BY_ID.get(body.question_id)
    if q is None:
        raise HTTPException(404, f"問題 '{body.question_id}' はありません")
    if not 0 <= body.choice_id < len(q["choices"]):
        raise HTTPException(422, "選択肢の番号が範囲外です")
    return {
        "correct": body.choice_id == q["answer"],
        "correct_choice_id": q["answer"],
        "explanation": q["explanation"],
    }
