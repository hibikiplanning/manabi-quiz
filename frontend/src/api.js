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
    throw new Error(`APIエラー: ${detail}`);
  }
  return res.json();
}

export const getLevels = () => request("/api/levels");

export const getQuizzes = (level, limit = 5) =>
  request(`/api/quizzes?level=${encodeURIComponent(level)}&limit=${limit}`);

export const postAnswer = (questionId, choiceId) =>
  request("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: questionId, choice_id: choiceId }),
  });
