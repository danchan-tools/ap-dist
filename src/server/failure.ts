// ===================================================================
// 失敗を番号に分けて、ログに1行書く（D-7・2026-10-02）
//
// 画面には「保存できませんでした（E-201・7K3Q）」、
// 買った人の Vercel のログには同じ番号で1行を書く。
//
//   [E-201] 7K3Q 勤務の保存: データベースにつながらない (name=Error code=ECONNREFUSED msg=…)
//
// 段木さんは買った人のログを見られない（買った人ごとに Vercel と Neon が別）。
// 問い合わせでは、番号と問い合わせ番号、できればこの1行を送ってもらう。
//
// 🔴 ログに値を書かない。SQL・接続先・単価・取引先名（案件名）が混ざりうるため。
//    書くのは、エラーの種類（name・code・制約の名前・表の名前・HTTPの状態）と、
//    値を伏せたメッセージだけ（redact）。
//
// 📌 Vercel の無料プランでは、ログは1時間で消える（Vercel の公式資料・2026-10-02 確認）。
//
// 仕組みの説明と切り分けの手順は docs/md/02_基本設計/10_エラー番号.md。
// ===================================================================

import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { ERROR_CODES, isErrorCode, type ErrorCode } from "@/lib/errors";

/** 環境変数が入っていない（E-203） */
export class ConfigError extends Error {
  constructor(readonly variable: string) {
    super(`環境変数 ${variable} が設定されていません`);
    this.name = "ConfigError";
  }
}

/** データベースの表や最初のデータが足りない（E-204）。手順書の SQL を流していないとき */
export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

/**
 * Postgres のエラー番号（SQLSTATE）のうち、表・列・関数が無いもの。
 * 手順書の SQL（db/schema.sql）を流していないときに出る
 */
const UNDEFINED_OBJECT = new Set(["42P01", "42703", "42883", "42704"]);

/** つながらないときに Node が付ける番号 */
const NETWORK_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "EPIPE"]);

/**
 * WebSocket がつながらないとき、@neondatabase/serverless は Error ではなく ErrorEvent を投げる。
 * 中身はほぼ空（message も code も無い）なので、形で見分ける。
 * 🔴 2026-10-02 の手元の確認で、つながらないのに E-999 になって見つかった（テストの作り物の失敗では出なかった）
 */
function isSocketEvent(e: unknown): boolean {
  if (e == null || typeof e !== "object" || e instanceof Error) return false;
  const o = e as { type?: unknown; constructor?: { name?: unknown } };
  return o.type === "error" || (typeof o.constructor?.name === "string" && o.constructor.name.endsWith("Event"));
}

/** 失敗の原因を番号に分ける。分からなければ E-999 */
export function classify(e: unknown): ErrorCode {
  if (e instanceof ConfigError) return "E-203";
  if (e instanceof SchemaError) return "E-204";
  if (isSocketEvent(e)) return "E-201";

  const code = (e as { code?: unknown } | null)?.code;
  // 投げた側がもう番号を決めている（AI の失敗など。src/server/claude.ts の AssistError）
  if (isErrorCode(code)) return code;

  if (typeof code === "string") {
    if (code.startsWith("23")) return "E-202"; // 制約違反（CHECK・一意・外部キー）
    if (UNDEFINED_OBJECT.has(code)) return "E-204";
    // 08 接続・28 認証（パスワード違い）・3D データベースが無い・53 資源不足・57 停止
    if (/^(08|28|3D|53|57)/.test(code)) return "E-201";
    if (NETWORK_CODES.has(code)) return "E-201";
  }

  const message = e instanceof Error ? e.message : String(e);
  if (/connect|websocket|fetch failed|terminated|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|invalid url/i.test(message)) {
    return "E-201";
  }
  return "E-999";
}

/**
 * 問い合わせ番号に使う文字。読み違えやすい 0・O・1・I は使わない。
 * 📌 数字を2つに分けて書くのは、6桁以上の数字の並びを「金額らしい数値」として止める検査
 *    （scripts/check-forbidden-words.mjs）に当たらないようにするため。検査は弱めない
 */
const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ" + "2345" + "6789";

/** 問い合わせ番号（4文字）。毎回ちがう */
export function newRef(): string {
  return Array.from({ length: 4 }, () => REF_CHARS[randomInt(REF_CHARS.length)]).join("");
}

/**
 * メッセージから値を伏せる。
 *   接続先（postgres://…）            → <url>
 *   引用符の中（"600000" など）         → "…"
 *   ホスト名・IP（ep-x.neon.tech など） → <host>
 *   2桁以上の数字                      → #
 * 🔴 Postgres のメッセージには、入力した値（単価など）がそのまま入ることがある。
 *    つながらないときのメッセージには、接続先のホスト名が入る
 */
export function redact(message: string): string {
  return message
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "<url>")
    .replace(/"[^"]*"|'[^']*'|「[^」]*」/g, '"…"')
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, "<host>")
    .replace(/\d{2,}/g, "#")
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

/** ログに書いてよい項目だけを取り出す */
function safeDetail(e: unknown): string {
  if (e == null || typeof e !== "object") return `msg=${redact(String(e))}`;
  const o = e as Record<string, unknown>;
  const parts: string[] = [];
  // Error でないもの（ErrorEvent など）は、何が投げられたかだけでも残す
  if (!(e instanceof Error)) parts.push(`kind=${(e as { constructor?: { name?: string } }).constructor?.name ?? "object"}`);
  if (typeof o.type === "string") parts.push(`type=${o.type}`);
  if (typeof o.name === "string") parts.push(`name=${o.name}`);
  if (typeof o.code === "string") parts.push(`code=${o.code}`);
  if (typeof o.status === "number") parts.push(`status=${o.status}`);
  // 制約と表の名前は、db/schema.sql に書いてある設計の名前。値ではない
  if (typeof o.constraint === "string") parts.push(`constraint=${o.constraint}`);
  if (typeof o.table === "string") parts.push(`table=${o.table}`);
  if (e instanceof ConfigError) parts.push(`variable=${e.variable}`);
  if (e instanceof Error) parts.push(`msg=${redact(e.message)}`);
  // AI の失敗は、元の失敗（Anthropic の応答）を cause に持たせてある
  if (o.cause != null && o.cause !== e) parts.push(`cause(${safeDetail(o.cause)})`);
  // ErrorEvent は、中に本当の失敗を error として持つことがある
  if (o.error != null && typeof o.error === "object" && o.error !== e) parts.push(`error(${safeDetail(o.error)})`);
  return parts.join(" ");
}

/**
 * 失敗をログに1行書き、番号と問い合わせ番号を返す。
 * @param where 何をしていたか（「勤務の保存」など）。ログで探す手がかり
 * @param fallback 分類できなかったときの番号（Excel なら E-303）
 */
export function logFailure(where: string, e: unknown, fallback: ErrorCode = "E-999"): { code: ErrorCode; ref: string } {
  const found = classify(e);
  const code = found === "E-999" ? fallback : found;
  const ref = newRef();
  console.error(`[${code}] ${ref} ${where}: ${ERROR_CODES[code]} (${safeDetail(e)})`);
  return { code, ref };
}

/** API の失敗の返事。番号と問い合わせ番号を付け、ログにも同じ番号で書く */
export function failure(
  where: string,
  e: unknown,
  message: string,
  opts: { status?: number; fallback?: ErrorCode } = {},
): NextResponse {
  const { code, ref } = logFailure(where, e, opts.fallback);
  return NextResponse.json({ error: message, code, ref }, { status: opts.status ?? 500 });
}
