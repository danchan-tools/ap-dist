// ===================================================================
// 配らないファイルの名前を、コードで案内していないか（I-7・2026-10-03）
//
// 買った人に配るのは db/schema.sql だけで、db/migrations/ と db/reset.sql は配らない
// （docs/md/08_販売企画/05_配布物の文面.md §4・§6.4 の4）。
// ログや画面の文で「db/migrations/002_projects.sql を流したか」と書くと、
// 買った人は自分のリポジトリに無いファイルを探すことになる。
//
// 🔴 コメントも見る。コメントの案内を写して、文に戻ってくることがあるため。
// ===================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** 配布に入らないファイル（配布物を作る道具 scripts/build-dist.mjs の除外と同じもの） */
const NOT_SHIPPED = ["db/migrations", "db/reset.sql"];

/** src/ の中のコード（テストは除く） */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(root + dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "__tests__") out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

describe("配らないファイルを案内しない", () => {
  it("src/ に db/migrations・db/reset.sql の名前が出てこない", () => {
    const hits: string[] = [];
    for (const file of sourceFiles("src")) {
      readFileSync(root + file, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          for (const name of NOT_SHIPPED) {
            if (line.includes(name)) hits.push(`${file}:${i + 1} ${name}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });

  it("見るファイルが空ではない（何も見ずに通るのを防ぐ）", () => {
    const files = sourceFiles("src");
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain("src/server/queries.ts");
  });
});
