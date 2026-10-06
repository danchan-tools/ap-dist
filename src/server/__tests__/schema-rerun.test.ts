// ===================================================================
// 表を作る SQL（db/schema.sql）を2回流しても、行が増えないか（I-8・2026-10-05）
//
// 手順書は「流すのは1回だけ」と案内しているが、間違えて2回流す人はいる。
// Neon の SQL Editor が1つ目の失敗（already exists）で止まるかは、公式の説明に無い。
// 止まらずに続けられても困らないよう、INSERT は「表が空のときだけ入れる」形にする。
//
// 🔴 VALUES で入れる形に戻すと、案件A を改名したあとの2回目で「案件A」が増える。
// ===================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** コメントを落として、文（; で区切ったもの）に分ける */
function statements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const inserts = statements(readFileSync(root + "db/schema.sql", "utf8")).filter((s) =>
  /^INSERT\s/i.test(s),
);

describe("db/schema.sql を2回流しても行が増えない", () => {
  it("最初の案件（案件A）を入れる文がある", () => {
    // 1回目に流したとき、画面を開けるように案件が1つできる
    expect(inserts.some((s) => s.includes("'案件A'"))).toBe(true);
  });

  it("INSERT は、どれも入れる先の表が空のときだけ入れる", () => {
    for (const s of inserts) {
      const table = s.match(/^INSERT\s+INTO\s+(\w+)/i)?.[1];
      expect(table, s).toBeTruthy();
      const guard = new RegExp(`WHERE\\s+NOT\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+${table}\\s*\\)`, "i");
      expect(s, `${table} への INSERT に「表が空のときだけ」の条件が無い`).toMatch(guard);
      expect(s, `${table} への INSERT が VALUES で入れている（2回目で行が増える）`).not.toMatch(/\bVALUES\b/i);
    }
  });
});
