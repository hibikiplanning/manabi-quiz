import { useEffect, useRef, useState } from "react";
import { postAnswer } from "./api.js";
import { explainError, runProgram } from "./runner.js";

const SLOT = "□";

/** 1かいめで あたると ★3、2かいめ ★2、それより あとは ★1 */
const starsFor = (attempts) => Math.max(1, 4 - attempts);

/**
 * こども向け: □ に入るものを「えらぶ」→「うごかしてみる」→ 結果を「めざす けっか」と見くらべる。
 * 予想してから確かめる。まちがえたら、そのけっかを見て もう一度えらぶ（正解は教えない）。
 */
export default function KidsQuestion({ q, index, total, onDone }) {
  const [selected, setSelected] = useState(null); // えらんでいる choice
  const [run, setRun] = useState(null); // うごかした けっか
  const [wrongIds, setWrongIds] = useState(() => new Set()); // まちがえた choice
  const [attempts, setAttempts] = useState(0);
  const [done, setDone] = useState(null); // 正解したときの { explanation, stars }
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runButton = useRef(null);

  const [before, after] = q.template.split(SLOT);
  const output = run && run.ok ? run.output.join("\n") : null;
  const lastWasWrong = run && !done && selected === null;

  const choose = (choice) => {
    if (done || busy || wrongIds.has(choice.id)) return;
    setSelected(choice);
  };

  // えらんだら「うごかしてみる」に フォーカス → Enter ですぐ うごかせる。
  // ボタンが おせる じょうたいに なってから うつす（おせない ボタンには フォーカス できない）。
  // がめんが かってに スクロール しないように preventScroll。
  useEffect(() => {
    if (selected && !done) runButton.current?.focus({ preventScroll: true });
  }, [selected, done]);

  // せいかいしたら「つぎへ」に フォーカス → Enter で すすめる
  const nextButton = useRef(null);
  useEffect(() => {
    if (done) nextButton.current?.focus({ preventScroll: true });
  }, [done]);

  const tryIt = async () => {
    if (!selected || done || busy) return;
    setBusy(true);
    setError("");
    try {
      const [r, judge] = await Promise.all([
        runProgram(before + selected.text + after),
        postAnswer(q.id, selected.id),
      ]);
      const n = attempts + 1;
      setAttempts(n);
      setRun(r);
      if (judge.correct) {
        setDone({ explanation: judge.explanation, stars: starsFor(n) });
      } else {
        setWrongIds((prev) => new Set(prev).add(selected.id));
        setSelected(null); // まちがえたものは もう えらべない
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // すうじキー 1〜4 で えらぶ
  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.choices.length) choose(q.choices[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section className="card">
      <p className="meta">
        <span className="tag">{q.title}</span>
        <span>{index + 1} / {total}</span>
      </p>
      <h2 className="question">{q.question}</h2>

      {/* たすけ: すすむボタンとは はなして おく */}
      {!done && (
        <div className="helpers">
          <button className="link" onClick={() => setShowHint((v) => !v)}>
            💡 {showHint ? "ヒントを とじる" : "ヒントを みる"}
          </button>
        </div>
      )}
      {showHint && !done && <p className="hint-box">{q.hint}</p>}

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
            <p className="pane-label">うごかした けっか</p>
            <pre className={`console ${run && !run.ok ? "err" : ""}`} aria-live="polite">
              {!run && "えらんで「うごかしてみる」を おすと、ここに でるよ"}
              {run && run.ok && (output === "" ? "（なにも ひょうじ されなかったよ）" : output)}
              {run && !run.ok && explainError(run, true)}
            </pre>
          </div>
        </div>
      </div>

      <p className="pane-label">□ に はいる ものを えらんでね（キー 1〜{q.choices.length}）</p>
      <div className="chips">
        {q.choices.map((c, i) => {
          const wrong = wrongIds.has(c.id);
          let state = "";
          if (wrong) state = "is-wrong";
          else if (done && c.id === selected?.id) state = "is-correct";
          else if (selected?.id === c.id) state = "is-selected";
          else if (done) state = "is-dim";
          return (
            <button key={c.id} className={`chip ${state}`} disabled={!!done || wrong}
                    onClick={() => choose(c)}>
              <span className="num">{wrong ? "✗" : i + 1}</span><code>{c.text}</code>
            </button>
          );
        })}
      </div>

      {lastWasWrong && (
        <p className="status ng" aria-live="polite">
          ちがった みたい。「めざす けっか」と「うごかした けっか」を みくらべて、べつの ものを えらんでね。
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {done && (
        <div className="status ok" aria-live="polite">
          <p className="verdict">
            せいかい！
            <span className="stars" aria-label={`ほし ${done.stars}こ`}>{"★".repeat(done.stars)}{"☆".repeat(3 - done.stars)}</span>
          </p>
          {done.stars < 3 && <p className="small">1かいめで あてると ★3 だよ。</p>}
          <p className="explain">{done.explanation}</p>
        </div>
      )}

      {/* すすむボタンは いつも カードの みぎ下 */}
      <div className="actionbar">
        {!done ? (
          <button key="run" ref={runButton} className="primary" disabled={!selected || busy} onClick={tryIt}>
            {busy ? "うごかしてるよ…" : "▶ うごかしてみる"}
          </button>
        ) : (
          <button key="next" ref={nextButton} className="primary" onClick={() => onDone({ correct: true, stars: done.stars })}>
            {index + 1 === total ? "けっかを みる" : "つぎへ ▶"}
          </button>
        )}
      </div>
    </section>
  );
}
