// ===================================================================
// S-3 月間一覧の表（F-3）
//
// 列は報告サイトに寄せた並び（01_画面遷移・ユーザーフロー.md §8）。
// 勤務時間の欄は【実勤務時間】。丸まる日だけ小さく `→ 8:00` を添える（§7.7）。
// ===================================================================

import { calcDay, calcMonth, isBreakMissing } from "@/lib/calc";
import { daysIn, dowOf } from "@/lib/calendar";
import { OT_LIMIT } from "@/lib/constants";
import { toHMM } from "@/lib/time";
import type { DayKind, DayMap } from "@/lib/types";

const BADGE: Record<DayKind, string> = {
  勤務: "bg-blue-50 text-blue-700 border-blue-200",
  休日: "bg-slate-100 text-slate-500 border-slate-200",
  休暇: "bg-violet-50 text-violet-700 border-violet-200",
  祝日: "bg-rose-50 text-rose-600 border-rose-200",
};

// 🔴 いちばん右は「作業内容」。報告サイトの欄名（work_content）にそろえてある（I-3・2026-08-29）。
//    祝日名と休んだ理由も同じ列に出るが、埋まっている日のほとんどは作業内容である。
const HEAD = ["日付", "曜日", "区分", "始業", "終業", "休憩", "勤務", "残業", "場所", "作業内容"];

const Dash = () => <span className="text-ads-dim">―</span>;

