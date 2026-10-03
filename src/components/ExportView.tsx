"use client";

// ===================================================================
// S-4 出力・コピー用（F-5 / F-6）
//
// ① Excel をダウンロードする
// ② 報告サイトに転記する（同じ列順・同じ行順で並べる）
//
// ⚠️ この画面の狙いは「打つ手間を消すこと」ではなく
//    「思い出す・探す手間を消すこと」。
//    HTMLの入力欄には表を一括貼り付けできないため、打つ手間は残る。
// ===================================================================

import { ArrowLeft, Copy, FileSpreadsheet, Info, Lock, Square, SquareCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ExtensionHint from "@/components/ExtensionHint";
import Toast from "@/components/Toast";
import { calcMonth } from "@/lib/calc";
import { daysIn, dowOf, ymKey } from "@/lib/calendar";
import { hasBlockingError, runChecks } from "@/lib/checks";
import { workbookFileName } from "@/lib/filename";
import { toHMM } from "@/lib/time";
import type { MonthData } from "@/lib/types";
import { excelApi, monthHref } from "@/lib/urls";

/**
 * 押すとコピーできるセル。
 *
 * 🔴 ここは必ず `ExportView` の外に置く（2026-08-29・B-1 と同じ理由）。
 *
 *    中に置くと、親が描き直されるたびに作り直される。
 *    この部品には入力欄が無いので日本語入力は壊れないが、
 *    押した直後のフォーカスが途切れる。
 *    何より、**同じ書き方が別の場所で入力欄を壊す**。
 *
 *    経緯: docs/md/90_不具合と改善/90_不具合と改善の履歴.md の B-1
 *    再発は scripts/check-nested-components.mjs が止める。
 */
function CopyCell({
  value,
  onCopy,
}: {
  value: string | null | undefined;
  onCopy: (v: string) => void;
}) {
  if (!value) return <span className="text-ads-dim">―</span>;
  return (
    <button
      onClick={() => onCopy(value)}
      className="inline-flex items-center gap-1.5 border border-transparent hover:border-ads-accent hover:bg-ads-accent/5 rounded px-1.5 py-0.5"
    >
      <span>{value}</span>
      <Copy className="w-3 h-3 text-ads-dim" />
    </button>
  );
}

export default function ExportView({ data }: { data: MonthData }) {
  const { projectId, projectName, year, month, days, contract, baseWorkMinutes } = data;
  const total = calcMonth(year, month, days, baseWorkMinutes);

  // 🔴 この画面でも判定する。
  //    S-3 の「出力へ」を灰色にするだけでは、URLを直接開いたり
  //    ブラウザの戻る・ブックマークで、ここに入れてしまう。
  //    その状態で出すと、矛盾した日がマイナスの時間として合計に混ざる
  const blocked = hasBlockingError(
    runChecks({ year, month, days, contract, baseWorkMinutes }),
  );
  const [copied, setCopied] = useState<Record<number, boolean>>({}); // 転記済みの目印
  const [toast, setToast] = useState("");

  const last = daysIn(year, month);
  const workDays = Array.from({ length: last }, (_, i) => i + 1).filter(
    (d) => days[d]?.kind === "勤務",
  );
  const doneCount = workDays.filter((d) => copied[d]).length;

  // ブラウザ拡張（F-7）が読む値。画面に出ているものと同じ。
  // 🔴 単価・見込み金額・契約時間は入れない（02_基本設計/07_ブラウザ拡張設計.md §6.2）
  const transfer = JSON.stringify({
    ym: ymKey(year, month),
    days: workDays.map((d) => ({
      day: d,
      startAt: days[d]?.startAt ?? "",
      endAt: days[d]?.endAt ?? "",
      breakAt: days[d]?.breakAt ?? "",
      note: days[d]?.note ?? "",
    })),
  });

  function copy(v: string) {
    navigator.clipboard?.writeText(v);
    setToast(`「${v}」をコピーしました`);
  }

  return (
    <>
      <header className="bg-white border-b border-ads-border px-5 h-14 flex items-center justify-between gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-ads-accent" />
          <span className="font-black text-slate-900">AutoPunch</span>
          <span className="text-sm text-ads-muted">
            {/* 🔴 どの案件を出力しようとしているかを、必ず見せる。
                出す直前がいちばん取り違えの起きる場面なので、ここは1件でも省かない */}
            {projectName} ／ {year}年 {month}月 の出力
          </span>
        </div>
        <Link
          href={monthHref(projectId, year, month)}
          className="flex items-center gap-1.5 text-xs font-bold text-ads-muted hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          一覧に戻る
        </Link>
      </header>

      <main className="flex-1 px-5 py-5 flex flex-col gap-6 max-w-5xl w-full mx-auto">
        {blocked && (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-xl px-5 py-3 flex items-start gap-3">
            <Lock className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-rose-800">
                修正が必要な項目があるため、出力できません
              </div>
              <div className="text-[11px] text-rose-700 mt-0.5">
                時刻が矛盾している日があります。矛盾したまま出すと、その日がマイナスの時間として合計に混ざります。
                <Link href={monthHref(projectId, year, month)} className="font-bold underline ml-1">
                  一覧に戻って直す
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ① Excel */}
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-2">① Excel をダウンロード</h2>
          <div className="bg-white border border-ads-border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                {/* 実際に落ちてくる名前と同じものを出す（lib/filename.ts に一本化） */}
                {workbookFileName(projectName, year, month)}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ads-muted">
                <span>
                  作業日数 <strong className="text-slate-700">{total.days}日</strong>
                </span>
                <span>
                  勤務時間 <strong className="text-slate-700">{toHMM(total.work)}</strong>
                </span>
                <span>
                  残業時間 <strong className="text-slate-700">{toHMM(total.ot)}</strong>
                </span>
                {/* 差があるときだけ精算時間を添える */}
                {total.rounded && (
                  <span>
                    精算時間 <strong className="text-slate-700">{toHMM(total.bill)}</strong>
                    （15分単位）
                  </span>
                )}
              </div>
            </div>
            {blocked ? (
              <span
                title="修正が必要な項目があるためダウンロードできません"
                className="bg-slate-200 text-slate-400 text-sm font-bold px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 flex-shrink-0 cursor-not-allowed"
              >
                <Lock className="w-4 h-4" />
                ダウンロード
              </span>
            ) : (
              <a
                href={excelApi(projectId, year, month)}
                className="bg-ads-accent hover:bg-ads-accent-light text-white text-sm font-bold px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 flex-shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                ダウンロード
              </a>
            )}
          </div>
        </section>

        {/* ② 転記支援 */}
        <section>
          <h2 className="text-sm font-bold text-slate-900 mb-1">② 報告サイトに転記する</h2>
          <p className="text-xs text-ads-muted mb-2">
            報告サイトの作業報告書を開いて、左から順に写してください。
            <span className="text-ads-dim">※同じ列順で並べています</span>
          </p>

          {/* 拡張を入れている人向けの案内（I-6）。入れていない人は読み飛ばせる書き方にしてある */}
          <ExtensionHint />

          {/* 🔴 ブラウザ拡張（F-7）が読む値の受け渡し口。
              拡張は画面には何も足さない（拡張機能のボタンから開く形）。
              入っていなければ、ただの空要素として無視される */}
          <div id="autopunch-transfer" hidden data-payload={transfer} />

          <div className="bg-white border border-ads-border rounded-xl overflow-hidden">
            <div className="px-5 py-2 bg-ads-surface border-b border-ads-border flex items-center justify-between gap-3">
              <span className="text-[11px] text-ads-muted">
                転記済み <strong className="text-slate-700">{doneCount}</strong> / {workDays.length}日
              </span>
              <span className="text-[11px] text-ads-dim">値を押すとコピーできます</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-ads-surface text-[11px] font-bold text-ads-muted text-left">
                    {["済", "日付", "開始", "終了", "休憩", "作業内容"].map((h) => (
                      <th key={h} className="px-4 py-2 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ads-border/70">
                  {Array.from({ length: last }, (_, i) => i + 1).map((d) => {
                    const day = days[d];
                    const work = day?.kind === "勤務" ? day : null;
                    const dow = dowOf(year, month, d);
                    const dowCls =
                      dow === "土" ? "text-blue-500" : dow === "日" ? "text-rose-500" : "text-ads-muted";
                    const done = copied[d];

                    return (
                      <tr
                        key={d}
                        className={
                          !work
                            ? "bg-ads-surface/60 text-ads-dim"
                            : done
                              ? "bg-emerald-50/50"
                              : "hover:bg-blue-50/40"
                        }
                      >
                        <td className="px-4 py-2">
                          <div className="flex justify-center">
                            {work ? (
                              <button
                                onClick={() => setCopied((c) => ({ ...c, [d]: !c[d] }))}
                                aria-label={done ? "転記済みを取り消す" : "転記済みにする"}
                                className={done ? "text-emerald-500" : "text-ads-dim"}
                              >
                                {done ? (
                                  <SquareCheck className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            ) : (
                              <span className="text-ads-dim">―</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {String(month).padStart(2, "0")}/{String(d).padStart(2, "0")}{" "}
                          <span className={dowCls}>({dow})</span>
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {work ? <CopyCell value={work.startAt} onCopy={copy} /> : <span className="text-ads-dim">―</span>}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {work ? <CopyCell value={work.endAt} onCopy={copy} /> : <span className="text-ads-dim">―</span>}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {work ? <CopyCell value={work.breakAt} onCopy={copy} /> : <span className="text-ads-dim">―</span>}
                        </td>
                        <td className="px-4 py-2 text-slate-600">
                          {work ? (
                            <CopyCell value={work.note} onCopy={copy} />
                          ) : (
                            <span className="text-ads-dim">{day?.note || "―"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-ads-muted flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            作業時間・立替金は報告サイト側で自動計算されるため、入力は不要です。
            転記済みの目印は、この画面を開いている間だけ覚えています。
          </p>
        </section>
      </main>

      <Toast message={toast} onDone={() => setToast("")} />
    </>
  );
}
