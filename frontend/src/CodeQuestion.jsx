import { useEffect, useRef, useState } from "react";
import { getSolution, postJudge } from "./api.js";
import { explainError, runTests } from "./runner.js";

const show = (v) => JSON.stringify(v);
const call = (func, input) => `${func}(${input.map(show).join(", ")})`;

/**
 * おとな向け: 関数を自分で書いて、テストで確かめる。
 * 次へ進めるのは「合格したとき」だけ。解答例を見ても、見ながら自分で書いて通すまでは進めない。
 * どうしても無理なときの「とばす」は別のボタンにして、結果画面に正直に残す。
 * 実行はブラウザ内の隔離された場所（runner.js）、合否の判定はサーバー（期待値はサーバーだけが持つ）。
 */
export default function CodeQuestion({ q, index, total, onDone }) {
  const [code, setCode] = useState(q.template);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(""); // 実行できなかった理由
  const [judged, setJudged] = useState(null); // サーバーの判定
  const [output, setOutput] = useState([]); // console.log の出力
  const [showHint, setShowHint] = useState(false);
  const [solution, setSolution] = useState(null); // 解答例（見たら残る）
  const [error, setError] = useState("");

  const passed = judged?.passed === true;
  const sawSample = solution !== null;

  // 合格したら「次へ」にフォーカス → Enter で進める（画面は勝手に動かさない）
  const nextButton = useRef(null);
  useEffect(() => {
    if (passed) nextButton.current?.focus({ preventScroll: true });
  }, [passed]);

  const runAndJudge = async () => {
    if (passed || busy) return;
    setBusy(true);
    setProblem("");
    setError("");
    try {
      const r = await runTests(code, q.func, q.tests.map((t) => t.input));
      setOutput(r.output ?? []);
      if (!r.ok) {
        setJudged(null);
        setProblem(explainError(r, false));
        return;
      }
      const results = r.results.map((x) =>
        x.error ? { error: `${x.error.name}: ${x.error.message}` } : { value: x.value });
      const j = await postJudge(q.id, results);
      // 画面では、実際に返った値の見た目（undefined など）も出したいので合わせて持つ
      j.cases.forEach((c, i) => { c.display = r.results[i].display; });
      setJudged(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openSample = async () => {
    try {
      setSolution(await getSolution(q.id));
    } catch (e) {
      setError(e.message);
    }
  };

  // Tab キーで字下げ／Ctrl+Enter で実行
  const onKeyDown = (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const el = e.target;
      const { selectionStart: s, selectionEnd: t } = el;
      setCode(code.slice(0, s) + "  " + code.slice(t));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runAndJudge();
    }
  };

  const failedCount = judged ? judged.cases.filter((c) => !c.pass).length : 0;

  return (
    <section className="card">
      <p className="meta">
        <span className="tag">{q.title}</span>
        <span>{index + 1} / {total}</span>
      </p>
      <h2 className="question">{q.question}</h2>
      <p className="examples">
        例: {q.examples.map((ex, i) => (
          <code key={i}>{call(q.func, ex.input)} → {show(ex.output)}</code>
        ))}
      </p>

      {/* たすけ: 進むボタン（右下）とは離して置く */}
      {!passed && (
        <div className="helpers">
          <button className="link" onClick={() => setShowHint((v) => !v)}>
            💡 {showHint ? "ヒントを閉じる" : "ヒントを見る"}
          </button>
          {!sawSample && (
            <button className="link" onClick={openSample}>📖 解答例を見る</button>
          )}
          {sawSample && (
            <button className="link muted" onClick={() => onDone({ passed: false, sawSample: true, skipped: true })}>
              この問題をとばす（結果に「とばした」と残ります）
            </button>
          )}
        </div>
      )}
      {showHint && !passed && <p className="hint-box">{q.hint}</p>}
      {sawSample && !passed && (
        <div className="sample-box">
          <p className="pane-label">解答例 — 見ながら、下の欄に自分で書いて実行してみましょう。合格すると次へ進めます</p>
          <pre className="code"><code>{solution.sample}</code></pre>
          <p className="small">{solution.explanation}</p>
        </div>
      )}

      <p className="pane-label">あなたのコード（Tab で字下げ・Ctrl+Enter で実行）</p>
      <textarea className="editor" value={code} spellCheck={false} disabled={passed}
                onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown}
                aria-label="コードを書く欄" rows={Math.max(8, code.split("\n").length + 1)} />

      {problem && <p className="error" role="alert">{problem}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {judged && (
        <table className="tests" aria-live="polite">
          <thead><tr><th></th><th>呼び出し</th><th>期待</th><th>あなたの結果</th></tr></thead>
          <tbody>
            {judged.cases.map((c, i) => (
              <tr key={i} className={c.pass ? "ok" : "ng"}>
                <td className="mark">{c.pass ? "✓" : "✗"}</td>
                <td><code>{call(q.func, c.input)}</code></td>
                <td><code>{show(c.expected)}</code></td>
                <td><code>{c.error ?? c.display}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {output.length > 0 && (
        <>
          <p className="pane-label">console.log の出力</p>
          <pre className="console">{output.join("\n")}</pre>
        </>
      )}

      {judged && !passed && (
        <p className="status ng">{failedCount}件のテストが通っていません。✗ の行の「期待」と「あなたの結果」を見比べてみましょう。</p>
      )}

      {passed && (
        <div className="status ok" aria-live="polite">
          <p className="verdict">合格！ すべてのテストを通過しました</p>
          <p className="explain">{judged.explanation}</p>
          {!sawSample && (
            <>
              <p className="pane-label">解答例（ほかの書き方の参考に）</p>
              <pre className="code"><code>{judged.sample}</code></pre>
            </>
          )}
        </div>
      )}

      {/* 進むボタンは、いつもカードの右下の同じ場所 */}
      <div className="actionbar">
        {!passed ? (
          <button key="run" className="primary" onClick={runAndJudge} disabled={busy}>
            {busy ? "実行中…" : "▶ 実行して確かめる"}
          </button>
        ) : (
          <button key="next" ref={nextButton} className="primary" onClick={() => onDone({ passed: true, sawSample, skipped: false })}>
            {index + 1 === total ? "結果を見る" : "次へ ▶"}
          </button>
        )}
      </div>
    </section>
  );
}
