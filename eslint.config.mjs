// ===================================================================
// ESLint の設定（2026-08-29 追加・Phase B）
//
// 何を止めるための道具か:
//   打ち間違えた変数名・使っていない変数・React の書き方の崩れなど、
//   「動くけれど後から効いてくる」ものを、マージ前に見つける。
//
// 🔴 型の検査（tsc）とは役割が違う。
//    tsc  … 型が合っているか
//    ここ … 型は合っているが、書き方として危ういもの
//
// 🔴 FlatCompat（旧形式の変換）は使わない。
//    eslint-config-next 16 は新しい形式（フラット設定の配列）を
//    そのまま返すので、変換をかませると
//    「Converting circular structure to JSON」で落ちる。
//    2026-08-29 に実際に踏んだ。
//
// 見ない場所と、その理由:
//   prototype/ … 試作。捨てる前提で書いたので、いま直す意味がない
//   mockups/   … 画面の見た目を確かめるための HTML
//   extension/ … ブラウザ拡張。モジュールではない素の JS で、
//                 前提が違うため同じ規約では測れない
//   db/ docs/  … SQL と Markdown なので対象外
//
// ⚠️ 見ない場所を増やすときは、必ず理由をここに書くこと。
//    理由の無い除外は、あとから誰も外せなくなる。
// ===================================================================

import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prototype/**",
      "mockups/**",
      "extension/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
