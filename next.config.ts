// ===================================================================
// Next.js の設定
//
// 🔴 バージョンは package.json だけが正（`docs/md/02_基本設計/09_バージョンと改訂履歴.md`）。
//    ここは「読んで画面へ渡す」だけ。**この行に数字を直接書かない。**
//    書くと、package.json と画面で別々の番号を持つことになり、必ずずれる。
//    （同じことが2か所にあると直し忘れる場所が2つできる ＝ 8/8 に実際にやらかした）
//
//    package.json  "version"          ← 🔴 書き換えるのはここだけ
//         │
//         └─→ NEXT_PUBLIC_APP_VERSION ← ビルド時に焼き込む
//                  │
//                  └─→ getAppVersion()（src/lib/version.ts）→ ⚙設定の画面
//
//    ⚠️ `NEXT_PUBLIC_` を付けているのは、画面（ブラウザ側）で読むため。
//       バージョン番号は秘密ではないので付けてよい。
//       🔴 APIキーには絶対に付けない（`src/server/claude.ts` の決めごと）。
// ===================================================================

import type { NextConfig } from "next";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
