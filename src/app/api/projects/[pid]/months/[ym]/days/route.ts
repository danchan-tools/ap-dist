// ===================================================================
// 確認済みの提案を、まとめて保存する（06_AIアシスタント設計.md §6.2）
//
// 🔴 このAPIは AI 専用ではない。
//    将来「表で複数行を選んでまとめて直す」を作るときも、同じAPIを使える。
//
// 🔴 一括反映（F-2）と違い DELETE しない。送っていない日には触らない。
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { validateChanges, type RawChange } from "@/lib/assist";
import { daysIn, parseYm } from "@/lib/calendar";
import { failure } from "@/server/failure";
import { ensureMonth, loadMonth, saveDays } from "@/server/queries";
import { isReadOnly, requireProject } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/projects/[pid]/months/[ym]/days">,
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
  const { year, month } = parsed;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const days = body?.days;
  if (!Array.isArray(days) || days.length === 0) {
    return NextResponse.json({ error: "反映する内容がありません" }, { status: 400 });
  }
  // 件数の上限。その月の日数を超える指定を弾く（§6.2）
  if (days.length > daysIn(year, month)) {
    return NextResponse.json({ error: "1回に反映できる件数を超えています" }, { status: 400 });
  }

  // 🔴 画面を信用しない。§9 と同じ検証を、保存の直前にもう一度行う
  let current;
  try {
    current = await loadMonth(project, year, month);
  } catch (e) {
    return failure("AIの提案の反映（勤務表の読み込み）", e, "勤務表を読み込めませんでした");
  }

  const { changes } = validateChanges(
    year,
    month,
    current.days,
    days as RawChange[],
    // 🔴 基準労働時間は【その案件のその月】の値を使う（拡張1）
    current.baseWorkMinutes,
  );

  // 🔴 C-2 に当たる行は保存しない。矛盾したまま入れさせない
  const rows = changes.filter((c) => !c.blocked).map((c) => ({ day: c.day, ...c.next }));
  if (rows.length === 0) {
    return NextResponse.json({ error: "反映できる内容がありませんでした" }, { status: 400 });
  }

  try {
    await ensureMonth(project.id, year, month); // days は months を参照するので先に用意する
    await saveDays(project.id, year, month, rows);
  } catch (e) {
    return failure("AIの提案の反映", e, "保存できませんでした");
  }

  return NextResponse.json({ ok: true, saved: rows.length });
}
