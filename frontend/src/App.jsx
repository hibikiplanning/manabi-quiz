import { useCallback, useEffect, useState } from "react";
import { getLevels, getQuizzes, postAnswer } from "./api.js";

// レベルごとの言葉づかい（こども向けは ひらがな）
const WORDS = {
  kids: {
    pick: "こたえを えらんでね",
    correct: "せいかい！",
    wrong: "ざんねん…",
    next: "つぎへ",
    toResult: "けっかを みる",
    score: (s, n) => `${n}もんちゅう ${s}もん せいかい`,
    retry: "もういちど",
    home: "さいしょに もどる",
    praise: ["よく がんばったね！", "すごい！", "ぜんもん せいかい！ てんさい！"],
  },
  adults: {
    pick: "答えを選んでください",
    correct: "正解！",
    wrong: "不正解",
    next: "次へ",
    toResult: "結果を見る",
    score: (s, n) => `${n}問中 ${s}問 正解`,
    retry: "もう一度",
    home: "最初に戻る",
    praise: ["おつかれさまでした。", "いい調子です！", "全問正解です！"],
  },
};

const QUESTIONS_PER_ROUND = 5;

export default function App() {
  const [screen, setScreen] = useState("start"); // start | quiz | result
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null); // 選んだ choice id
  const [feedback, setFeedback] = useState(null); // APIの答え合わせ結果
  const [log, setLog] = useState([]); // { question, correct }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getLevels()
      .then(setLevels)
      .catch(() => setError("APIに接続できません。backend を起動してください（README参照）。"));
  }, []);

  const start = async (lv) => {
    setBusy(true);
    setError("");
    try {
      const qs = await getQuizzes(lv, QUESTIONS_PER_ROUND);
      setLevel(lv);
      setQuestions(qs);
      setIndex(0);
      setPicked(null);
      setFeedback(null);
      setLog([]);
      setScreen("quiz");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const choose = useCallback(
    async (choiceId) => {
      if (feedback || busy) return;
      const q = questions[index];
      setPicked(choiceId);
      setBusy(true);
      try {
        const r = await postAnswer(q.id, choiceId);
        setFeedback(r);
        setLog((prev) => [...prev, { question: q.question, correct: r.correct }]);
      } catch (e) {
        setError(e.message);
        setPicked(null);
      } finally {
        setBusy(false);
      }
    },
    [feedback, busy, questions, index]
  );

  const next = useCallback(() => {
    if (!feedback) return;
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPicked(null);
      setFeedback(null);
    } else {
      setScreen("result");
    }
  }, [feedback, index, questions.length]);

  // キーボード: 1〜4 で選ぶ、Enter で次へ
  useEffect(() => {
    if (screen !== "quiz") return;
    const onKey = (e) => {
      const q = questions[index];
      const n = Number(e.key);
      if (!feedback && n >= 1 && n <= q.choices.length) choose(q.choices[n - 1].id);
      // ボタンにフォーカスがあるときは、ボタン自身の Enter に任せる（二重に進まないように）
      if (feedback && e.key === "Enter" && e.target.tagName !== "BUTTON") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, questions, index, feedback, choose, next]);

  const w = WORDS[level] ?? WORDS.adults;

  return (
    <div className={`app ${level === "kids" ? "kids" : ""}`}>
      <header className="bar">
        <h1>まなびクイズ</h1>
      </header>

      <main>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {screen === "start" && (
          <section className="start">
            <p className="lead">レベルを選んでスタート</p>
            <div className="levels">
              {levels.map((lv) => (
                <button key={lv.id} className={`level level-${lv.id}`} disabled={busy}
                        onClick={() => start(lv.id)}>
                  <span className="level-label">{lv.label}</span>
                  <span className="level-desc">{lv.description}</span>
                  <span className="level-count">全{lv.count}問から{Math.min(QUESTIONS_PER_ROUND, lv.count)}問</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {screen === "quiz" && questions[index] && (
          <QuizCard
            q={questions[index]}
            index={index}
            total={questions.length}
            picked={picked}
            feedback={feedback}
            busy={busy}
            words={w}
            onChoose={choose}
            onNext={next}
          />
        )}

        {screen === "result" && (
          <Result log={log} words={w} onRetry={() => start(level)}
                  onHome={() => { setScreen("start"); setLevel(null); }} />
        )}
      </main>
    </div>
  );
}

function QuizCard({ q, index, total, picked, feedback, busy, words, onChoose, onNext }) {
  const last = index + 1 === total;
  return (
    <section className="card">
      <div className="progress" aria-label={`${index + 1} / ${total}`}>
        <div className="progress-fill" style={{ width: `${((index + (feedback ? 1 : 0)) / total) * 100}%` }} />
      </div>
      <p className="meta">
        <span className="tag">{q.category}</span>
        <span>{index + 1} / {total}</span>
      </p>
      <h2 className="question">{q.question}</h2>
      {!feedback && <p className="hint">{words.pick}（キー 1〜{q.choices.length}）</p>}

      <ol className="choices">
        {q.choices.map((c, i) => {
          let state = "";
          if (feedback) {
            if (c.id === feedback.correct_choice_id) state = "is-correct";
            else if (c.id === picked) state = "is-wrong";
            else state = "is-dim";
          }
          return (
            <li key={c.id}>
              <button className={`choice ${state}`} disabled={!!feedback || busy}
                      onClick={() => onChoose(c.id)}>
                <span className="num">{i + 1}</span>
                {c.text}
              </button>
            </li>
          );
        })}
      </ol>

      <div aria-live="polite">
        {feedback && (
          <div className={`feedback ${feedback.correct ? "ok" : "ng"}`}>
            <p className="verdict">{feedback.correct ? words.correct : words.wrong}</p>
            <p className="explain">{feedback.explanation}</p>
            <button className="primary" onClick={onNext} autoFocus>
              {last ? words.toResult : words.next}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Result({ log, words, onRetry, onHome }) {
  const score = log.filter((r) => r.correct).length;
  const rate = log.length ? score / log.length : 0;
  const praise = rate === 1 ? words.praise[2] : rate >= 0.6 ? words.praise[1] : words.praise[0];
  return (
    <section className="card result">
      <p className="score">{words.score(score, log.length)}</p>
      <p className="praise">{praise}</p>
      <ul className="review">
        {log.map((r, i) => (
          <li key={i} className={r.correct ? "ok" : "ng"}>
            <span className="mark">{r.correct ? "○" : "×"}</span>
            {r.question}
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="primary" onClick={onRetry}>{words.retry}</button>
        <button onClick={onHome}>{words.home}</button>
      </div>
    </section>
  );
}
