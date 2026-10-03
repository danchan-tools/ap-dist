// ===================================================================
// S-4 出力・コピー用（F-5 / F-6）
//
// 🔴 拡張1（2026-08-07）から、開く案件も URL で決まる（`?project=1`）。
// ===================================================================

import ExportView from "@/components/ExportView";
import LoadFailed from "@/components/LoadFailed";
import { parseYm } from "@/lib/calendar";
import { parseProjectParam } from "@/lib/urls";
import { logFailure } from "@/server/failure";
import { loadMonth, resolveProject } from "@/server/queries";

export const dynamic = "force-dynamic";

function currentYearMonthJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 };
}

export default async function ExportPage({ searchParams }: PageProps<"/export">) {
  const sp = await searchParams;
  const ym = typeof sp.ym === "string" ? parseYm(sp.ym) : null;
  const { year, month } = ym ?? currentYearMonthJST();

  let data;
  try {
    const project = await resolveProject(parseProjectParam(sp.project));
    data = await loadMonth(project, year, month);
  } catch (e) {
    // D-7：開けなかった理由を番号で出し、同じ番号でログに書く
    const { code, ref } = logFailure("出力画面の読み込み", e);
    return <LoadFailed code={code} inquiry={ref} />;
  }

  return <ExportView data={data} />;
}
