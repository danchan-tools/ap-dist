"use client";

// ===================================================================
// 確認画面（06_AIアシスタント設計.md §3.4）
//
// 🔴 AIの読み取りを、そのまま保存しない。
//    ここを押されて初めて `PATCH /days` に送る。
//
// 🔴 1行ずつチェックを外せる。「4日は合ってるけど11日は違う」に対応する。
// 🔴 C-2 に当たる行は反映できない印にして、選べないようにする（§9.1-9）。
// ===================================================================

import { AlertTriangle, Ban } from "lucide-react";
import { useState } from "react";
import type { AssistChange } from "@/lib/assist";
import { calcDay, calcMonth, isEmptyMonth } from "@/lib/calc";
import { calcMoney, hasRate } from "@/lib/money";
import { toHMM, yen } from "@/lib/time";
import type { Contract, DayMap } from "@/lib/types";

export default function AssistConfirm({
  year,
  month,
  days,
  contract,
  baseWorkMinutes,
  changes,
  busy,
  onCancel,
  onApply,
}: {
  year: number;
  month: number;
  /** いまの勤務表。反映後の合計を先に出すために使う */
  days: DayMap;
  /** 🔴 これは画面側の計算にだけ使う。AIには送っていない（§5.2） */
  contract: Contract;
  baseWorkMinutes: number;
  changes: AssistChange[];
  busy: boolean;
  onCancel: () => void;
  onApply: (picked: AssistChange[]) => void;
}) {
  // C-2 に当たる行は、最初からチェックを外しておく
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(changes.filter((c) => !c.blocked).map((c) => c.day)),
  );

  function toggle(day: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  const chosen = changes.filter((c) => !c.blocked && picked.has(c.day));

  // 反映したら合計と見込み金額がどうなるかを、押す前に出す（§3.4）
  const after: DayMap = { ...days };
  for (const c of chosen) after[c.day] = c.next;

  const now = calcMonth(year, month, days, baseWorkMinutes);
  const next = calcMonth(year, month, after, baseWorkMinutes);
  const moneyNow = calcMoney(now.bill, contract);
  const moneyNext = calcMoney(next.bill, contract);
  // 🔴 単価が入っているかの判定は `hasRate()` に集める（08 §3.3 ⑤ の3か所目）。
  //    ここで `contract.base > 0` と書くと、時給契約では基本単価が 0 のままなので、
  //    **反映するかどうかを決めるこの画面だけ、金額が永久に出ない。**
  //
  //    📌 時給契約は入力ゼロでも 0円が正解なので、`isEmptyMonth` を見ない（§3.3 ④）。
  const showMoney =
    contract.kind === "時給" ? hasRate(contract) : !isEmptyMonth(after) && hasRate(contract);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <p className="px-4 py-2.5 text-xs font-bold text-slate-900 border-b border-ads-border bg-ads-surface">
        この内容で直します（{chosen.length}件）
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {changes.map((c) => {
          const cd = calcDay(c.next, baseWorkMinutes);
          const before = calcDay(days[c.day], baseWorkMinutes);
          const on = !c.blocked && picked.has(c.day);
          return (
            <label
              key={c.day}
              className={`flex gap-2 rounded-lg border px-3 py-2 ${
                c.blocked
                  ? "border-rose-200 bg-rose-50 cursor-not-allowed"
                  : on
                    ? "border-ads-ai bg-ads-ai/5 cursor-pointer"
                    : "border-ads-border cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={c.blocked}
                onChange={() => toggle(c.day)}
                className="mt-0.5 accent-[var(--color-ads-ai)]"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-slate-900 tabular-nums">
                  {month}/{c.day}({c.dow})
                </span>
                {c.diffs.map((d) => (
                  <span key={d.label} className="block text-[11px] text-ads-muted tabular-nums">
                    {d.label}　{d.before} → <span className="font-bold text-slate-900">{d.after}</span>
                  </span>
                ))}

                {/* その日の勤務・残業がどう変わるかを添える */}
                {!c.blocked && (
                  <span className="block text-[11px] text-ads-muted tabular-nums mt-0.5">
                    勤務 {toHMM(before.work)} → {toHMM(cd.work)} ／ 残業 {toHMM(before.ot)} →{" "}
                    {toHMM(cd.ot)}
                  </span>
                )}

                {c.blocked ? (
                  <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-rose-600">
                    <Ban className="w-3 h-3 flex-shrink-0" />
                    {c.blockReason}ため、この行は反映できません
                  </span>
                ) : (
                  c.reason && <span className="block text-[11px] text-ads-dim mt-0.5">{c.reason}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-ads-border bg-ads-surface flex flex-col gap-1">
        <p className="text-[11px] text-ads-muted tabular-nums">
          合計 {toHMM(now.work)} → <span className="font-bold text-slate-900">{toHMM(next.work)}</span>
          {next.rounded && `（精算 ${toHMM(next.bill)}）`}
        </p>
        {showMoney && (
          <p className="text-[11px] text-ads-muted tabular-nums">
            見込み {yen(moneyNow.total)} →{" "}
            <span
              className={`font-bold ${
                moneyNext.total < moneyNow.total ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {yen(moneyNext.total)}
            </span>
            {moneyNext.state === "short" && "（下限割れ）"}
          </p>
        )}
        {/* 反映したあとに C-4 が下限割れになるなら、押す前に気づけるようにする */}
        {moneyNext.state === "short" && moneyNow.state !== "short" && (
          <p className="flex items-start gap-1 text-[11px] font-bold text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
            反映すると契約の下限を下回ります
          </p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-ads-border flex items-center gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="text-xs font-bold text-ads-muted hover:text-slate-900 px-3 py-2"
        >
          やめる
        </button>
        <button
          onClick={() => onApply(chosen)}
          disabled={busy || chosen.length === 0}
          className="ml-auto bg-ads-ai hover:bg-ads-ai-dark disabled:bg-ads-dim text-white text-xs font-bold px-4 py-2 rounded-lg"
        >
          {busy ? "反映中…" : "この内容で反映する"}
        </button>
      </div>
    </div>
  );
}
