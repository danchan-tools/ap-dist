// ===================================================================
// 精算金額の計算（03_業務ロジック設計 §7／拡張2は 08_将来の拡張設計 §3.4）
//
// 🔴 渡すのは【精算時間】（各日を15分へ丸めた値の合計）。
//    実勤務時間ではない（§7.7）。実時間で計算すると下限割れを見逃す。
//
// 🔴 契約の種類で計算が変わる（拡張2）。
//      月額 … 基本単価 － 減額 ＋ 増額
//      時給 … 精算時間 × 時給（減額・増額は無い）
// ===================================================================

import type { Contract } from "./types";

/**
 * 金額の状態。
 *
 * 🔴 `hourly` を足した理由（08 §3.4）。
 *    下限・上限をどちらも設定していない時給契約で `inRange` を返すと、
 *    画面に「契約時間の範囲に収まっています」と緑で出る。
 *    **範囲がないのに「範囲内」は誤り。**
 */
export type MoneyState = "short" | "excess" | "inRange" | "hourly";

export type Money = {
  /** 契約の種類。画面の内訳の出し分けに使う */
  kind: Contract["kind"];
  /** 基本単価（円）。時給契約では 0 */
  base: number;
  /** 下限に対する不足（分）。下限が未入力なら 0 */
  shortMin: number;
  /** 上限に対する超過（分）。上限が未入力なら 0 */
  excessMin: number;
  /** 減額（円）。時給契約では 0 */
  deduct: number;
  /** 増額（円）。時給契約では 0 */
  add: number;
  /** 見込み金額（円） */
  total: number;
  state: MoneyState;
  /**
   * 🔴 `state` だけでは足りないので持たせる（08 §3.4）。
   *
   * 下限だけを入れた時給契約が範囲内のとき `state` は `inRange` になるが、
   * 「契約時間の範囲に収まっています」と出すのは誤り。**上限は存在しない。**
   * 文言は画面側がこの2つを見て選ぶ。
   * （`state` の種類を増やして数え上げると、組み合わせが 4×4 に散らばる）
   */
  hasLo: boolean;
  hasHi: boolean;
};

/**
 * @param billMin 精算時間の合計（分）
 */
export function calcMoney(billMin: number, contract: Contract): Money {
  const hasLo = contract.lo !== null;
  const hasHi = contract.hi !== null;

  // 🔴 未入力（null）を 0 として計算しない。
  //    `Math.max(0, null - billMin)` は null が 0 に化けて、
  //    「下限0」として静かに通ってしまう（08 §3.3 ②）。
  const shortMin = hasLo ? Math.max(0, contract.lo! - billMin) : 0;
  const excessMin = hasHi ? Math.max(0, billMin - contract.hi!) : 0;

  const state: MoneyState =
    shortMin > 0 ? "short" : excessMin > 0 ? "excess" : hasLo || hasHi ? "inRange" : "hourly";

  if (contract.kind === "時給") {
    return {
      kind: "時給",
      base: 0,
      shortMin,
      excessMin,
      deduct: 0,
      add: 0,
      // 🔴 掛けてから割る（08 §3.4）。1円未満は【切り捨て】（§6 #5）。
      //    いまの精算単位（15分）ならどちらの順でも同じだが、
      //    BILL_UNIT を10分に変えた瞬間に1円ずれる（実測283件）。
      //    「単位を変えるときは1行直せばよい」という約束を守るため、いまからこう書く。
      total: Math.floor((billMin * contract.hourlyRate) / 60),
      state,
      hasLo,
      hasHi,
    };
  }

  // 時間は分のまま計算し、最後に円で丸める（1円未満は四捨五入。§7.2）
  // 📌 時給の切り捨てと揃えていないのは、根拠の出どころが違うため（08 §6 #5）。
  //    こちらは月額契約の注文書に合わせた実測値。
  const deduct = Math.round((shortMin / 60) * contract.underRate);
  const add = Math.round((excessMin / 60) * contract.overRate);

  return {
    kind: "月額",
    base: contract.base,
    shortMin,
    excessMin,
    deduct,
    add,
    total: contract.base - deduct + add,
    // 不足と超過は同時に起きない。境界値（下限ちょうど・上限ちょうど）は範囲内
    state,
    hasLo,
    hasHi,
  };
}

/**
 * 単価が入力されているか。**契約の種類で見るところが違う**（08 §3.3 ⑤）。
 *
 * 🔴 これを共通の関数にした理由。
 *    もとは `contract.base === 0` という同じ判定が**3か所**に散っていた
 *    （`MoneyCard`・`StickyTotals`・`AssistConfirm`）。
 *    時給契約は基本単価が 0 のままなので、そのままだと
 *    **入力もチェックも正常なのに金額だけ永久に「―」**になる。
 *
 *    一部だけ直すと、同じ月なのに場所によって違う金額が出る。
 *    **判定を1か所に集めて、直し忘れが起きない形にした。**
 */
export function hasRate(contract: Contract): boolean {
  return contract.kind === "時給" ? contract.hourlyRate > 0 : contract.base > 0;
}

/**
 * 月額単価から控除単価・超過単価を出す（§7.1 の「単価から自動計算」ボタン）。
 *
 * 端数は【切り捨て】。四捨五入ではない。
 * 実際の注文書に書かれた単価と突き合わせたところ、切り捨てのほうが一致した
 * （2026-08-05）。四捨五入だと1円ずれ、そのまま不足時間に掛かって
 * 見込み金額の誤差になる。
 *
 * ⚠️ 月額契約でしか使わない（拡張2）。時給契約には控除・超過の考えが無い。
 *    0 で割らないよう、呼ぶ側で下限・上限が入っていることを確かめること。
 *
 * @param lo 契約の下限（**時間**。分ではない）
 * @param hi 契約の上限（**時間**）
 */
export function autoRates(base: number, lo: number, hi: number) {
  return {
    underRate: Math.floor(base / lo),
    overRate: Math.floor(base / hi),
  };
}
