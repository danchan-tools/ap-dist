// ===================================================================
// エラー番号の一覧（D-7・2026-10-02）
//
// 🔴 番号の一覧（src/lib/errors.ts）と、買った人が読む ERRORS.md が食い違わないことを見張る。
//    食い違うと、画面に出た番号を ERRORS.md で引いても見つからない。
// ===================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, isErrorCode, withCode } from "../errors";

const DOC = readFileSync(path.resolve(process.cwd(), "ERRORS.md"), "utf8");

/** ERRORS.md の「番号ごとの意味と、やること」の表の行。[番号, 何が起きたか] */
const DOC_ROWS = [...DOC.matchAll(/^\| (E-\d{3}) \| ([^|]+) \|/gm)].map((m) => [m[1], m[2].trim()]);

describe("withCode", () => {
  it("番号と問い合わせ番号を、文の後ろにかっこで付ける", () => {
    expect(withCode("保存できませんでした", "E-201", "7K3Q")).toBe("保存できませんでした（E-201・7K3Q）");
  });

  it("問い合わせ番号が無ければ、番号だけを付ける", () => {
    expect(withCode("保存できませんでした", "E-901")).toBe("保存できませんでした（E-901）");
  });

  it("番号が無ければ、文をそのまま返す（入力の誤りなど）", () => {
    expect(withCode("上限は下限より大きい値にしてください")).toBe("上限は下限より大きい値にしてください");
  });
});

describe("isErrorCode", () => {
  it("一覧にある番号だけを通す", () => {
    expect(isErrorCode("E-201")).toBe(true);
    expect(isErrorCode("E-200")).toBe(false);
    expect(isErrorCode("23505")).toBe(false); // Postgres の番号と取り違えない
    expect(isErrorCode(undefined)).toBe(false);
  });
});

describe("ERRORS.md", () => {
  it("表を読めている", () => {
    expect(DOC_ROWS.length).toBeGreaterThan(0);
  });

  it("🔴 一覧の番号が、すべて同じ言葉で ERRORS.md にある", () => {
    for (const [code, title] of Object.entries(ERROR_CODES)) {
      expect(DOC_ROWS, code).toContainEqual([code, title]);
    }
  });

  it("🔴 ERRORS.md に、一覧に無い番号を書いていない", () => {
    for (const [code] of DOC_ROWS) expect(isErrorCode(code), code).toBe(true);
  });

  it("並び順も一覧と同じ", () => {
    expect(DOC_ROWS.map(([code]) => code)).toEqual(Object.keys(ERROR_CODES));
  });
});
