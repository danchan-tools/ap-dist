// ============================================================
// コンポーネントを、別のコンポーネントの中で定義していないかを検査する
// ============================================================
// なぜ必要か（B-1・2026-08-29）:
//
//   React は「関数そのもの」でコンポーネントを見分ける。
//   親の中で定義すると、親が描き直されるたびに新しい関数ができるので、
//   React はそれを**別のコンポーネント**とみなし、中身を作り直す。
//
//   作り直された入力欄では、日本語入力の「変換中」の状態が消える。
//   1文字ごとに変換が打ち切られるので、
//   「トラント」と打とうとすると `ｔｏｒａｎｔｏ` になる。
//
//   🔴 これは画面を触らないと分からない。
//      型検査でもテストでも lint でも出ない。
//      だから「書き方」そのものを止める。
//
//   経緯: docs/md/90_不具合と改善/90_不具合と改善の履歴.md の B-1
//
// 何を見るのか:
//   字下げされた位置にある、大文字で始まる関数の宣言。
//   ファイルの一番外側（字下げ 0）にあるものは対象外。
//
//   ⚠️ 完全な判定ではない。
//      大文字で始まるだけの普通の関数も拾いうる。
//      拾われたら、まず「本当に外へ出せないか」を考えること。
//      どうしても外に出せないものが出てきたときは、
//      理由を 90_不具合と改善の履歴.md §7 に書いてから除外する。
//
// 使い方: node scripts/check-nested-components.mjs
// ============================================================

import fs from "fs";
import path from "path";

const ROOT = "src";

// 字下げされた「function Xxx(」
const NESTED_FUNCTION = /^(\s+)function\s+([A-Z]\w*)\s*[(<]/;

// 字下げされた「const Xxx = (」「const Xxx = function」
const NESTED_CONST = /^(\s+)const\s+([A-Z]\w*)\s*=\s*(\(|function\b|memo\b|React\.memo\b)/;

/**
 * 行コメント・ブロックコメントを落とす。
 *
 * 🔴 改行は残し、先に改行コードを揃える。
 *    どちらも check-forbidden-words.mjs で踏んだ（2026-08-29）。
 */
function stripComments(src) {
  return src
    .replace(/\r\n?/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, ""))
    .join("\n");
}

function collect(dir) {
  const files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...collect(p));
    else if (p.endsWith(".tsx")) files.push(p);
  }
  return files;
}

const hits = [];

for (const file of collect(ROOT)) {
  const shown = file.split(path.sep).join("/");

  stripComments(fs.readFileSync(file, "utf8"))
    .split("\n")
    .forEach((line, i) => {
      const m = NESTED_FUNCTION.exec(line) ?? NESTED_CONST.exec(line);
      if (m) hits.push({ file: shown, line: i + 1, name: m[2] });
    });
}

if (hits.length === 0) {
  console.log("OK 入れ子になったコンポーネントは無かった");
  process.exit(0);
}

console.error(`NG ${hits.length} 件見つかった\n`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  ${h.name}`);
}
console.error(`
🔴 コンポーネントは、ファイルの一番外側に置くこと。

   中に置くと、親が描き直されるたびに作り直される。
   入力欄があると、日本語入力の変換中の状態が毎回消える（B-1）。

   親の値を使っているときは、引数で渡す形に組み替える。
   例: src/components/ProjectPicker.tsx の ProjectRow
`);
process.exit(1);
