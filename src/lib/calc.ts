// ===================================================================
// 勤務時間の計算（03_業務ロジック設計 §3・§7.7）
//
// 🔴 いちばん間違えやすいところ。2つの時間を【両方】持つ。
//
//   work（実勤務時間） … 終了 − 開始 − 休憩。記録用。Excel・報告サイトに出すのはこちら
//   bill（精算時間）   … work を15分へ丸めた値。判定と金額に使う
//
// 「work を丸めた値で上書きする」実装にしないこと。
// 合計を丸めるのと同じくらい、よくある間違い。
// ===================================================================

import { BILL_UNIT, BREAK_REQUIRED_OVER } from "./constants";
import { daysIn } from "./calendar";
import { toMin } from "./time";
import type { Day, DayMap } from "./types";

/**
 * 精算に使う時間へ丸める。【1日ごと】に15分・切り捨て（§7.7）。
 * 合計してから丸めてはいけない（結果が15分ずれる）。
 */
export function roundBill(min: number | null): number | null {
  if (min == null) return null;
  return Math.floor(min / BILL_UNIT) * BILL_UNIT;
}

export type DayCalc = {
  /** 実勤務時間（分）。計算できないときは null */
  work: number | null;
  /** 精算時間（分）＝ work を15分に丸めたもの */
  bill: number | null;
  /** 残業時間（分）。マイナスにはしない。**丸めない** */
  ot: number | null;
  /** C-2 の矛盾（終了≦開始 ／ 休憩が長すぎる）があるか */
  error: boolean;
};

const NOT_CALCULATED: DayCalc = { work: null, bill: null, ot: null, error: false };

/** 1日分の計算（§3） */
export function calcDay(day: Day | undefined | null, baseWorkMinutes: number): DayCalc {
  if (!day || day.kind !== "勤務") return NOT_CALCULATED;

  const st = toMin(day.startAt);
  const en = toMin(day.endAt);
  const br = toMin(day.breakAt) ?? 0; // 休憩が空欄なら0分として計算する（止めない）
  if (st == null || en == null) return NOT_CALCULATED;

  // C-2 終了 ≦ 開始
  if (en <= st) return { work: null, bill: null, ot: null, error: true };

  const work = en - st - br;
  // 休憩が拘束時間を超えても勤務時間はマイナスにしない。これも C-2 の矛盾として弾く
  if (work < 0) return { work: null, bill: null, ot: null, error: true };

  const ot = Math.max(0, work - baseWorkMinutes);
  return { work, bill: roundBill(work), ot, error: false };
}

/**
 * 休憩の入れ忘れとして知らせる日か（C-1・I-5・2026-09-15）。
 *
 * 🔴 判定はこの関数だけが持つ。
 *    チェック（checks.ts）・日付モーダル（DayModal）・月間一覧（MonthTable）の3か所が呼ぶ。
 *    もとは3か所に `!toMin(breakAt)` を別々に書いていたので、直すなら3か所を揃える必要があった。
 *
 * 📌 休憩が空（00:00 も空として扱う）でも、**終業 − 始業 が 6:00 以下なら知らせない。**
 *    午後休（09:30〜13:00）のような半日の勤務で、⚠️ が消せなかったため。
 *    線は `BREAK_REQUIRED_OVER`（労働基準法で休憩が要るのは6時間を超えるとき）。
 *
 * ⚠️ 始業か終業が空の日は、長さが分からないので**これまでどおり知らせる**。
 *    黙らせる根拠が無い。
 */
export function isBreakMissing(
  day: Pick<Day, "kind" | "startAt" | "endAt" | "breakAt"> | undefined | null,
): boolean {
  if (!day || day.kind !== "勤務") return false;
  if (toMin(day.breakAt)) return false;

  const st = toMin(day.startAt);
  const en = toMin(day.endAt);
  if (st == null || en == null) return true;
  return en - st > BREAK_REQUIRED_OVER;
}

export type MonthCalc = {
  /** 実勤務時間の合計（分）。Excelに出すのはこちら */
  work: number;
  /** 精算時間の合計（分）。各日を丸めてから足したもの。判定・金額はこちら */
  bill: number;
  /** 残業時間の合計（分） */
  ot: number;
  /** 作業日数（区分が「勤務」の日数） */
  days: number;
  /** 計算できず合計に入れなかった日 */
  errorDays: number[];
  /** work と bill に差があるか。差がない月は精算時間を画面に出さない */
  rounded: boolean;
};

/** 1か月分の集計（§3・§7.7） */
export function calcMonth(
  year: number,
  month: number,
  dayMap: DayMap,
  baseWorkMinutes: number,
): MonthCalc {
  let work = 0;
  let bill = 0;
  let ot = 0;
  let days = 0;
  const errorDays: number[] = [];

  for (let d = 1; d <= daysIn(year, month); d++) {
    const day = dayMap[d];
    if (!day || day.kind !== "勤務") continue;
    days++;

    const c = calcDay(day, baseWorkMinutes);
    if (c.error) {
      errorDays.push(d);
      continue;
    }
    // 丸めてから足す。足してから丸めると結果が変わる（§7.7）
    if (c.work != null && c.bill != null && c.ot != null) {
      work += c.work;
      bill += c.bill;
      ot += c.ot;
    }
  }

  return { work, bill, ot, days, errorDays, rounded: work !== bill };
}

/**
 * その月に、**利用者が入れた記録**がまだ1つも無いか。
 *
 * この状態では金額・過不足・C-4 を判定しない。
 * 判定すると「不足140時間ぶんの減額」が丸ごと引かれ、金額がマイナスになる。
 *
 * 📌 「全日を休暇にした結果0日」とは区別する。
 *    そちらは行があるので、下限割れとして正しく警告する（02_データ設計 §5.6）。
 *
 * 🔴 `auto`（自動で補った土日・祝日）は数えない（2026-08-08）。
 *    読み込み時に土日・祝日が自動で入るようになったので、
 *    **キーの数で数えると、どの月も「空でない」ことになってしまう。**
 *    そうなると「まだ入力がありません」が永久に出なくなり、
 *    1日も入れていない月に**下限割れの減額が出る**（上に書いた事故そのもの）。
 */
export function isEmptyMonth(dayMap: DayMap): boolean {
  return Object.values(dayMap).every((d) => !d || d.auto);
}
