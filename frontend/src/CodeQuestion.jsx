import { useState } from "react";
import { getSolution, postJudge } from "./api.js";
import { explainError, runTests } from "./runner.js";

const show = (v) => JSON.stringify(v);
const call = (func, input) => `${func}(${input.map(show).join(", ")})`;

/**
 * おとな向け: 関数を自分で書いて、テストで確かめる。
 * 実行はブラウザ内の隔離された場所（runner.js）、合否の判定はサーバー（期待値はサーバーだけが持つ）。
 */
export default function CodeQuestion({ q, index, total, onDone }) {
  const [code, setCode] = useState(q.template);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(""); // 実行できなかった理由
  const [judged, setJudged] = useState(null); // サーバーの判定
  const [output, setOutput] = useState([]); // console.log の出力
  const [solution, setSolution] = useState(null);
  const [error, setError] = useState("");

  const passed = judged?.passed === true;
  const gaveUp = solution !== null && !passed;

  const runAndJudge = async () => {
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

  const giveUp = async () => {
    try {
      setSolution(await getSolution(q.id));
    } catch (e) {
      setError(e.message);
    }
  };

  // Tab キーで字下げ（フォーカスが外へ逃げないように）
  const onKeyDown = (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const el = e.target;
      const { selectionStart: s, selectionEnd: t } = el;
      const next = code.slice(0, s) + "  " + code.slice(t);
      setCode(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runAndJudge();
    }
  };

  const sample = passed ? judged.sample : solution?.sample;
  const explanation = passed ? judged.explanation : solution?.explanation;

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

      <textarea className="editor" value={code} spellCheck={false} disabled={passed}
                onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown}
                aria-label="コードを書く欄" rows={Math.max(8, code.split("\n").length + 1)} />

      {!passed && (
        <div className="row">
          <button className="ghost" onClick={giveUp} disabled={!judged && !problem}>
            解答例を見る
          </button>
          <button className="primary" onClick={runAndJudge} disabled={busy}>
            {busy ? "実行中…" : "実行して確かめる（Ctrl+Enter）"}
          </button>
        </div>
      )}

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

      {(passed || gaveUp) && (
        <div className={`feedback ${passed ? "ok" : "ng"}`} aria-live="polite">
          <p className="verdict">{passed ? "合格！ すべてのテストを通過しました" : "解答例"}</p>
          <p className="explain">{explanation}</p>
          <pre className="code"><code>{sample}</code></pre>
          <button className="primary" autoFocus onClick={() => onDone({ passed, gaveUp })}>
            {index + 1 === total ? "結果を見る" : "次へ"}
          </button>
        </div>
      )}
    </section>
  );
}
