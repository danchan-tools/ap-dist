// ===================================================================
// F-1 ログイン（01_要件定義/03_制約・非機能要件.md §3）
//
//   方式        パスワード1つのみ。ID なし
//   保存先      環境変数 APP_PASSWORD。コードに書かない
//   セッション  Cookie（HttpOnly・Secure・SameSite=Lax）
//   有効期限    30日
//   総当たり    連続で失敗したら一定時間ロックする（簡易でよい）
//
// 📌 Web Crypto（`crypto.subtle`）を使っている。
//    Node.js 側でも proxy.ts（Edge）側でも同じコードが動くため。
//    Node の `crypto` モジュールは proxy.ts で使えない。
// ===================================================================

export const SESSION_COOKIE = "autopunch_session";

/** セッションの有効期限（秒）。30日 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が設定されていません（.env.local を確認してください）`);
  return v;
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(requireEnv("SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 文字列を、長さや中身で処理時間が変わらないように比べる。
 * ふつうの `===` は「何文字目まで合っていたか」が時間差として漏れるため。
 */
function safeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  // 長さが違っても、比較そのものは同じ回数まわす
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** 入力されたパスワードが正しいか */
export function isValidPassword(input: string): boolean {
  return safeEqual(input, requireEnv("APP_PASSWORD"));
}

/**
 * Cookie に入れる値を作る。
 * 形は `期限.署名`。中身は期限だけで、個人情報は入れない。
 */
export async function createSessionValue(): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  return `${expiresAt}.${await hmacHex(String(expiresAt))}`;
}

/** Cookie の値が本物で、まだ期限内か */
export async function verifySessionValue(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;

  const dot = value.indexOf(".");
  if (dot < 0) return false;

  const expiresAt = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  const expiresAtNum = Number(expiresAt);
  if (!Number.isFinite(expiresAtNum) || expiresAtNum < Date.now()) return false;

  return safeEqual(signature, await hmacHex(expiresAt));
}

// -------------------------------------------------------------------
// 総当たり対策（簡易）
//
// ⚠️ サーバーのメモリに置いているだけなので、
//    再起動すると数え直しになる。Vercel では実行環境が複数に分かれることもある。
//    利用者が1人でURLも非公開のため、この規模では許容する（§3 の但し書き）。
// -------------------------------------------------------------------

/** 何回続けて間違えたらロックするか */
const MAX_ATTEMPTS = 5;
/** ロックする長さ（ミリ秒）。繰り返すほど伸びる：1分 → 5分 → 30分 */
const LOCK_STEPS_MS = [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000];

const attempts = new Map<string, { count: number; locks: number; lockedUntil: number }>();

/** ロック中なら、あと何秒待てばよいか。ロックされていなければ 0 */
export function lockedSeconds(key: string): number {
  const rec = attempts.get(key);
  if (!rec || rec.lockedUntil <= Date.now()) return 0;
  return Math.ceil((rec.lockedUntil - Date.now()) / 1000);
}

/**
 * 失敗を1回数える。
 *
 * ⚠️ ロックのたびに数えを 0 に戻すと、待てば何度でも5回試せてしまう。
 *    ロックした回数を覚えておき、繰り返すほど待ち時間を伸ばす。
 */
export function recordFailure(key: string): void {
  const rec = attempts.get(key) ?? { count: 0, locks: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_STEPS_MS[Math.min(rec.locks, LOCK_STEPS_MS.length - 1)];
    rec.locks += 1;
    rec.count = 0;
  }
  attempts.set(key, rec);
}

/** 成功したら数えをやめる */
export function clearFailures(key: string): void {
  attempts.delete(key);
}