export default function MonthTable({
  year,
  month,
  days,
  baseWorkMinutes,
  errorDays,
  warnDays,
  onPickDay,
}: {
  year: number;
  month: number;
  days: DayMap;
  baseWorkMinutes: number;
  /** 🔴 必須の指摘がある日。行を赤くする（F-4） */
  errorDays: Set<number>;
  /** ⚠️ 確認の指摘がある日。行を黄色くする（F-4） */
  warnDays: Set<number>;
  /** 行をクリックしたとき。M-1 日次編集モーダルを開く */
  onPickDay: (day: number) => void;
}) {
  const total = calcMonth(year, month, days, baseWorkMinutes);
  const otOver = total.ot > OT_LIMIT;
  const last = daysIn(year, month);

  return (
    <div className="bg-white border border-ads-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-ads-border">
        <span className="text-sm font-bold text-slate-900">
          {year}年{month}月の勤務
        </span>
      </div>

      <div className="overflow-x-auto">
        {/*
          🔴 `table-fixed` ＋ `colgroup` で列の幅を決める（2026-08-29 段木さんの指摘）。

             既定（`table-auto`）だと、ブラウザが中身の長さを見て毎回幅を決め直す。
             そのため「作業内容」が長い月と短い月で、日付や区分の位置がずれていた。
             8月（月次報告書作成、IP設定変更作業…）と9月（通常業務）で
             実際に見た目が変わっていた。

             ⚠️ 幅を固定すると、はみ出した文字は消える。
                そこで作業内容の列だけ折り返す（`whitespace-normal`）。
                行は高くなるが、**全文が読める**ほうを採った。

          🔴 `<col />` の後ろに空白を入れない（B-4・2026-09-15）。
             もとは `<col />` と列名のコメントのあいだに空白が1文字あり、
             それが <colgroup> の中に「文字」として残っていた。
             <colgroup> の中には文字を置けないので、React が警告を出し、
             手元の画面の左下に「1 Issue」が出たままになっていた。
             MonthTable.colgroup.test.tsx が見張っている。
        */}
        <table className="w-full table-fixed text-sm whitespace-nowrap">
          <colgroup>
            <col className="w-[60px]" />{/* 日付 */}
            <col className="w-[56px]" />{/* 曜日 */}
            <col className="w-[76px]" />{/* 区分 */}
            <col className="w-[80px]" />{/* 始業 */}
            <col className="w-[80px]" />{/* 終業 */}
            <col className="w-[80px]" />{/* 休憩 */}
            <col className="w-[80px]" />{/* 勤務 */}
            <col className="w-[80px]" />{/* 残業 */}
            <col className="w-[76px]" />{/* 場所 */}
            <col />{/* 作業内容：余った幅を全部使う */}
          </colgroup>
          <thead>
            <tr className="bg-ads-surface text-[11px] font-bold text-ads-muted text-left">
              {HEAD.map((h) => (
                <th key={h} className="px-3 py-2 first:px-4 last:px-4 font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-ads-border/70">
            {Array.from({ length: last }, (_, i) => i + 1).map((d) => {
              const day = days[d];
              const dow = dowOf(year, month, d);
              const kind = day?.kind;
              // 勤務の日だけを別の名前で持つ。こうしておくと時刻の欄で毎回 day を確かめずに済む
              const work = day && day.kind === "勤務" ? day : null;
              const off = !work;
              const c = calcDay(day, baseWorkMinutes);

              const dowCls =
                dow === "土" ? "text-blue-500" : dow === "日" ? "text-rose-500" : "text-ads-muted";

              const isErr = errorDays.has(d);
              const isWarn = warnDays.has(d);

              // 赤（必須）→ 黄（確認）→ 休みの灰色 の順に強い
              const rowCls = isErr
                  ? "bg-rose-50 hover:bg-rose-100"
                  : isWarn
                    ? "bg-amber-50 hover:bg-amber-100"
                    : off
                      ? "bg-ads-surface/60 text-ads-dim hover:bg-ads-hover"
                      : "hover:bg-blue-50/50";

              return (
                <tr key={d} onClick={() => onPickDay(d)} className={`cursor-pointer ${rowCls}`}>
                  <td className="px-4 py-2 tabular-nums">
                    {isErr && <span className="mr-1">🔴</span>}
                    {isWarn && !isErr && <span className="mr-1">⚠</span>}
                    {d}
                  </td>
                  <td className={`px-3 py-2 ${dowCls}`}>{dow}</td>
                  <td className="px-3 py-2">
                    {kind ? (
                      <span
                        className={`inline-block text-[10px] font-bold border rounded px-1.5 py-0.5 ${BADGE[kind]}`}
                      >
                        {kind}
                      </span>
                    ) : (
                      <span className="inline-block text-[10px] font-bold border border-dashed border-ads-border text-ads-dim rounded px-1.5 py-0.5">
                        未設定
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{work ? work.startAt : <Dash />}</td>
                  <td className="px-3 py-2 tabular-nums">{work ? work.endAt : <Dash />}</td>
                  {/* 🔴 「未入力」を出すかは isBreakMissing だけが決める（I-5）。
                        6:00 以下の勤務（午後休など）で休憩が空なら、ただの「―」 */}
                  <td className="px-3 py-2 tabular-nums">
                    {!work ? (
                      <Dash />
                    ) : isBreakMissing(work) ? (
                      <span className="font-bold text-amber-700">未入力</span>
                    ) : (
                      work.breakAt || <Dash />
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {c.work == null ? (
                      <Dash />
                    ) : c.work !== c.bill ? (
                      <>
                        {toHMM(c.work)}{" "}
                        <span className="text-[10px] text-ads-muted">→ {toHMM(c.bill)}</span>
                      </>
                    ) : (
                      toHMM(c.work)
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {c.ot == null ? (
                      <Dash />
                    ) : c.ot > 0 ? (
                      <span className="font-bold text-amber-600">{toHMM(c.ot)}</span>
                    ) : (
                      "0:00"
                    )}
                  </td>
                  <td className="px-3 py-2">{work ? work.place : <Dash />}</td>
                  {/* 🔴 この列だけ折り返す。幅を固定したので、折り返さないと文字が消える */}
                  <td
                    className={`px-4 py-2 whitespace-normal break-words ${off ? "" : "text-slate-600"}`}
                  >
                    {day?.note || (off ? <Dash /> : "")}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="bg-ads-surface font-bold text-slate-900">
              <td className="px-4 py-3" colSpan={6}>
                合計（作業日数 {total.days}日）
                {total.errorDays.length > 0 && (
                  <span className="font-normal text-[11px] text-ads-muted">
                    （{total.errorDays.map((d) => `${month}/${d}`).join("・")} は計算できないため未算入）
                  </span>
                )}
                {total.rounded && (
                  <span className="font-normal text-[11px] text-ads-muted">
                    　※ 実 {toHMM(total.work)} → 精算 {toHMM(total.bill)}（15分単位）
                  </span>
                )}
              </td>
              <td className="px-3 py-3 tabular-nums">{toHMM(total.work)}</td>
              <td className={`px-3 py-3 tabular-nums ${otOver ? "text-rose-500" : ""}`}>
                {toHMM(total.ot)}
              </td>
              <td className="px-3 py-3" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
