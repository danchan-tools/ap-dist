// ===================================================================
// F-10 AIに聞く（02_基本設計/06_AIアシスタント設計.md §6.1）
//
// 🔴 このAPIは【DBに書き込まない】。
//    読み取り（assist）と保存（PATCH /days）を分けてあるのは、
//    「AIが返した瞬間に保存される」形になるのを、APIの形の時点で防ぐため。
//
// 📌 隠した案件でも呼べる。DBに書かないので、過去を見返しながら聞ける
//    （保存する PATCH /days のほうで止まる）。
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { buildAssistInput, TEXT_LIMIT, trimHistory, validateReply } from "@/lib/assist";
import { parseYm } from "@/lib/calendar";
import { AssistError, askAssistant, hasApiKey } from "@/server/claude";
import { failure, logFailure } from "@/server/failure";
import { loadMonth } from "@/server/queries";
import { requireProject } from "@/server/route-helpers";

// SDK は Edge では動かないので Node.js 側で動かす
export const runtime = "nodejs";

/** 'YYYY-MM-DD'。「今週」の判定に使う（§5.1） */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/projects/[pid]/months/[ym]/assist">,
) {
  const { pid, ym } = await ctx.params;

  const got = await requireProject(pid);
  if ("response" in got) return got.response;
  const { project } = got;

  const parsed = parseYm(ym);
  if (!parsed) {
    return NextResponse.json({ error: "年月の指定が正しくありません" }, { status: 400 });
  }
  const { year, month } = parsed;

  // 鍵が無いことは、通信する前に分かる。無駄に待たせない（§10）
  if (!hasApiKey()) {
    return NextResponse.json(
      // E-301（D-7）。失敗ではなく設定の状態なので、ログには書かない
      { error: "AIの設定がされていません。行をクリックすれば手で直せます", code: "E-301" },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "やりたいことを入力してください" }, { status: 400 });
  }
  if (text.length > TEXT_LIMIT) {
    return NextResponse.json({ error: `${TEXT_LIMIT}文字までにしてください` }, { status: 400 });
  }
  const history = trimHistory(body?.history);

  // 🔴 その月のデータは【サーバー側で読む】。ブラウザから送らせない（§6.1）
  //    送らせると、改ざんされた勤務表をAIに読ませられてしまう
  let data;
  try {
    data = await loadMonth(project, year, month);
  } catch (e) {
    return failure("AIへの問い合わせ（勤務表の読み込み）", e, "勤務表を読み込めませんでした");
  }

  // 🔴 単価・見込み金額・契約時間は渡さない（§5.2）。
  //    `data.contract` は、この先ひとつも使わない。
  //    案件名も渡さない（取引先の実名が入りうるため）
  const monthText = buildAssistInput({
    year,
    month,
    days: data.days,
    baseWorkMinutes: data.baseWorkMinutes,
    today: todayKey(),
  });

  try {
    const raw = await askAssistant({ text, history, monthText });
    // AIを信じない。10項目の検証を通す（§9）
    const reply = validateReply(year, month, data.days, raw, data.baseWorkMinutes);
    return NextResponse.json(reply);
  } catch (e) {
    if (e instanceof AssistError) {
      // 番号が無いもの（「この内容には答えられませんでした」など）は、文だけで次の手が分かる
      if (!e.code) return NextResponse.json({ error: e.message }, { status: e.status });
      const { code, ref } = logFailure("AIへの問い合わせ", e);
      return NextResponse.json({ error: e.message, code, ref }, { status: e.status });
    }
    return failure("AIへの問い合わせ", e, "AIにつながりませんでした", { status: 502 });
  }
}
