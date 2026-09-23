// 問題の中身を、実際に JavaScript で動かして検査する。  実行: npm run check
//
// こども: 正解を入れると goal（めざす結果）がそのまま出るか。
//         不正解を入れたときに、たまたま goal と同じ結果にならないか（なると問題として成り立たない）。
// おとな: 解答例（sample）がすべてのテストを通るか。
//         書き始めの状態（template）では、きちんと不合格になるか（テストが甘くないか）。
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = process.argv[2] ?? new URL("../../backend/questions.json", import.meta.url);
const bank = JSON.parse(readFileSync(src, "utf8"));
const TIMEOUT = 1000;

// 画面（runner.js）と同じ表示の形
const fmt = (v) => {
  if (typeof v === "string") return v;
  if (v === undefined) return "undefined";
  try { const s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch { return String(v); }
};

function runProgram(code) {
  const lines = [];
  const log = (...a) => lines.push(a.map(fmt).join(" "));
  try {
    vm.runInNewContext(code, { console: { log, info: log, warn: log, error: log } }, { timeout: TIMEOUT });
    return { ok: true, output: lines.join("\n") };
  } catch (e) {
    return { ok: false, error: `${e.name}: ${e.message}` };
  }
}

function runTests(code, func, tests) {
  const ctx = vm.createContext({ console: { log() {} } });
  try {
    vm.runInContext(code, ctx, { timeout: TIMEOUT });
    ctx.__inputs = tests.map((t) => t.input);
    const got = vm.runInContext(
      `__inputs.map((args) => { try { const v = ${func}(...args); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch (e) { return { __error: String(e) }; } })`,
      ctx, { timeout: TIMEOUT });
    return tests.map((t, i) => JSON.stringify(got[i]) === JSON.stringify(t.expected));
  } catch (e) {
    return tests.map(() => false);
  }
}

const problems = [];
let checked = 0;
for (const q of bank.questions) {
  const kind = bank.levels[q.level].kind;
  checked++;
  if (kind === "choice") {
    const [before, after] = q.template.split("□");
    q.choices.forEach((text, i) => {
      const r = runProgram(before + text + after);
      const hitsGoal = r.ok && r.output === q.goal;
      if (i === q.answer && !hitsGoal) {
        problems.push(`${q.id}: 正解「${text}」で goal が出ない（出た結果: ${r.ok ? JSON.stringify(r.output) : r.error}）`);
      }
      if (i !== q.answer && hitsGoal) {
        problems.push(`${q.id}: 不正解「${text}」でも goal と同じ結果になる（問題が成り立たない）`);
      }
    });
  } else {
    const sample = runTests(q.sample, q.func, q.tests);
    sample.forEach((pass, i) => {
      if (!pass) problems.push(`${q.id}: 解答例がテスト${i + 1}を通らない`);
    });
    if (runTests(q.template, q.func, q.tests).every(Boolean)) {
      problems.push(`${q.id}: 書き始めの状態でも全テストに通ってしまう（テストが甘い）`);
    }
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} 件の問題があります:\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`✓ ${checked} 問すべて OK（こども: 正解で goal が出て不正解では出ない／おとな: 解答例が全テストを通り、書き始めでは不合格）`);
