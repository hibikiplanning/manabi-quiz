"""コード穴埋めクイズの API（FastAPI）。

- こども（choice）: コードの □ に入るものを選ぶ。答え合わせは POST /api/answer
- おとな（code）  : 関数を自分で書く。ブラウザで実行した結果を POST /api/judge で判定

正解・テストの期待値・解答例はサーバーだけが持ち、出題時には画面へ渡さない。
ユーザーが書いたコードはサーバーでは一切実行しない（実行はブラウザ内の隔離された場所）。
問題は questions.json を編集すれば増やせる（コードの変更は不要）。
"""
from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATA_FILE = Path(__file__).with_name("questions.json")
SLOT = "□"


def load_bank(path: Path = DATA_FILE) -> dict:
    """問題ファイルを読み込み、壊れていないかを確かめる。壊れていれば起動しない。"""
    bank = json.loads(path.read_text(encoding="utf-8"))
    levels = bank["levels"]
    for key, meta in levels.items():
        if meta.get("kind") not in ("choice", "code"):
            raise ValueError(f"レベル {key}: kind は choice か code です")
    seen: set[str] = set()
    for q in bank["questions"]:
        qid = q["id"]
        if qid in seen:
            raise ValueError(f"問題IDが重複しています: {qid}")
        seen.add(qid)
        if q["level"] not in levels:
            raise ValueError(f"{qid}: 未定義のレベル {q['level']}")
        for field in ("title", "question", "template", "explanation"):
            if not str(q.get(field, "")).strip():
                raise ValueError(f"{qid}: {field} が空です")
        if levels[q["level"]]["kind"] == "choice":
            if q["template"].count(SLOT) != 1:
                raise ValueError(f"{qid}: template には {SLOT} をちょうど1つ入れてください")
            if len(q["choices"]) < 2:
                raise ValueError(f"{qid}: 選択肢は2つ以上必要です")
            if not 0 <= q["answer"] < len(q["choices"]):
                raise ValueError(f"{qid}: 正解の番号が選択肢の範囲外です")
            if not q.get("goal") or not q.get("hint"):
                raise ValueError(f"{qid}: goal（めざす結果）と hint が必要です")
        else:
            if f"function {q['func']}" not in q["template"]:
                raise ValueError(f"{qid}: template に function {q['func']} がありません")
            if not q["tests"] or any("input" not in t or "expected" not in t for t in q["tests"]):
                raise ValueError(f"{qid}: tests には input と expected が必要です")
            if not q.get("sample"):
                raise ValueError(f"{qid}: 解答例（sample）がありません")
    return bank


def same(a: Any, b: Any) -> bool:
    """JSON の値として同じか。Python の True == 1 を同じと見なさないよう、真偽値は厳密に比べる。"""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    return type(a) is type(b) and a == b


BANK = load_bank()
BY_ID = {q["id"]: q for q in BANK["questions"]}


def kind_of(q: dict) -> str:
    return BANK["levels"][q["level"]]["kind"]


app = FastAPI(title="Code Quiz API", version="2.0.0")

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


class CaseResult(BaseModel):
    value: Any = None          # 関数の返り値（JSON にできる値）
    error: str | None = None   # 実行中のエラー（あれば）


class JudgeIn(BaseModel):
    question_id: str
    results: list[CaseResult]


def get_question(qid: str, kind: str) -> dict:
    q = BY_ID.get(qid)
    if q is None:
        raise HTTPException(404, f"問題 '{qid}' はありません")
    if kind_of(q) != kind:
        raise HTTPException(400, f"問題 '{qid}' はこの答え方の問題ではありません")
    return q


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/levels")
def levels() -> list[dict]:
    """選べるレベルと、それぞれの問題数。"""
    return [
        {"id": key, "label": meta["label"], "kind": meta["kind"],
         "description": meta["description"],
         "count": sum(1 for q in BANK["questions"] if q["level"] == key)}
        for key, meta in BANK["levels"].items()
    ]


@app.get("/api/quizzes")
def quizzes(
    level: str = Query(..., description="kids / adults"),
    limit: int = Query(5, ge=1, le=50),
    seed: int | None = Query(None, description="出題順を固定したいとき（テスト用）"),
) -> list[dict]:
    """問題を出す。正解・期待値・解答例は含めない。問題の順番と選択肢の並びは毎回変わる。"""
    if level not in BANK["levels"]:
        raise HTTPException(404, f"レベル '{level}' はありません")
    rng = random.Random(seed)
    pool = [q for q in BANK["questions"] if q["level"] == level]
    rng.shuffle(pool)
    out = []
    for q in pool[:limit]:
        base = {"id": q["id"], "kind": kind_of(q), "title": q["title"],
                "question": q["question"], "template": q["template"]}
        if base["kind"] == "choice":
            # choice_id は元の並びの番号。表示の順番だけを混ぜる
            choices = [{"id": i, "text": t} for i, t in enumerate(q["choices"])]
            rng.shuffle(choices)
            base.update(choices=choices, goal=q["goal"], hint=q["hint"])
        else:
            base.update(func=q["func"], examples=q["examples"],
                        tests=[{"input": t["input"]} for t in q["tests"]])
        out.append(base)
    return out


@app.post("/api/answer")
def answer(body: AnswerIn) -> dict:
    """こども（選択式）の答え合わせ。"""
    q = get_question(body.question_id, "choice")
    if not 0 <= body.choice_id < len(q["choices"]):
        raise HTTPException(422, "選択肢の番号が範囲外です")
    return {
        "correct": body.choice_id == q["answer"],
        "correct_choice_id": q["answer"],
        "explanation": q["explanation"],
    }


@app.post("/api/judge")
def judge(body: JudgeIn) -> dict:
    """おとな（コード入力）の判定。ブラウザで実行した各テストの返り値を、期待値と比べる。"""
    q = get_question(body.question_id, "code")
    tests = q["tests"]
    if len(body.results) != len(tests):
        raise HTTPException(422, f"テストは {len(tests)} 件です（{len(body.results)} 件の結果が届きました）")
    cases = []
    for t, r in zip(tests, body.results):
        ok = r.error is None and same(r.value, t["expected"])
        cases.append({"input": t["input"], "expected": t["expected"],
                      "actual": r.value, "error": r.error, "pass": ok})
    passed = all(c["pass"] for c in cases)
    res = {"passed": passed, "cases": cases}
    if passed:
        res.update(explanation=q["explanation"], sample=q["sample"])
    return res


@app.get("/api/solution/{qid}")
def solution(qid: str) -> dict:
    """おとな: あきらめたときの解答例。"""
    q = get_question(qid, "code")
    return {"sample": q["sample"], "explanation": q["explanation"]}
