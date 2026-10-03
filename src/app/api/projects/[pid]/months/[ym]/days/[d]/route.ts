// ===================================================================
// F-3 1日分の保存（02_データ設計 §5.3）
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { daysIn, parseYm } from "@/lib/calendar";
import { END_TIME_RE, KINDS, PLACES, TIME_RE } from "@/lib/constants";
import type { Day, DayKind } from "@/lib/types";
import { failure } from "@/server/failure";
import { deleteDay, ensureMonth, saveDay } from "@/server/queries";
import { isReadOnly, requireProject } from "@/server/route-helpers";

export const runtime = "nodejs";

/** 空文字は「未入力」として null にそろえる。形が違えば undefined を返す */
function optionalTime(v: unknown, re: RegExp = TIME_RE): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !re.test(v)) return undefined; // 不正
  return v;
}

/**
 * 案件・年月・日を確かめて取り出す（PUT と DELETE で同じ）。
 *
 * 🔴 2か所に書かない。片方だけ条件を直すと、
 *    「保存はできないのに消せる日」のような穴ができる。
 */
async function resolve(params: { pid: string; ym: string; d: string }) {
  const got = await requireProject(params.pid);
  if ("response" in got) return { error: got.response };
  const { project } = got;
  if (isReadOnly(project)) {
    return {
      error: NextResponse.json({ error: "隠している案件は書き換えられません" }, { status: 403 }),
    };
  }

  const parsed = parseYm(params.ym);
  if (!parsed) {
    return { error: NextResponse.json({ error: "年月の指定が正しくありません" }, { status: 400 }) };
  }
  const { year, month } = parsed;

  const day = Number(params.d);
  if (!Number.isInteger(day) || day < 1 || day > daysIn(year, month)) {
    return { error: NextResponse.json({ error: "その月に存在しない日です" }, { status: 400 }) };
  }

  return { project, year, month, day };
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/projects/[pid]/months/[ym]/days/[d]">,
) {
  const r = await resolve(await ctx.params);
  if (r.error) return r.error;
  const { project, year, month, day } = r;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "入力を読み取れませんでした" }, { status: 400 });

  const kind = body.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as DayKind)) {
    return NextResponse.json({ error: "区分が正しくありません" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  /** 保存を1か所にまとめる。ここだけ例外処理を書けばよくなる */
  async function store(value: Day) {
    try {
      await ensureMonth(project!.id, year, month); // days は months を参照するので先に用意する
      await saveDay(project!.id, year, month, day, value);
    } catch (e) {
      return failure("1日分の保存", e, "保存できませんでした");
    }
    return NextResponse.json({ ok: true });
  }

  // 勤務以外は、時刻も場所も持たない（DBの制約に合わせる）
  if (kind !== "勤務") {
    return store({ kind: kind as DayKind, note });
  }

  const startAt = optionalTime(body.startAt);
  const endAt = optionalTime(body.endAt, END_TIME_RE); // 夜勤の 26:00 を許す
  const breakAt = optionalTime(body.breakAt);
  if (startAt === undefined || endAt === undefined || breakAt === undefined) {
    return NextResponse.json({ error: "時刻の形が正しくありません" }, { status: 400 });
  }

  // 🔴 勤務の日は開始と終了が必須（DBの days_work_has_times 制約）
  if (!startAt || !endAt) {
    return NextResponse.json({ error: "勤務の日は、開始と終了の両方が必要です" }, { status: 400 });
  }

  const place = typeof body.place === "string" && PLACES.includes(body.place) ? body.place : null;

  return store({ kind: "勤務", startAt, endAt, breakAt, place, note });
}

/**
 * 1日ぶんの記録を消す（I-2「この日をクリア」・2026-08-29）。
 *
 * 消したあと、その日は「営業日すべてに反映する」を押す前の状態に戻る。
 * 平日は空欄、土日は「休日」、祝日は「祝日」＋祝日名（読むときに補われる）。
 */
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/projects/[pid]/months/[ym]/days/[d]">,
) {
  const r = await resolve(await ctx.params);
  if (r.error) return r.error;
  const { project, year, month, day } = r;

  try {
    await deleteDay(project.id, year, month, day);
  } catch (e) {
    return failure("1日分のクリア", e, "消せませんでした");
  }
  return NextResponse.json({ ok: true });
}
