// ===================================================================
// F-2 営業日すべてに反映する
//
// 展開ルール（03_業務ロジック設計 §4）はサーバー側で組み立てる。
// 祝日表がコードの中（lib/holidays.ts）にあるため、
// ブラウザから31日ぶんを送らせる必要がない。
//
// 🔴 拡張1（2026-08-07）でURLに案件が入った。
//    この操作は【その案件のその月だけ】を置き換える。
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { expandPattern } from "@/lib/apply";
import { parseYm } from "@/lib/calendar";
import { END_TIME_RE, PLACES, TIME_RE } from "@/lib/constants";
import type { Pattern } from "@/lib/types";
import { failure } from "@/server/failure";
import { applyPattern, ensureMonth } from "@/server/queries";
import { isReadOnly, requireProject } from "@/server/route-helpers";

// exceljs や pg は Edge では動かないので、Node.js 側で動かす
export const runtime = "nodejs";

function parsePattern(input: unknown): Pattern | null {
  if (typeof input !== "object" || input === null) return null;
  const p = input as Record<string, unknown>;
  const { start, end, brk, place } = p;

  if (typeof start !== "string" || !TIME_RE.test(start)) return null;
  // 終了だけ 29:59 まで許す（夜勤を 26:00 と書くため）
  if (typeof end !== "string" || !END_TIME_RE.test(end)) return null;
  if (typeof brk !== "string" || !TIME_RE.test(brk)) return null;
  if (typeof place !== "string" || !PLACES.includes(place)) return null;

  return { start, end, brk, place };
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/projects/[pid]/months/[ym]/apply">,
) {
  const { pid, ym } = await ctx.params;

  const got = await requireProject(pid);
  if ("response" in got) return got.response;
  const { project } = got;
  if (isReadOnly(project)) {
    return NextResponse.json({ error: "隠している案件は書き換えられません" }, { status: 403 });
  }

  const parsed = parseYm(ym);
  if (!parsed) {
    return NextResponse.json({ error: "年月の指定が正しくありません" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const pattern = parsePattern((body as Record<string, unknown> | null)?.pattern);
  if (!pattern) {
    return NextResponse.json({ error: "基本パターンの入力が正しくありません" }, { status: 400 });
  }

  const { year, month } = parsed;
  try {
    await ensureMonth(project.id, year, month); // days は months を参照するので先に用意する
    await applyPattern(project.id, year, month, pattern, expandPattern(year, month, pattern));
  } catch (e) {
    return failure("営業日すべてに反映", e, "保存できませんでした");
  }

  return NextResponse.json({ ok: true });
}
