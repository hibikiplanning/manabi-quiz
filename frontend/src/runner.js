// ユーザーが書いた（選んだ）コードを、安全に動かすための仕組み。
//
// ・毎回あたらしい Web Worker（画面とは別の、隔離された実行場所）で動かす
//   → 画面（DOM）にも、アプリのデータにも触れない
// ・fetch などの通信の入口を塞いでから実行する → 外へデータを送れない
// ・TIMEOUT_MS を過ぎたら Worker ごと止める → 無限ループでも画面は固まらない
// ・console.log は行数と文字数に上限をつけて集める → 大量出力でも固まらない
// ・エラーはすべて捕まえて「結果」として返す → どんな入力でもアプリは落ちない

export const TIMEOUT_MS = 1500;

const WORKER_SRC = `
const BLOCK = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts",
               "indexedDB", "caches", "BroadcastChannel", "Worker", "SharedWorker"];
for (const k of BLOCK) { try { self[k] = undefined; } catch (_) {} }

const MAX_LINES = 200, MAX_CHARS = 10000;

// 表示の形: 文字はそのまま、それ以外は JSON（数値・配列・true/false など）
const fmt = (v) => {
  if (typeof v === "string") return v;
  if (v === undefined) return "undefined";
  try { const s = JSON.stringify(v); return s === undefined ? String(v) : s; }
  catch (_) { return String(v); }
};
const errOf = (err) => ({
  name: (err && err.name) || "Error",
  message: (err && err.message) || String(err),
});

self.onmessage = (e) => {
  const { mode, code, func, inputs } = e.data;
  const lines = [];
  let chars = 0, cut = false;
  const log = (...args) => {
    if (lines.length >= MAX_LINES || chars >= MAX_CHARS) { cut = true; return; }
    const s = args.map(fmt).join(" ");
    chars += s.length;
    lines.push(s);
  };
  const fakeConsole = { log, info: log, warn: log, error: log };
  const done = (msg) => self.postMessage({ ...msg, output: lines, cut });

  try {
    if (mode === "run") {
      new Function("console", code)(fakeConsole);
      done({ ok: true });
      return;
    }
    // mode === "test": コードを読み込んで関数を取り出し、テストの入力ごとに呼ぶ
    const getFn = new Function("console",
      code + "\\n;return typeof " + func + " === 'function' ? " + func + " : undefined;");
    const target = getFn(fakeConsole);
    if (typeof target !== "function") {
      done({ ok: false, error: { name: "NotFound", message: func } });
      return;
    }
    const results = inputs.map((args) => {
      try {
        const v = target(...structuredClone(args));
        if (v === undefined) return { value: null, display: "undefined" };
        const json = JSON.stringify(v);
        if (json === undefined) throw new TypeError("返り値を読み取れません（関数など）");
        return { value: JSON.parse(json), display: json };
      } catch (err) {
        return { error: errOf(err) };
      }
    });
    done({ ok: true, results });
  } catch (err) {
    done({ ok: false, error: errOf(err) });
  }
};
`;

let workerUrl = null;
function getWorkerUrl() {
  if (!workerUrl) {
    workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  }
  return workerUrl;
}

function exec(message) {
  return new Promise((resolve) => {
    const worker = new Worker(getWorkerUrl());
    const finish = (result) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, timeout: true, output: [] }), TIMEOUT_MS);
    worker.onmessage = (e) => finish(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      finish({ ok: false, error: { name: "Error", message: e.message }, output: [] });
    };
    worker.postMessage(message);
  });
}

/** プログラムをそのまま動かし、console.log の出力を集める（こども用） */
export const runProgram = (code) => exec({ mode: "run", code });

/** 関数を読み込んで、テストの入力ごとに呼ぶ（おとな用） */
export const runTests = (code, func, inputs) => exec({ mode: "test", code, func, inputs });

/** エラーを、読む人に合わせた言葉にする */
export function explainError(result, kids) {
  if (result.timeout) {
    return kids
      ? `おわらない くりかえしに なって いるかも。${TIMEOUT_MS / 1000}びょうで とめたよ。`
      : `${TIMEOUT_MS / 1000}秒以内に終わらなかったため止めました（無限ループの可能性）。`;
  }
  const err = result.error;
  if (!err) return "";
  if (kids) {
    if (err.name === "ReferenceError") {
      const m = err.message.match(/^(.+?) is not defined/);
      return m
        ? `「${m[1]}」という なまえが みつからないよ（ReferenceError）`
        : "なまえが みつからないよ（ReferenceError）";
    }
    if (err.name === "SyntaxError") return "かきかたが まちがって いるよ（SyntaxError）";
    return `エラーに なったよ（${err.name}）`;
  }
  if (err.name === "NotFound") {
    return `関数 ${err.message} が見つかりません。関数の名前を変えていないか確認してください。`;
  }
  return `${err.name}: ${err.message}`;
}
