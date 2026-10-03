// ===================================================================
// テストの設定（2026-08-06 追加）
//
// それまで設定ファイルは無くてよかった。
// `src/lib/` のテストは相対パス（`../calc`）だけで書いていたため。
//
// 画面の部品をテストするようになって、2つ足りなくなった。
//   ① `@/lib/...` の別名を解く（tsconfig.json の paths と同じもの）
//   ② React を動かすための jsdom
//
// 📌 jsdom はファイルごとに指定する（`// @vitest-environment jsdom`）。
//    計算のテストは jsdom を使わないほうが速いので、全体には広げない。
// ===================================================================

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
