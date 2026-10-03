// ============================================================
// 出してはいけないものが、画面に出るコードに混ざっていないかを検査する
// ============================================================
// 何を守るのか（CLAUDE.md「禁止事項」）:
//   ① 取引先・仲介会社の実名
//   ② 契約の単価の実額
//
// どちらも一度 push すると履歴から消しにくい。
// 「気をつける」ではなく機械で止める。
//
// 🔴 このスクリプトに、守りたい値そのものを書かないこと。
//    実額を「禁止語」として並べたら、検査そのものが漏洩になる。
//    だから ② は「値」ではなく「形」で見る（大きな数値リテラル）。
//
// なぜ src/ だけを見るのか（2026-08-29 の判断）:
//   要件定義（01_要件定義/01_アプリ概要.md §用語）に
//   「画面に出す文言は『報告サイト』に統一する。
//     設計書の中では Levtech と書いてよい」とある。
//
//   docs/ と CLAUDE.md は、作る人が読むもので公開されない。
//   extension/ は報告サイトの URL が無いと動かない（manifest.json）。
//   止めるべきなのは「画面に出るコード」＝ src/ である。
//
// 使い方: node scripts/check-forbidden-words.mjs
// ============================================================

import fs from "fs";
import path from "path";

const ROOT = "src";

// ── ① 実名 ────────────────────────────────────────
//
// 画面に出す言葉は「報告サイト」に統一する。
// 案件名は「案件A」。実名にしたいときは画面の ⚙設定 から改名する。
const FORBIDDEN_WORDS = [
  { word: "levtech", why: "仲介会社の実名。画面には「報告サイト」と書く" },
  { word: "レバテック", why: "仲介会社の実名。画面には「報告サイト」と書く" },
];

// ── ② 金額らしい数値 ──────────────────────────────
//
// 本番のコードは単価を DB から受け取る。直に書く理由がない。
// 6桁以上（10万以上）を金額らしい数値とみなす。
//
// 年（2026）・契約時間の分（8400 = 140時間）・時刻はすべて4〜5桁なので、
// この線なら巻き込まない。2026-08-29 時点で本番のコードは0件だった。
//
// 🔴 小数の一部を拾わないこと。
//    `\b\d{6,}\b` だと、Excel の列幅 `5.83203125` の小数部や
//    塗りの濃さ `-0.1499984740745262` を「金額」と読んでしまう。
//    前後に「.」と数字が来ないものだけを見る。
const MONEY_LIKE = /(?<![\d.])\d{6,}(?![\d.])/g;

// テストは「試すための偽の値」を持つ場所なので見ない。
// 実際 600000 や 10800 はテストの中だけにある（2026-08-29 に確認）。
const SKIP_DIR = "__tests__";

/**
 * 行コメント・ブロックコメントを落とす（中の数字は説明であって実装ではない）。
 *
 * 🔴 改行は残す。
 *    消すと行番号がずれ、検査が無関係な行を指すようになる。
 *    2026-08-29 に実際にやってしまい、報告された8件すべてが違う行を指していた。
 *
 * 🔴 先に改行コードを揃える。
 *    このリポジトリのファイルは行末が CRLF なので、`\n` で切ると各行の末尾に
 *    `\r` が残る。`\r` は正規表現では行の終わり扱いなので `//.*$` が成立せず、
 *    行コメントが1つも消えなかった。2026-08-29 に実際に踏んだ。
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
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
  return files;
}

const hits = [];

for (const file of collect(ROOT)) {
  const raw = fs.readFileSync(file, "utf8");
  const shown = file.split(path.sep).join("/");

  // ① 実名は、コメントの中にあっても止める。
  //    公開されたコードのコメントは、ブラウザの「ソースを表示」で読める。
  raw.split("\n").forEach((line, i) => {
    for (const { word, why } of FORBIDDEN_WORDS) {
      if (line.toLowerCase().includes(word.toLowerCase())) {
        hits.push({ file: shown, line: i + 1, what: `実名「${word}」`, why });
      }
    }
  });

  // ② 金額らしい数値は、テストを除く本番のコードだけを見る。
  if (file.split(path.sep).includes(SKIP_DIR)) continue;

  stripComments(raw)
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(MONEY_LIKE)) {
        hits.push({
          file: shown,
          line: i + 1,
          what: `金額らしい数値 ${m[0]}`,
          why: "単価は DB から受け取る。コードに直に書かない",
        });
      }
    });
}

if (hits.length === 0) {
  console.log("OK 出してはいけないものは見つからなかった");
  process.exit(0);
}

console.error(`NG ${hits.length} 件見つかった\n`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  ${h.what}`);
  console.error(`    → ${h.why}\n`);
}
process.exit(1);
