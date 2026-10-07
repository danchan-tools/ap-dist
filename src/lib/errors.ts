// ===================================================================
// エラー番号（D-7・2026-10-02）
//
// 画面に「保存できませんでした（E-201・7K3Q）」と出すための番号の一覧。
//   E-201 … エラー番号。原因の種類
//   7K3Q  … 問い合わせ番号。毎回ちがう。買った人の Vercel のログで、同じ番号の行を探せる
//
// 🔴 番号を付けるのは、画面の文だけでは原因が分からない失敗だけ（2026-10-02 段木さんの了承）。
//    入力の誤り（「上限は下限より大きい値にしてください」など）は、文だけで直し方が分かるので付けない。
//
// 🔴 番号の一覧はここだけに置く。買った人向けの説明はリポジトリ直下の ERRORS.md。
//    両方が食い違うと errors.test.ts が落ちる。
//    切り分けの手順（作る人向け）は docs/md/02_基本設計/10_エラー番号.md。
//
// 📌 このファイルは画面でもサーバーでも読む。サーバー専用のもの（ログ・DB）を import しない。
// ===================================================================

/** 番号と、何が起きたか（ログと ERRORS.md の見出しに同じ言葉を使う） */
export const ERROR_CODES = {
  "E-201": "データベースにつながらない",
  "E-202": "データベースの決まりに弾かれた",
  "E-203": "環境変数が入っていない",
  "E-204": "データベースの表が古い・足りない",
  "E-301": "AIのキーが入っていない",
  "E-302": "AIにつながらない",
  "E-303": "Excelを作れなかった",
  "E-901": "サーバーから返事が無い",
  "E-999": "想定していない失敗",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * 画面を開けなかったとき（LoadFailed）に出す「やること」（I-9・2026-10-07）。
 * E-203・E-204 は待っても直らないので、番号ごとに次の一手を出す。
 * 📌 手順書の章の名前を書いているので、手順書の章を変えたら、ここもそろえる。
 */
export const LOAD_FAILED_ACTIONS: Partial<Record<ErrorCode, string>> = {
  "E-201": "Neon が動いているかと、Vercel の DATABASE_URL を確かめてから、F5 を押してください",
  "E-203": "Vercel の環境変数を入れて、公開し直してください（手順書の「7. もう一度公開する」）",
  "E-204": "手順書の「6. データベースの SQL を流す」を済ませてから、F5 を押してください",
};

/** LOAD_FAILED_ACTIONS に無い番号のときの「やること」 */
export const LOAD_FAILED_FALLBACK = "少し待ってから F5 を押してください（直らなければ問い合わせてください）";

/** API が失敗したときに返す形。code と ref は、番号を付ける失敗のときだけ入る */
export type FailureBody = { error: string; code?: ErrorCode; ref?: string };

export const isErrorCode = (v: unknown): v is ErrorCode =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(ERROR_CODES, v);

/**
 * 画面に出す1文にする。
 * 「保存できませんでした」＋ E-201 ＋ 7K3Q →「保存できませんでした（E-201・7K3Q）」
 */
export function withCode(message: string, code?: ErrorCode, ref?: string): string {
  if (!code) return message;
  return `${message}（${code}${ref ? `・${ref}` : ""}）`;
}
