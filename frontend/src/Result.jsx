/** 結果画面。こどもは ★ の合計、おとなは合格した数。 */
export default function Result({ kids, log, onRetry, onHome }) {
  if (kids) {
    const stars = log.reduce((sum, r) => sum + (r.stars ?? 0), 0);
    const max = log.length * 3;
    const praise = stars === max ? "ぜんぶ ★3！ プログラマーの さいのう あり！"
      : stars >= max * 0.6 ? "すごい！ コードが よめて きたね！"
      : "ためして わかるのが いちばん だいじ。よく がんばったね！";
    return (
      <section className="card result">
        <p className="score">★ {stars} / {max}</p>
        <p className="praise">{praise}</p>
        <ul className="review">
          {log.map((r, i) => (
            <li key={i} className={r.correct ? "ok" : "ng"}>
              <span className="mark">{r.correct ? "★".repeat(r.stars) : "×"}</span>
              {r.title}
            </li>
          ))}
        </ul>
        <div className="actions">
          <button className="primary" onClick={onRetry}>もういちど</button>
          <button onClick={onHome}>さいしょに もどる</button>
        </div>
      </section>
    );
  }

  const passed = log.filter((r) => r.passed).length;
  return (
    <section className="card result">
      <p className="score">{log.length}問中 {passed}問 合格</p>
      <p className="praise">{passed === log.length ? "全問合格です。お見事！" : "解答例と見比べると、書き方の引き出しが増えます。"}</p>
      <ul className="review">
        {log.map((r, i) => (
          <li key={i} className={r.passed ? "ok" : "ng"}>
            <span className="mark">{r.passed ? "✓" : "…"}</span>
            {r.title}{r.gaveUp && <span className="small">（解答例を見た）</span>}
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="primary" onClick={onRetry}>もう一度</button>
        <button onClick={onHome}>最初に戻る</button>
      </div>
    </section>
  );
}
