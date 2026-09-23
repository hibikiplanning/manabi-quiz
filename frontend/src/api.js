// Python API との通信はこのファイルにまとめる。
// 画面側のコードは fetch の細かい書き方を知らなくてよい。

async function request(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* 本文がJSONでないときはステータスだけ出す */
    }
    throw new Error(`APIエラー: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return res.json();
}

const postJson = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const getLevels = () => request("/api/levels");

export const getQuizzes = (level, limit = 5) =>
  request(`/api/quizzes?level=${encodeURIComponent(level)}&limit=${limit}`);

/** こども: 選んだ選択肢の答え合わせ */
export const postAnswer = (questionId, choiceId) =>
  postJson("/api/answer", { question_id: questionId, choice_id: choiceId });

/** おとな: ブラウザで実行した各テストの返り値を送って判定してもらう */
export const postJudge = (questionId, results) =>
  postJson("/api/judge", { question_id: questionId, results });

/** おとな: 解答例 */
export const getSolution = (questionId) =>
  request(`/api/solution/${encodeURIComponent(questionId)}`);
