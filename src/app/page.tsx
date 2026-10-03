// ===================================================================
// S-3 月間一覧（メイン画面）
//
// ここはサーバー側で動く。DBから読んでから画面に渡すので、
// 「読み込み中」の空表示が出ない。
//
// 🔴 拡張1（2026-08-07）から、開く案件も URL で決まる（`?project=1`）。
//    月と同じ扱いにしてあるので、案件ごとにブックマークできる（08 §2.8 #1）。
// ===================================================================

import LoadFailed from "@/components/LoadFailed";
import MonthView from "@/components/MonthView";
import { parseYm } from "@/lib/calendar";
import { parseProjectParam } from "@/lib/urls";
import { hasApiKey } from "@/server/claude";
import { logFailure } from "@/server/failure";
import { loadLaterSavedMonths, loadMonth, loadProjects, resolveProject } from "@/server/queries";

export const dynamic = "force-dynamic"; // 毎回DBから読む

/**
 * 既定で開く月。
 * サーバーの時計は世界標準時なので、日本時間に直してから年月を取る。
 * これをしないと、日本の早朝に前月が開くことがある。
 */
function currentYearMonthJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const ym = typeof sp.ym === "string" ? parseYm(sp.ym) : null;
  const { year, month } = ym ?? currentYearMonthJST();

  let loaded;
  try {
    const project = await resolveProject(parseProjectParam(sp.project));
    // 🔴 laterMonths は B-3（2026-09-15）。この月より後ろにある保存済みの月（読むだけ）。
    //    ⚙契約条件の「先の月にも反映する（勤務や設定を入れたことがある月）」に並べる
    loaded = await Promise.all([
      loadMonth(project, year, month),
      loadProjects(),
      loadLaterSavedMonths(project.id, year, month),
    ]);
  } catch (e) {
    // D-7：開けなかった理由を番号で出し、同じ番号でログに書く
    const { code, ref } = logFailure("月間一覧の読み込み", e);
    return <LoadFailed code={code} inquiry={ref} />;
  }
  const [data, projects, laterMonths] = loaded;

  // F-10 は任意。APIキーが無い環境では、AIの入口を出さない（D-3）
  return (
    <MonthView data={data} projects={projects} laterMonths={laterMonths} aiEnabled={hasApiKey()} />
  );
}
