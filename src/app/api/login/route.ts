// ===================================================================
// F-1 ログイン：パスワードを確かめて、鍵（Cookie）を渡す
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  clearFailures,
  createSessionValue,
  isValidPassword,
  lockedSeconds,
  recordFailure,
} from "@/server/auth";
import { ConfigError, failure } from "@/server/failure";

/**
 * 総当たりを数えるときの目印。
 *
 * ⚠️ `x-forwarded-for` の**先頭**を使ってはいけない。
 *    ブラウザ側が自由に書ける値なので、毎回変えればロックを回避できる。
 *    末尾（一番手前のサーバーが付けた値）を使い、
 *    Vercel が付ける `x-real-ip` があればそちらを優先する。
 *
 * 📌 利用者は1人なので、取り違えて別の人を巻き込む心配はない。
 */
function clientKey(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",").pop()?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  // 環境変数の入れ忘れは、いちばん最初に起きる。
  // 「パスワードが違います」ではなく、原因が分かる文言を返す
  const missing = ["APP_PASSWORD", "SESSION_SECRET"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    // E-203（D-7）。どの環境変数が無いかは、ログにだけ書く
    return failure("ログイン", new ConfigError(missing.join(" / ")), "サーバーの設定が未完了です");
  }

  const key = clientKey(req);

  const wait = lockedSeconds(key);
  if (wait > 0) {
    return NextResponse.json(
      { error: `間違いが続いたため、${wait}秒お待ちください` },
      { status: 429 },
    );
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    // 本文が読めないときは、パスワード未入力と同じ扱いにする
  }

  if (!isValidPassword(password)) {
    recordFailure(key);
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  clearFailures(key);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true, // JavaScript から読めなくする
    sameSite: "lax", // 他サイトからの持ち出しを防ぐ
    secure: process.env.NODE_ENV === "production", // 手元は http なので本番だけ
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
