// ===================================================================
// バージョン番号（2026-08-12 追加）
//
// 🔴 番号の正は package.json ただ1つ。ここは読むだけで、数字を持たない。
//    仕組みと振り方は `docs/md/02_基本設計/09_バージョンと改訂履歴.md`。
//
//    package.json → next.config.ts → NEXT_PUBLIC_APP_VERSION → ここ → 画面
//
// 📌 なぜ `package.json` を直接 import しないのか。
//    画面（ブラウザ側）で import すると、package.json が丸ごとブラウザに渡る。
//    欲しいのは version の1行だけなので、ビルド時に1行だけ焼き込む形にした。
// ===================================================================

/** 画面に出すバージョン番号。例：`0.9.0` */
export function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? UNKNOWN_VERSION;
}

/**
 * 番号が取れなかったときに出す値。
 *
 * 🔴 ここで `0.0.0` のような**それらしい番号を返さない。**
 *    仕組みが壊れているのに、正しい番号が出ているように見えてしまう。
 *    （「0件」と「そもそも何も見ていない」の区別がつかなくなるのと同じ形）
 */
export const UNKNOWN_VERSION = "不明";

/** 画面に出す形。例：`v0.9.0` */
export function formatAppVersion(v: string = getAppVersion()): string {
  return v === UNKNOWN_VERSION ? UNKNOWN_VERSION : `v${v}`;
}

/**
 * バージョン番号として妥当か（先頭に 0 を付けた `1.01.03` などを弾く）。
 *
 * 🔴 世界共通の規格（セマンティックバージョニング）で、先頭の 0 は禁止。
 *    `npm version` が受け付けず、番号を上げられなくなる（2026-08-12 に実機で確認）。
 */
export function isValidVersion(v: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
}
