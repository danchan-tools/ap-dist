"use client";

// ===================================================================
// スクロール中に合計を残す1行バー（未対応の課題 #8）
//
// 表を下にスクロールすると、サマリー4枚と見込み金額カードが画面から消える。
// 日を直しているあいだに「いま何時間か・下限に届いているか」を見失うので、
// サマリーが隠れているあいだだけ、ヘッダーの下に1行で出す。
//
// prototype/index.html にあった #stickybar の移植。
//
// 🔴 出す数字は【すべて src/lib/ の計算を使う】。ここで数え直さない。
//    サマリー・見込み金額カードと違う数字が出ると、どちらが正しいか分からなくなる。
// 🔴 判定に使うのは【精算時間 bill】。実勤務時間 work ではない（§7.7）。
// ===================================================================

import { useEffect, useState, type RefObject } from "react";
import type { MonthCalc } from "@/lib/calc";
import { OT_LIMIT } from "@/lib/constants";
import { calcMoney, hasRate } from "@/lib/money";
import { toHMM, yen } from "@/lib/time";
import type { Contract } from "@/lib/types";

/** ヘッダーの高さ（h-14 ＝ 56px）。バーはこのすぐ下に出す */
const HEADER_H = 56;

function Item({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <span className="flex items-center gap-1.5 flex-shrink-0">
      <span className="text-ads-muted">{label}</span>
      <span className={`font-bold tabular-nums ${cls ?? "text-slate-900"}`}>{value}</span>
    </span>
  );
}

export default function StickyTotals({
  anchorRef,
  total,
  contract,
  noData,
}: {
  /** これが画面の上に消えたらバーを出す（サマリー4枚） */
  anchorRef: RefObject<HTMLElement | null>;
  total: MonthCalc;
  contract: Contract;
  /** まだ1日も入力がない月。過不足・金額を判定しない */
  noData: boolean;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      // ヘッダーより上に出たら、隠れたとみなす
      setShown(el != null && el.getBoundingClientRect().bottom < HEADER_H);
    };
    update();
    // scroll はページ自身のものだけ拾う（要素の中のスクロールは上がってこない）
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  if (!shown) return null;

  const money = calcMoney(total.bill, contract);
  const otOver = total.ot > OT_LIMIT;

  // 🔴 未入力（null）を 0 として引き算しない（拡張2・08 §3.6）。
  //    `contract.lo - total.bill` は null が 0 に化けて、
  //    「+136:00 超過」のような嘘が出る。差は calcMoney が出したものを使う。
  const under = money.shortMin; // 0 より大きければ不足
  const over = money.excessMin; // 0 より大きければ超過
  const noRange = !money.hasLo && !money.hasHi;
  const inRange = under <= 0 && over <= 0;

  // 🔴 単価が入っているかの判定は `hasRate()` に集めてある（08 §3.3 ⑤）。
  //    ここで `contract.base === 0` と書くと、時給契約の金額が永久に「―」になる。
  //
  // 🔴 入力ゼロの月の扱いも、契約の種類で違う（08 §3.3 ④）。
  //    月額は「不足140時間ぶんの減額」が引かれるので出さない。
  //    時給は働いていないぶん 0円が正解なので出す。
  //    **`MoneyCard` と同じ式にそろえること。**片方だけだと、
  //    同じ月なのに表の上と下で「¥0」と「―」が食い違う。
  const noAmount = contract.kind === "時給" ? !hasRate(contract) : noData || !hasRate(contract);

  const gapCls = noData
    ? "text-ads-dim"
    : inRange
      ? "text-emerald-600"
      : under > 0
        ? "text-rose-600"
        : "text-amber-600";

  const moneyCls = noAmount
    ? "text-ads-dim"
    : money.state === "short"
      ? "text-rose-600"
      : money.state === "excess"
        ? "text-amber-700"
        : // 🔴 範囲を設定していない時給契約を緑にしない（08 §3.4）。
          //    緑は「契約時間の範囲に収まっている」という意味を持たせた色。
          //    範囲が無い月に出すと、ありもしない判定に合格したように見える。
          //    **`MoneyCard` の tone と同じ分岐にそろえること。**
          money.state === "hourly"
          ? "text-slate-900"
          : "text-emerald-700";

  const sep = <span className="text-ads-border flex-shrink-0">|</span>;

  return (
    <div className="fixed top-14 left-0 right-0 z-10 bg-white border-b border-ads-border shadow-sm">
      <div className="max-w-6xl mx-auto px-5 py-2 flex items-center gap-x-3 text-xs whitespace-nowrap overflow-x-auto">
        <Item
          label="勤務"
          // 丸めで差が出る月だけ「実 → 精算」を並べる（差がない月に出すと読みにくい）
          value={total.rounded ? `${toHMM(total.work)} → ${toHMM(total.bill)}` : toHMM(total.work)}
        />
        {sep}
        <Item label="残業" value={toHMM(total.ot)} cls={otOver ? "text-rose-500" : undefined} />
        {sep}
        {/* 🔴 空の下限・上限を「0:00」と書かない。「―」にして未入力だと分かるようにする */}
        <Item
          label={contract.kind === "時給" ? "時給契約" : "契約"}
          value={
            noRange
              ? "範囲なし"
              : `${contract.lo === null ? "―" : toHMM(contract.lo)}〜${contract.hi === null ? "―" : toHMM(contract.hi)}`
          }
        />
        {sep}
        <Item
          label="過不足"
          value={
            noData
              ? "―"
              : // 範囲を設定していない時給契約に「範囲内」と出すのは誤り（08 §3.4）
                noRange
                ? "―"
                : inRange
                  ? "範囲内"
                  : under > 0
                    ? `-${toHMM(under)}`
                    : `+${toHMM(over)}`
          }
          cls={noRange ? "text-ads-dim" : gapCls}
        />
        {sep}
        <Item label="見込み" value={noAmount ? "―" : yen(money.total)} cls={moneyCls} />
      </div>
    </div>
  );
}
