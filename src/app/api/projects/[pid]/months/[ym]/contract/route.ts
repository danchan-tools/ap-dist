// ===================================================================
// F-9 契約条件の保存（02_データ設計 §5.4）＋ 基準労働時間
//
// 🔴 拡張1（2026-08-07）で、基準労働時間も【月ごと】になった。
//    それまでは settings テーブル（全期間で共通）にあり、2つの文を
//    トランザクションで囲む必要があったが、いまは months の1文で済む。
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { parseYm, ymKey } from "@/lib/calendar";
import { parseCarryTargets } from "@/lib/carryOver";
import { failure } from "@/server/failure";
import { ensureMonth, saveContract } from "@/server/queries";
import { isReadOnly, requireProject } from "@/server/route-helpers";

export const runtime = "nodejs";

/** 上限（Postgres の INTEGER と、現実的な金額の両方に収まる値） */
const MAX_VALUE = 100_000_000;

/**
 * 0以上の整数か。
 *
 * ⚠️ `Number(v)` だけで判定してはいけない。
 *    `null` `""` `[]` はすべて 0 になり、**単価が黙って 0 で保存される**。
 *    `true` は 1、`"0x10"` は 16 になる。
 *    さらに `Number.isInteger(1e21)` は true なので、DBの範囲を超えて 500 になる。
 */
function nonNegativeInt(v: unknown): number | null {
  const n =
    typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_VALUE ? n : null;
}

/**
 * 空欄を許す数値（拡張2・08 §3.3 ②）。
 *
 * 🔴 上の `nonNegativeInt()` は「空欄」も「不正な値」も同じ `null` を返す。
 *    下限・上限が必須だったころは、どちらも 400 でよかったので困らなかった。
 *    任意にした以上、**この2つを分けないと「あいうえお」が「未入力」として通る。**
 *
 *   `{ ok: false }`          … 不正な値（400 を返す）
 *   `{ ok: true, value: null }` … 空欄（未入力として保存する）
 */
type Optional = { ok: true; value: number | null } | { ok: false };

function optionalInt(v: unknown): Optional {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    return { ok: true, value: null };
  }
  const n = nonNegativeInt(v);
  return n === null ? { ok: false } : { ok: true, value: n };
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/projects/[pid]/months/[ym]/contract">,
) {
  const { pid, ym } = await ctx.params;

  const got = await requireProject(pid);
  if ("response" in got) return got.response;
  const { project } = got;
  if (isReadOnly(project)) {
    return NextResponse.json({ error: "隠している案件は書き換えられません" }, { status: 403 });
  }

  const parsed = parseYm(ym);
  if (!parsed) return NextResponse.json({ error: "年月の指定が正しくありません" }, { status: 400 });
  const { year, month } = parsed;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "入力を読み取れませんでした" }, { status: 400 });

  // 🔴 契約の種類（拡張2）。知らない値は弾く。
  //    既定を「月額」にしない。送り忘れを黙って月額として保存すると、
  //    時給契約が保存のたびに月額へ戻る（§3.3 ① と同じ事故が別経路で起きる）
  const kind = body.kind;
  if (kind !== "月額" && kind !== "時給") {
    return NextResponse.json({ error: "契約の種類が正しくありません" }, { status: 400 });
  }
  const hourly = kind === "時給";

  // 🔴 稼働時間は【時間】で受け取り、ここで分に直す。
  //    DBは分で持つが、画面が入力するのは時間。
  //    どちらの単位で渡すかを名前で示しておかないと、
  //    140 を分として保存して「2時間20分の契約」になり、金額が静かに壊れる。
  const loRaw = optionalInt(body.loHours);
  const hiRaw = optionalInt(body.hiHours);
  if (!loRaw.ok || !hiRaw.ok) {
    return NextResponse.json({ error: "契約時間は数値で入力してください" }, { status: 400 });
  }
  const loHours = loRaw.value;
  const hiHours = hiRaw.value;
  const lo = loHours === null ? null : loHours * 60;
  const hi = hiHours === null ? null : hiHours * 60;

  const base = nonNegativeInt(body.base);
  const underRate = nonNegativeInt(body.underRate);
  const overRate = nonNegativeInt(body.overRate);
  const hourlyRate = nonNegativeInt(body.hourlyRate);
  const baseWorkMinutes = nonNegativeInt(body.baseWorkMinutes);

  if (
    base === null ||
    underRate === null ||
    overRate === null ||
    hourlyRate === null // 時給は 0 を許す（＝まだ入れていない。C-6 が見張る）
  ) {
    return NextResponse.json({ error: "数値で入力してください" }, { status: 400 });
  }

  // §7.5 入力チェック。🔴 DBの months_contract_range と同じ条件にしてある
  if (!hourly && (lo === null || hi === null)) {
    return NextResponse.json(
      { error: "月額契約では、下限と上限の両方を入力してください" },
      { status: 400 },
    );
  }
  // 🔴 「入っているなら 0 より大きい」。
  //    ここを緩めると「空」と「0」の2通りで未入力を表せてしまう（§3.3 ②）
  if (lo !== null && lo <= 0) {
    return NextResponse.json({ error: "下限は 1 以上にしてください" }, { status: 400 });
  }
  if (hi !== null && hi <= 0) {
    return NextResponse.json({ error: "上限は 1 以上にしてください" }, { status: 400 });
  }
  // 両方とも入っているときだけ、大小を見る
  if (lo !== null && hi !== null && hi <= lo) {
    return NextResponse.json({ error: "上限は下限より大きい値にしてください" }, { status: 400 });
  }

  // 1か月に存在しない時間数は受け付けない
  // 🔴 下限にも同じ検査をする（2026-08-08）。
  //    もとは上限にしか無く、上限を空にできる時給契約では
  //    下限に 999999 のような値を保存できてしまった。
  //    金額は変わらないが、C-4 が「あと 999859:00 必要」と鳴り続ける。
  const MAX_HOURS = 31 * 24;
  if (loHours !== null && loHours > MAX_HOURS) {
    return NextResponse.json({ error: "下限が1か月の時間数を超えています" }, { status: 400 });
  }
  if (hiHours !== null && hiHours > MAX_HOURS) {
    return NextResponse.json({ error: "上限が1か月の時間数を超えています" }, { status: 400 });
  }
  if (baseWorkMinutes === null || baseWorkMinutes <= 0) {
    return NextResponse.json({ error: "基準労働時間を正しく入力してください" }, { status: 400 });
  }

  // 🔴 B-3（2026-09-15）：先の月（勤務や設定を入れたことがある月）にも反映する。
  //    この月と同じ月・前の月が1つでも混ざっていたら、何も保存しない。
  //    前の月の設定が変わると、提出済みの金額が後から変わるため（03_業務ロジック設計 §7.4）
  const carry = parseCarryTargets(body.carryTo, { year, month });
  if (!carry.ok) {
    return NextResponse.json({ error: "反映する月の指定が正しくありません" }, { status: 400 });
  }

  try {
    await ensureMonth(project.id, year, month); // その月の行が無ければ作る
    const carried = await saveContract(
      project.id,
      year,
      month,
      { kind, lo, hi, base, underRate, overRate, hourlyRate },
      baseWorkMinutes,
      carry.months,
    );
    // 実際に書き込めた先の月を返す。画面の「〇月にも反映しました」は、頼んだ月ではなくこちらで出す
    return NextResponse.json({ ok: true, carried: carried.map((m) => ymKey(m.year, m.month)) });
  } catch (e) {
    return failure("契約条件の保存", e, "保存できませんでした");
  }
}
