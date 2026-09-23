"""API と問題データのテスト。  実行: python -m pytest -q"""
import json

import pytest
from fastapi.testclient import TestClient

import app as quiz

client = TestClient(quiz.app)


# ---- 問題データ ----------------------------------------------------------

def test_every_level_has_enough_questions():
    for level in quiz.BANK["levels"]:
        n = sum(1 for q in quiz.BANK["questions"] if q["level"] == level)
        assert n >= 5, f"{level} の問題が少なすぎます（{n}問）"


def test_every_question_has_explanation():
    for q in quiz.BANK["questions"]:
        assert q["explanation"].strip(), f"{q['id']} に解説がありません"


def test_broken_file_is_rejected(tmp_path):
    bad = {"levels": {"kids": {"label": "", "description": ""}},
           "questions": [{"id": "x", "level": "kids", "category": "", "question": "",
                          "choices": ["a", "b"], "answer": 5, "explanation": ""}]}
    f = tmp_path / "q.json"
    f.write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(ValueError):
        quiz.load_bank(f)


# ---- API ------------------------------------------------------------------

def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_levels_lists_counts():
    body = client.get("/api/levels").json()
    ids = {lv["id"] for lv in body}
    assert ids == {"kids", "adults"}
    assert all(lv["count"] >= 5 for lv in body)


def test_quizzes_never_leak_the_answer():
    for q in client.get("/api/quizzes", params={"level": "kids", "limit": 50}).json():
        assert "answer" not in q and "explanation" not in q
        assert all(set(c) == {"id", "text"} for c in q["choices"])


def test_quizzes_respect_limit_and_level():
    body = client.get("/api/quizzes", params={"level": "adults", "limit": 3}).json()
    assert len(body) == 3
    assert all(q["id"].startswith("a") for q in body)


def test_same_seed_gives_same_order():
    p = {"level": "kids", "limit": 5, "seed": 42}
    assert client.get("/api/quizzes", params=p).json() == client.get("/api/quizzes", params=p).json()


def test_unknown_level_is_404():
    assert client.get("/api/quizzes", params={"level": "expert"}).status_code == 404


def test_correct_answer_even_after_shuffle():
    # 表示順が混ざっても、元の番号（id）で答え合わせできること
    q = client.get("/api/quizzes", params={"level": "kids", "limit": 1, "seed": 7}).json()[0]
    truth = quiz.BY_ID[q["id"]]["answer"]
    r = client.post("/api/answer", json={"question_id": q["id"], "choice_id": truth}).json()
    assert r["correct"] is True and r["correct_choice_id"] == truth and r["explanation"]


def test_wrong_answer():
    q = quiz.BY_ID["a01"]
    wrong = (q["answer"] + 1) % len(q["choices"])
    r = client.post("/api/answer", json={"question_id": "a01", "choice_id": wrong}).json()
    assert r["correct"] is False and r["correct_choice_id"] == q["answer"]


def test_answer_validation():
    assert client.post("/api/answer", json={"question_id": "zzz", "choice_id": 0}).status_code == 404
    assert client.post("/api/answer", json={"question_id": "a01", "choice_id": 99}).status_code == 422
