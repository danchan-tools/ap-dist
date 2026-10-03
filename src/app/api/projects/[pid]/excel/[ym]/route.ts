// ===================================================================
// F-5 Excel のダウンロード（04_Excel出力設計.md §5.3）
//
// 🔴 exceljs は Edge ランタイムで動かない。Node.js 側で動かす。
// 🔴 ファイル名が日本語なので Content-Disposition は RFC 5987 の形にする。
//    そうしないと文字化けする。
//
// 📌 🔴エラーがあるときに出力を止める判定は【画面側】で行う（利用者が1人のため）。
//
// 📌 URL は `/api/projects/[pid]/excel/[ym]`。
//    月の下ではないが、案件の下にはあるので、ここに揃えてある（08 §2.8 #2）。
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { parseYm } from "@/lib/calendar";
import { workbookFileName } from "@/lib/filename";
import { failure } from "@/server/failure";
import { loadMonth } from "@/server/queries";
import { requireProject } from "@/server/route-helpers";
import { buildWorkbook } from "@/server/workbook";

export const runtime = "nodejs";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/projects/[pid]/excel/[ym]">,
) {
  const { pid, ym } = await ctx.params;

  const got = await requireProject(pid);
  if ("response" in got) return got.response;
  const { project } = got;

  const parsed = parseYm(ym);
  if (!parsed) return NextResponse.json({ error: "年月の指定が正しくありません" }, { status: 400 });
  const { year, month } = parsed;

  try {
    const data = await loadMonth(project, year, month);
    const bytes = await buildWorkbook(data);
    const name = workbookFileName(project.name, year, month);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": XLSX_TYPE,
        // filename* が RFC 5987。日本語のファイル名はこちらで渡す。
        // 手前の filename= は ASCII だけの控え（案件名は入れない）
        "Content-Disposition": `attachment; filename="autopunch_${year}_${String(month).padStart(2, "0")}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // データベースの失敗ならその番号（E-201 など）、それ以外は Excel を作る所の失敗（E-303）
    return failure("Excelの出力", e, "Excelを作れませんでした", { fallback: "E-303" });
  }
}
