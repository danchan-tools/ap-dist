// ===================================================================
// API の失敗の返し方を、書き方の時点で止める（D-7・2026-10-02）
//
// 🔴 番号の無い失敗を返す書き方が戻ってこないように、API のファイルを読んで確かめる。
//    1か所だけ古い書き方が残ると、その操作だけ「保存できませんでした」としか出なくなる。
//
//   ① console.error を API に直接書かない（ログは failure / logFailure の1か所で、値を伏せて書く）
//   ② 案件の読み込みの失敗を握りつぶさない（requireProject を使う）
//   ③ { status: 500 } を直接書かない（failure を通すと、番号と問い合わせ番号が付く）
// ===================================================================

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API = path.resolve(process.cwd(), "src/app/api");

function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return routes(p);
    return e.name === "route.ts" ? [p] : [];
  });
}

const FILES = routes(API).map((p) => ({ name: path.relative(API, p), text: readFileSync(p, "utf8") }));

describe("API の失敗の返し方", () => {
  it("API のファイルを読めている", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(10);
  });

  it("🔴 console.error を直接書かない", () => {
    for (const f of FILES) expect(f.text, f.name).not.toContain("console.error(");
  });

  it("🔴 案件の読み込みは requireProject を使う（失敗を「案件が見つかりません」にしない）", () => {
    for (const f of FILES) {
      expect(f.text, f.name).not.toContain("projectFromParam(");
      expect(f.text, f.name).not.toMatch(/\.catch\(\(\) => null\)\s*;\s*\n\s*if \(!project\)/);
    }
  });

  it("🔴 { status: 500 } を直接書かない（failure を通す）", () => {
    for (const f of FILES) expect(f.text, f.name).not.toMatch(/status:\s*500\b/);
  });
});

describe("画面の失敗の出し方", () => {
  const DIR = path.resolve(process.cwd(), "src/components");
  const COMPONENTS = readdirSync(DIR)
    .filter((n) => n.endsWith(".tsx"))
    .map((n) => ({ name: n, text: readFileSync(path.join(DIR, n), "utf8") }));

  it("🔴 API の返事の文を直接出さない（番号が落ちる）。src/lib/request.ts の send / failureText を使う", () => {
    expect(COMPONENTS.length).toBeGreaterThan(5);
    for (const c of COMPONENTS) expect(c.text, c.name).not.toMatch(/\.error\s*\?\?/);
  });
});
