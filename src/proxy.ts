// ===================================================================
// 門番（F-1 / AC-1）
//
// ログインしていない人が来たら、ログイン画面へ送り返す。
// これがないと、URLを知っただけの人に勤怠が見えてしまう。
//
// 📌 ファイル名が `proxy.ts` なのは Next.js 16 の決まり。
//    以前は `middleware.ts` だったが、非推奨になった。
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "@/server/auth";

/** ログインしていなくても通してよい場所 */
const PUBLIC_PATHS = ["/login", "/api/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return NextResponse.next();

  const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  // API は画面を返しても意味がないので、401 を返す
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // 画像やCSSなど、Next.js が内部で配るファイルは通す
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
