import { useEffect, useRef, useState } from "react";
import { postAnswer } from "./api.js";
import { explainError, runProgram } from "./runner.js";

const SLOT = "□";

/** ためした数が少ないほど ★ が多い。考えてから答えると ★3 */
const starsFor = (tried) => Math.max(1, 4 - tried);

/**
 * こども向け: □ に入るものを選ぶと、そのコードをすぐ動かして結果を見せる。
 * 「めざす けっか」と見比べながら、ためして学ぶ。
 */
export default function KidsQuestion({ q, index, total, onDone }) {
  const [selected, setSelected] = useState(null); // choice
  const [run, setRun] = useState(null); // 実行結果
  const [tried, setTried] = useState(() => new Set());
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runId = useRef(0);

  const [before, after] = q.template.split(SLOT);
  const output = run && run.ok ? run.output.join("\n") : null;
  const matches = output !== null && output === q.goal;

  const tryChoice = async (choice) => {
    if (feedback) return;
    setSelected(choice);
    setTried((prev) => new Set(prev).add(choice.id));
    const id = ++runId.current; // 連打したときは最後の結果だけ使う
    const r = await runProgram(before + choice.text + after);
    if (id === runId.current) setRun(r);
  };

  const check = async () => {
    if (!selected || feedback || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await postAnswer(q.id, selected.id);
      setFeedback({ ...r, stars: r.correct ? starsFor(tried.size) : 0 });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // すうじキー 1〜4 で ためす（入力欄にいるときは なにもしない）
  useEffect(() => {
    const onKey = (e) => {
      if (feedback || ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.choices.length) tryChoice(q.choices[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const correctText = feedback && q.choices.find((c) => c.id === feedback.correct_choice_id)?.text;

  return (
    <section className="card">
      <p className="meta">
        <span className="tag">{q.title}</span>
        <span>{index + 1} / {total}</span>
      </p>
      <h2 className="question">{q.question}</h2>

      <div className="panes">
        <div>
          <p className="pane-label">コード</p>
          <pre className="code"><code>{before}<span className={`slot ${selected ? "filled" : ""}`}>{selected ? selected.text : SLOT}</span>{after}</code></pre>
        </div>
        <div className="outputs">
          <div>
            <p className="pane-label">めざす けっか</p>
            <pre className="console goal">{q.goal}</pre>
          </div>
          <div>
            <p className="pane-label">いまの けっか {matches && <span className="match">✓ おなじ！</span>}</p>
            <pre className={`console ${run && !run.ok ? "err" : ""}`} aria-live="polite">
              {!run && "えらぶと ここに けっかが でるよ"}
              {run && run.ok && (output === "" ? "（なにも ひょうじ されなかったよ）" : output)}
              {run && !run.ok && explainError(run, true)}
            </pre>
          </div>
        </div>
      </div>

      <p className="pane-label">□ に いれて ためしてみよう（キー 1〜{q.choices.length}）</p>
      <div className="chips">
        {q.choices.map((c, i) => {
          let state = selected?.id === c.id ? "is-selected" : "";
          if (feedback) {
            if (c.id === feedback.correct_choice_id) state = "is-correct";
            else if (c.id === selected?.id) state = "is-wrong";
            else state = "is-dim";
          }
          return (
            <button key={c.id} className={`chip ${state}`} disabled={!!feedback}
                    onClick={() => tryChoice(c)}>
              <span className="num">{i + 1}</span><code>{c.text}</code>
            </button>
          );
        })}
      </div>

      {!feedback && (
        <div className="row">
          <button className="ghost" onClick={() => setShowHint((v) => !v)}>
            {showHint ? "ヒントを とじる" : "💡 ヒント"}
          </button>
          <button className="primary" disabled={!selected || busy} onClick={check}>
            これで こたえあわせ
          </button>
        </div>
      )}
      {showHint && !feedback && <p className="hint-box">{q.hint}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {feedback && (
        <div className={`feedback ${feedback.correct ? "ok" : "ng"}`} aria-live="polite">
          <p className="verdict">
            {feedback.correct ? "せいかい！" : "ざんねん…"}
            {feedback.correct && <span className="stars" aria-label={`ほし ${feedback.stars}こ`}>{"★".repeat(feedback.stars)}{"☆".repeat(3 - feedback.stars)}</span>}
          </p>
          {!feedback.correct && <p>こたえは <code>{correctText}</code> だよ。</p>}
          {feedback.correct && feedback.stars < 3 && <p className="small">かんがえてから こたえると ★ が ふえるよ。</p>}
          <p className="explain">{feedback.explanation}</p>
          <button className="primary" autoFocus
                  onClick={() => onDone({ correct: feedback.correct, stars: feedback.stars })}>
            {index + 1 === total ? "けっかを みる" : "つぎへ"}
          </button>
        </div>
      )}
    </section>
  );
}
