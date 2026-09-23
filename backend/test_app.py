"""API と問題データのテスト。  実行: python -m pytest -q

問題の中身（こどもの正解で goal が出るか・おとなの解答例がテストに通るか）は
JavaScript で実際に動かして確かめる必要があるので、frontend 側の `npm run check` で検査する。
"""
import json

import pytest
from fastapi.testclient import TestClient

import app as quiz

client = TestClient(quiz.app)


def q_of(kind):
    return [q for q in quiz.BANK["questions"] if quiz.kind_of(q) == kind]


# ---- 問題データ ----------------------------------------------------------

def test_every_level_has_enough_questions():
    for level in quiz.BANK["levels"]:
        n = sum(1 for q in quiz.BANK["questions"] if q["level"] == level)
        assert n >= 5, f"{level} の問題が少なすぎます（{n}問）"


def test_broken_file_is_rejected(tmp_path):
    bad = {"levels": {"kids": {"label": "", "kind": "choice", "description": ""}},
           "questions": [{"id": "x", "level": "kids", "title": "t", "question": "q",
                          "template": "console.log(□)", "choices": ["a", "b"], "answer": 5,
                          "goal": "a", "hint": "h", "explanation": "e"}]}
    f = tmp_path / "q.json"
    f.write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(ValueError, match="範囲外"):
        quiz.load_bank(f)


def test_choice_template_needs_exactly_one_slot(tmp_path):
    bad = {"levels": {"kids": {"label": "", "kind": "choice", "description": ""}},
           "questions": [{"id": "x", "level": "kids", "title": "t", "question": "q",
                          "template": "console.log(1)", "choices": ["a", "b"], "answer": 0,
                          "goal": "a", "hint": "h", "explanation": "e"}]}
    f = tmp_path / "q.json"
    f.write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(ValueError, match="□"):
        quiz.load_bank(f)


# ---- 同じ値かどうか（判定の心臓部） ----------------------------------------

@pytest.mark.parametrize("a,b,want", [
    (6, 6.0, True),
    ([2, 4], [2, 4], True),
    ([2, 4], [4, 2], False),
    (True, 1, False),        # Python では True == 1 だが、JS の true と 1 は別物
    (False, 0, False),
    (None, 0, False),
    ("6", 6, False),
    ([1, [2, 3]], [1, [2, 3]], True),
])
def test_same(a, b, want):
    assert quiz.same(a, b) is want


# ---- API: 共通 --------------------------------------------------------------

def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_levels_have_kind_and_counts():
    body = {lv["id"]: lv for lv in client.get("/api/levels").json()}
    assert body["kids"]["kind"] == "choice" and body["adults"]["kind"] == "code"
    assert "経験者" in body["adults"]["label"]  # 「おとな」だけだと誰でも解けると誤解される
    assert all(lv["count"] >= 5 for lv in body.values())


def test_unknown_level_is_404():
    assert client.get("/api/quizzes", params={"level": "expert"}).status_code == 404


def test_same_seed_gives_same_order():
    p = {"level": "kids", "limit": 5, "seed": 42}
    assert client.get("/api/quizzes", params=p).json() == client.get("/api/quizzes", params=p).json()


# ---- API: こども（選択式） ---------------------------------------------------

def test_choice_quizzes_never_leak_the_answer():
    for q in client.get("/api/quizzes", params={"level": "kids", "limit": 50}).json():
        assert "answer" not in q and "explanation" not in q
        assert q["kind"] == "choice" and q["goal"] and q["hint"]
        assert all(set(c) == {"id", "text"} for c in q["choices"])


def test_choice_correct_even_after_shuffle():
    q = client.get("/api/quizzes", params={"level": "kids", "limit": 1, "seed": 7}).json()[0]
    truth = quiz.BY_ID[q["id"]]["answer"]
    r = client.post("/api/answer", json={"question_id": q["id"], "choice_id": truth}).json()
    assert r["correct"] is True and r["explanation"]


def test_choice_wrong_answer_does_not_reveal_the_answer():
    # まちがえたら、もう一度えらんで確かめてもらう。正解も解説も返さない
    q = quiz.BY_ID["k01"]
    wrong = (q["answer"] + 1) % len(q["choices"])
    r = client.post("/api/answer", json={"question_id": "k01", "choice_id": wrong}).json()
    assert r == {"correct": False}


def test_answer_validation():
    assert client.post("/api/answer", json={"question_id": "zzz", "choice_id": 0}).status_code == 404
    assert client.post("/api/answer", json={"question_id": "k01", "choice_id": 99}).status_code == 422
    # おとなの問題に選択式の答え方はできない
    assert client.post("/api/answer", json={"question_id": "a01", "choice_id": 0}).status_code == 400


# ---- API: おとな（コード入力） -----------------------------------------------

def test_code_quizzes_never_leak_expected_or_sample():
    for q in client.get("/api/quizzes", params={"level": "adults", "limit": 50}).json():
        assert q["kind"] == "code" and q["func"] and q["hint"]
        assert "sample" not in q and "explanation" not in q
        assert all(set(t) == {"input"} for t in q["tests"])


def expected_results(qid):
    return [{"value": t["expected"]} for t in quiz.BY_ID[qid]["tests"]]


def test_judge_all_pass_returns_sample():
    for q in q_of("code"):
        r = client.post("/api/judge", json={"question_id": q["id"], "results": expected_results(q["id"])}).json()
        assert r["passed"] is True, q["id"]
        assert r["sample"] and r["explanation"]


def test_judge_one_wrong_fails_and_hides_sample():
    results = expected_results("a01")
    results[1] = {"value": 999}
    r = client.post("/api/judge", json={"question_id": "a01", "results": results}).json()
    assert r["passed"] is False and "sample" not in r
    assert [c["pass"] for c in r["cases"]] == [True, False, True, True]


def test_judge_runtime_error_is_a_fail():
    results = expected_results("a01")
    results[0] = {"error": "TypeError: nums is not iterable"}
    r = client.post("/api/judge", json={"question_id": "a01", "results": results}).json()
    assert r["passed"] is False and r["cases"][0]["error"]


def test_judge_true_is_not_1():
    # isPalindrome が true の代わりに 1 を返したら不合格にする
    results = [{"value": 1 if t["expected"] is True else t["expected"]} for t in quiz.BY_ID["a06"]["tests"]]
    assert client.post("/api/judge", json={"question_id": "a06", "results": results}).json()["passed"] is False


def test_judge_validation():
    assert client.post("/api/judge", json={"question_id": "a01", "results": [{"value": 6}]}).status_code == 422
    assert client.post("/api/judge", json={"question_id": "k01", "results": []}).status_code == 400
    assert client.post("/api/judge", json={"question_id": "zzz", "results": []}).status_code == 404


def test_solution():
    r = client.get("/api/solution/a03").json()
    assert "function fizzbuzz" in r["sample"] and r["explanation"]
    assert client.get("/api/solution/k01").status_code == 400
