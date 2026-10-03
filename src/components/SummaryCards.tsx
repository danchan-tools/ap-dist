// ===================================================================
// S-3 サマリー4枚（02_基本設計/01_画面遷移・ユーザーフロー.md）
//
// 🔴 「契約時間との過不足」は【精算時間】で判定する。実勤務時間ではない（§7.7）。
//    「勤務時間 合計」に出すのは実勤務時間。差があるときだけ精算時間を添える。
// ===================================================================

import { AlertCircle, Briefcase, CheckCircle2, Info, Minus, Target, TrendingUp } from "lucide-react";
import type { MonthCalc } from "@/lib/calc";
import { OT_LIMIT } from "@/lib/constants";
import { calcMoney } from "@/lib/money";
import { toHMM } from "@/lib/time";
import type { Contract } from "@/lib/types";

type Tone = "good" | "bad" | "info" | "plain";

const TONE: Record<Tone, [string, string, string]> = {
  good: ["border-emerald-300 border-2", "text-emerald-600", "text-emerald-700"],
  bad: ["border-rose-400 border-2", "text-rose-500", "text-rose-600"],
  info: ["border-amber-300 border-2", "text-amber-600", "text-amber-700"],
  plain: ["border-ads-border border", "text-slate-900", "text-ads-dim"],
};

function Card({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className={`bg-white ${t[0]} rounded-xl p-4`}>
      <div
        className={`flex items-center gap-1.5 text-[11px] font-bold mb-1 ${tone === "plain" ? "text-ads-muted" : t[2]}`}
      >
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-black tabular-nums ${t[1]}`}>{value}</div>
      <div className={`text-[11px] mt-0.5 ${t[2]}`}>{note}</div>
    </div>
  );
}

export default function SummaryCards({
  total,
  contract,
  noData,
}: {
  total: MonthCalc;
  contract: Contract;
  /** まだ1日も入力がない月。金額・過不足を判定しない */
  noData: boolean;
}) {
  // 🔴 未入力（null）を 0 として引き算しない（拡張2・08 §3.6）。差は calcMoney から取る
  const money = calcMoney(total.bill, contract);
  const under = money.shortMin; // 0 より大きければ不足
  const over = money.excessMin; // 0 より大きければ超過
  const inRange = under <= 0 && over <= 0;
  const otOver = total.ot > OT_LIMIT;

  /**
   * 🔴 下限・上限がどちらも空なら、契約まわりの2枚を出さない（08 §3.6）。
   *    「―〜―」「範囲内」と書くと、設定していない範囲に合格したように見える。
   *    片方だけ入れているときは、その片方で判定できるので出す。
   */
  const showRange = money.hasLo || money.hasHi;
  const loText = contract.lo === null ? "―" : toHMM(contract.lo);
  const hiText = contract.hi === null ? "―" : toHMM(contract.hi);

  const gapTone: Tone = noData ? "plain" : inRange ? "good" : under > 0 ? "bad" : "info";
  const gapIcon = noData ? (
    <Minus className="w-3.5 h-3.5" />
  ) : inRange ? (
    <CheckCircle2 className="w-3.5 h-3.5" />
  ) : under > 0 ? (
    <AlertCircle className="w-3.5 h-3.5" />
  ) : (
    <Info className="w-3.5 h-3.5" />
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card
        icon={<Briefcase className="w-3.5 h-3.5" />}
        label="勤務時間 合計"
        value={toHMM(total.work)}
        note={
          total.rounded
            ? `作業日数 ${total.days}日 ／ 精算 ${toHMM(total.bill)}`
            : `作業日数 ${total.days}日`
        }
        tone="plain"
      />
      <Card
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        label="残業時間 合計"
        value={toHMM(total.ot)}
        note={otOver ? "上限 45:00 を超過" : "上限 45:00 まで余裕あり"}
        tone={otOver ? "bad" : "plain"}
      />
      {showRange && (
        <>
          <Card
            icon={<Target className="w-3.5 h-3.5" />}
            label="契約の稼働時間"
            value={`${loText}〜${hiText}`}
            note="下限〜上限（⚙設定で変更できる）"
            tone="plain"
          />
          <Card
            icon={gapIcon}
            label="契約時間との過不足"
            value={
              noData ? "―" : inRange ? "範囲内" : under > 0 ? `-${toHMM(under)}` : `+${toHMM(over)}`
            }
            note={
              noData
                ? "まだ入力がありません"
                : inRange
                  ? // 上限を入れていなければ「あと何時間」は出せない
                    money.hasHi
                    ? `上限まであと ${toHMM(contract.hi! - total.bill)}`
                    : `下限を ${toHMM(total.bill - contract.lo!)} 上回っています`
                  : under > 0
                    ? contract.kind === "時給"
                      ? "下限割れ。稼働が足りません"
                      : "下限割れ。報酬が減ります"
                    : "上限超過。調整で対応できます"
            }
            tone={gapTone}
          />
        </>
      )}
    </div>
  );
}
