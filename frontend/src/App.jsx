import { useEffect, useState } from "react";
import { getLevels, getQuizzes } from "./api.js";
import KidsQuestion from "./KidsQuestion.jsx";
import CodeQuestion from "./CodeQuestion.jsx";
import Result from "./Result.jsx";

const QUESTIONS_PER_ROUND = 5;

export default function App() {
  const [screen, setScreen] = useState("start"); // start | quiz | result
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(null); // { id, kind, ... }
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState([]); // 1問ごとの結果
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
      const qs = await getQuizzes(lv.id, QUESTIONS_PER_ROUND);
      setLevel(lv);
      setQuestions(qs);
      setIndex(0);
      setLog([]);
      setScreen("quiz");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onDone = (result) => {
    const q = questions[index];
    setLog((prev) => [...prev, { title: q.title, ...result }]);
    if (index + 1 < questions.length) setIndex(index + 1);
    else setScreen("result");
  };

  const kids = level?.kind === "choice";
  const q = questions[index];

  return (
    <div className={`app ${kids ? "kids" : ""}`}>
      <header className="bar">
        <h1>{kids ? "コード あなうめ クイズ" : "コード穴埋めクイズ"}</h1>
      </header>

      <main>
        {error && <p className="error" role="alert">{error}</p>}

        {screen === "start" && (
          <section className="start">
            <p className="lead">レベルを選んでスタート</p>
            <div className="levels">
              {levels.map((lv) => (
                <button key={lv.id} className={`level level-${lv.id}`} disabled={busy}
                        onClick={() => start(lv)}>
                  <span className="level-label">{lv.label}</span>
                  <span className="level-kind">{lv.kind === "choice" ? "えらんで ためす" : "自分で書く"}</span>
                  <span className="level-desc">{lv.description}</span>
                  <span className="level-count">全{lv.count}問から{Math.min(QUESTIONS_PER_ROUND, lv.count)}問</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {screen === "quiz" && q && (
          <>
            <div className="progress" aria-label={`${index + 1} / ${questions.length}`}>
              <div className="progress-fill" style={{ width: `${(index / questions.length) * 100}%` }} />
            </div>
            {q.kind === "choice" ? (
              <KidsQuestion key={q.id} q={q} index={index} total={questions.length} onDone={onDone} />
            ) : (
              <CodeQuestion key={q.id} q={q} index={index} total={questions.length} onDone={onDone} />
            )}
          </>
        )}

        {screen === "result" && (
          <Result kids={kids} log={log} onRetry={() => start(level)}
                  onHome={() => { setScreen("start"); setLevel(null); }} />
        )}
      </main>
    </div>
  );
}
