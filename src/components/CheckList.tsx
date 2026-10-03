// ===================================================================
// F-4 チェック結果（03_業務ロジック設計 §6）
//
// 問題がない項目も「OK」として出す。
// そうしないと「チェックが動いていないだけ」なのか区別がつかない。
//
// 件数に数えるのは「必須・要対応・確認」の3つだけ。
// 「参考」は対応が要らないので数えない。
// ===================================================================

import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { Check, CheckLevel } from "@/lib/checks";
import { countAttention } from "@/lib/checks";

/** ラベル ／ バッジの色 ／ 行の背景 */
const LEVEL: Record<CheckLevel, [string, string, string]> = {
  error: ["必須", "bg-rose-500", "hover:bg-rose-50/40"],
  high: ["要対応", "bg-rose-600", "bg-rose-50 hover:bg-rose-100"],
  warn: ["確認", "bg-amber-500", "bg-amber-50/40 hover:bg-amber-50"],
  info: ["参考", "bg-slate-400", "bg-ads-surface/60"],
  ok: ["OK", "bg-emerald-500", "bg-emerald-50/30"],
};

export default function CheckList({
  checks,
  onPickDay,
}: {
  checks: Check[];
  onPickDay: (day: number) => void;
}) {
  const errors = checks.filter((c) => c.level === "error").length;
  const highs = checks.filter((c) => c.level === "high").length;
  const warns = checks.filter((c) => c.level === "warn").length;
  const attention = countAttention(checks);

  /**
   * 判定した観点の数。
   *
   * 🔴 「4つの観点」と直に書かない（2026-08-08）。
   *
   *    **4 という数は、書いた時点では正しかった。**
   *    入力のある月・祝日が確定した年・月額契約なら、判定されるのは C-1〜C-4 の4つ
   *    （C-5 は祝日が確定していない年にだけ出る）。
   *    **C-6 を足した瞬間に、時給契約の月だけ 5つになって合わなくなった。**
   *
   *    観点の数は、契約の種類・年・入力の有無で変わる。
   *    **実際に返ってきたものを数える。**そうすれば、次に増えても狂わない。
   *
   * 📌 1つの観点から複数の指摘が出ることがある（C-2 は日ごと）ので、ID で重複を除く。
   */
  const judged = new Set(checks.map((c) => c.id)).size;

  // 赤で見せるべきか（必須 か 要対応 がある）
  const serious = errors > 0 || highs > 0;

  return (
    <section
      className={`bg-white border-2 rounded-xl overflow-hidden ${
        serious ? "border-rose-300" : warns ? "border-amber-300" : "border-emerald-300"
      }`}
    >
      {attention === 0 ? (
        <div className="bg-emerald-50 px-5 py-3 flex items-center gap-3 border-b border-emerald-200">
          <span className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-bold text-emerald-800">
              チェック完了：対応が必要な項目はありません
            </div>
            <div className="text-[11px] text-emerald-700">
              {judged}つの観点すべてを判定しました
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`px-5 py-3 flex items-center gap-3 border-b ${
            serious ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"
          }`}
        >
          <span
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              serious ? "bg-rose-500/15 text-rose-600" : "bg-amber-500/15 text-amber-600"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
          </span>
          <div>
            <div className={`text-sm font-bold ${serious ? "text-rose-800" : "text-amber-800"}`}>
              確認が必要な項目が {attention}件 あります
            </div>
            <div className={`text-[11px] ${serious ? "text-rose-700" : "text-amber-700"}`}>
              {errors > 0
                ? "🔴 必須 があるとダウンロードできません"
                : highs > 0
                  ? "「要対応」は放置すると報酬が減ります"
                  : "ダウンロードはできます"}
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-ads-border/70">
        {checks.map((c, i) => (
          <div
            key={`${c.id}-${c.day ?? "month"}-${i}`}
            onClick={c.day ? () => onPickDay(c.day!) : undefined}
            className={`px-5 py-3 flex items-start gap-3 ${LEVEL[c.level][2]} ${c.day ? "cursor-pointer" : ""}`}
          >
            <span
              className={`text-[10px] font-black text-white rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5 ${LEVEL[c.level][1]}`}
            >
              {LEVEL[c.level][0]}
            </span>
            <div className="flex-1">
              <div
                className={`text-sm font-bold ${c.level === "ok" || c.level === "info" ? "text-slate-700" : "text-slate-900"}`}
              >
                {c.title}
              </div>
              <div
                className={`text-xs mt-0.5 ${c.level === "high" ? "text-rose-700 font-bold" : "text-ads-muted"}`}
              >
                {c.desc}
              </div>
            </div>
            {c.day && (
              <span className="text-[11px] font-bold text-ads-accent-light flex-shrink-0 mt-0.5">
                この日を開く →
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
