// ===================================================================
// P-2 見込み金額カード（F-9・03_業務ロジック設計 §7）
//
// 「下限を切るとまずい」を、時間ではなく【金額】で見せるためのカード。
// 「あと 2:30 足りません」より「このままだと 10,713円 減ります」のほうが行動につながる。
//
// 🔴 計算に使うのは【精算時間】（各日を15分へ丸めた合計）。実勤務時間ではない（§7.7）。
// ⚠️ 単価は機密。発表資料・図解URLには実額を載せない。
// ===================================================================

import { ArrowRight, CornerDownRight, Clock, JapaneseYen, Settings2 } from "lucide-react";
import type { MonthCalc } from "@/lib/calc";
import { calcMoney, hasRate } from "@/lib/money";
import { toHMM, yen } from "@/lib/time";
import type { Contract } from "@/lib/types";

export default function MoneyCard({
  total,
  contract,
  noData,
  onOpenSettings,
}: {
  total: MonthCalc;
  contract: Contract;
  /** まだ1日も入力がない月。判定すると「不足140時間ぶんの減額」が引かれてしまう */
  noData: boolean;
  onOpenSettings: () => void;
}) {
  const money = calcMoney(total.bill, contract);
  const hourly = contract.kind === "時給";
  // 契約条件をまだ入れていない月。数字を出すと「¥0・赤枠」になり、
  // 本当に0円だと誤解される。未入力の月と同じ扱いにする
  //
  // 🔴 見るところが契約の種類で違う（08 §3.3 ⑤）。判定は `hasRate()` に集めてある。
  //    ここで `contract.base === 0` と書くと、時給契約は基本単価が 0 のままなので
  //    **入力もチェックも正常なのに、金額だけ永久に「―」**になる。
  const noRate = !hasRate(contract);
  // 🔴 入力ゼロの月の扱いも、契約の種類で違う（08 §3.3 ④）。
  //    月額は「不足140時間ぶんの減額」が引かれるので出さない。
  //    時給は働いていないぶん 0 円が正解なので、単価さえ入っていれば出す。
  const noAmount = hourly ? noRate : noData || noRate;

  const tone = noAmount
    ? ["border-ads-border", "text-ads-dim", "bg-ads-surface"]
    : money.state === "short"
      ? ["border-rose-400", "text-rose-600", "bg-rose-50"]
      : money.state === "excess"
        ? ["border-amber-300", "text-amber-700", "bg-amber-50"]
        : // 🔴 範囲を設定していない時給契約を緑にしない（08 §3.4）。
          //    緑は「契約時間の範囲に収まっている」という意味を持たせてある色。
          //    範囲が無い月に出すと、ありもしない判定に合格したように見える。
          money.state === "hourly"
          ? ["border-ads-border", "text-slate-900", "bg-ads-surface"]
          : ["border-emerald-300", "text-emerald-700", "bg-emerald-50"];

  return (
    <section className={`bg-white border-2 ${tone[0]} rounded-xl overflow-hidden`}>
      <div
        className={`${tone[2]} px-5 py-2 flex items-center justify-between gap-3 border-b ${tone[0]}`}
      >
        <div className="flex items-center gap-2">
          <JapaneseYen className={`w-4 h-4 ${tone[1]}`} />
          <span className="text-sm font-bold text-slate-900">今月の見込み金額</span>
        </div>
        <button
          onClick={onOpenSettings}
          className="text-[11px] font-bold text-ads-muted hover:text-slate-900 flex items-center gap-1"
        >
          <Settings2 className="w-3.5 h-3.5" />
          契約条件を変更
        </button>
      </div>

      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-baseline gap-3 flex-shrink-0">
          {/* 増減があるときだけ「基本単価 → 見込み金額」を並べる。
              🔴 時給契約は基本単価が無いので出さない（0円からの矢印になってしまう） */}
          {!noAmount && !hourly && money.total !== money.base && (
            <>
              <span className="text-lg font-bold text-ads-dim line-through tabular-nums">
                {yen(money.base)}
              </span>
              <ArrowRight className="w-4 h-4 text-ads-dim self-center" />
            </>
          )}
          <span className={`text-3xl font-black tabular-nums ${tone[1]}`}>
            {noAmount ? "―" : yen(money.total)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:ml-auto sm:justify-end">
          {noRate ? (
            <span className="text-ads-muted">
              {hourly
                ? "時給がまだ入っていません。「契約条件を変更」から入力してください"
                : "契約の単価がまだ入っていません。「契約条件を変更」から入力してください"}
            </span>
          ) : hourly ? (
            /* 🔴 時給契約の内訳は「精算時間 × 時給」（08 §3.4）。
                  減額・増額の仕組みが無いので、その2つは出さない。
                  入力ゼロの月も 0円が正解なので、そのまま出す（§3.3 ④） */
            <span className="text-slate-700 font-bold">
              精算 {toHMM(total.bill)} × {yen(contract.hourlyRate)}/時 = {yen(money.total)}
            </span>
          ) : noData ? (
            <span className="text-ads-muted">
              「営業日すべてに反映する」を押すと、見込み金額を計算します
            </span>
          ) : (
            <>
              <span className="text-slate-700">基本 {yen(money.base)}</span>
              {money.state === "short" ? (
                <span className="text-rose-600 font-bold">
                  − 不足 {toHMM(money.shortMin)} × {yen(contract.underRate)}/時 ={" "}
                  {yen(money.deduct)}
                </span>
              ) : money.state === "excess" ? (
                <span className="text-amber-700 font-bold">
                  ＋ 超過 {toHMM(money.excessMin)} × {yen(contract.overRate)}/時 = {yen(money.add)}
                </span>
              ) : (
                <span className="text-emerald-700 font-bold">増減なし（契約時間の範囲内）</span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-ads-surface px-5 py-2 text-[11px] text-ads-muted flex items-start gap-1.5 border-t border-ads-border">
        <CornerDownRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        {/* 🔴 B-3（2026-09-15）。もとは「新しい月は前の月の条件を引き継ぎます」だけで、
              保存済みの先の月には伝わらないことが読み取れなかった */}
        <span>
          単価は
          <span className="font-bold text-slate-700">月ごとに設定</span>
          します。変えた条件は先の月にも引き継がれ、前の月は変わりません。
        </span>
      </div>

      <div className="bg-ads-surface px-5 py-2 text-[11px] text-ads-muted flex items-start gap-1.5 border-t border-ads-border">
        <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          精算に使う時間は契約の定めにより
          <span className="font-bold text-slate-700">15分単位・日ごとに区切り</span>
          ます（半端は切り捨て）。
          {noData || total.days === 0
            ? ""
            : total.rounded
              ? `この月は 実 ${toHMM(total.work)} → 精算 ${toHMM(total.bill)}。`
              : "この月はすべて15分の倍数のため、丸めによる差はありません。"}
        </span>
      </div>
    </section>
  );
}
