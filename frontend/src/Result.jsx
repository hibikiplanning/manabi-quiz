/** 結果画面。こどもは ★ の合計、おとなは自力で合格した数。 */
export default function Result({ kids, log, onRetry, onHome }) {
  if (kids) {
    const stars = log.reduce((sum, r) => sum + (r.stars ?? 0), 0);
    const max = log.length * 3;
    const praise = stars === max ? "ぜんぶ 1かいめで せいかい！ プログラマーの さいのう あり！"
      : stars >= max * 0.6 ? "すごい！ コードが よめて きたね！"
      : "うごかして たしかめるのが いちばん だいじ。よく がんばったね！";
    return (
      <section className="card result">
        <p className="score">★ {stars} / {max}</p>
        <p className="praise">{praise}</p>
        <ul className="review">
          {log.map((r, i) => (
            <li key={i} className="ok">
              <span className="mark">{"★".repeat(r.stars)}{"☆".repeat(3 - r.stars)}</span>
              {r.title}
            </li>
          ))}
        </ul>
        <div className="actions">
          <button onClick={onHome}>さいしょに もどる</button>
          <button className="primary" onClick={onRetry}>もういちど ▶</button>
        </div>
      </section>
    );
  }

  const selfPassed = log.filter((r) => r.passed && !r.sawSample).length;
  const passed = log.filter((r) => r.passed).length;
  const label = (r) => r.skipped ? "とばした" : r.sawSample ? "合格（解答例を見て）" : "合格（自力）";
  return (
    <section className="card result">
      <p className="score">{log.length}問中 {passed}問 合格</p>
      <p className="praise">
        自力で合格 {selfPassed}問。
        {selfPassed === log.length ? "全問自力で合格です。お見事！" : "解答例を見て書いた問題も、もう一度自力で挑戦すると身につきます。"}
      </p>
      <ul className="review">
        {log.map((r, i) => (
          <li key={i} className={r.skipped ? "ng" : "ok"}>
            <span className="mark">{r.skipped ? "→" : "✓"}</span>
            {r.title}<span className="small">（{label(r)}）</span>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button onClick={onHome}>最初に戻る</button>
        <button className="primary" onClick={onRetry}>もう一度 ▶</button>
      </div>
    </section>
  );
}
