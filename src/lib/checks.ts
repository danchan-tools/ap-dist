// ===================================================================
// 入力チェック（03_業務ロジック設計 §6）
//
// C-1 休憩の未入力     ⚠️ 確認    出力できる
// C-2 時刻の矛盾       🔴 必須    出力できない
// C-3 残業の超過       ⚠️ 確認    出力できる
// C-4 契約時間の範囲   下限割れ＝🟥要対応／上限超過＝ℹ️参考
// C-5 祝日表の状態     C-5a 表がない＝⚠️確認／C-5b 予測の年＝ℹ️参考   出力できる
// C-6 時給の未入力     ⚠️ 確認    出力できる（**時給契約のときだけ**。拡張2）
//
// 問題がない項目も「OK」として返す。
// そうしないと「チェックが動いていないだけ」なのか区別がつかない。
// ===================================================================

import { calcDay, calcMonth, isBreakMissing, isEmptyMonth } from "./calc";
import { daysIn, dowOf } from "./calendar";
import { OT_LIMIT } from "./constants";
import { hasHolidayTable, isPredictedYear } from "./holidays";
import { calcMoney } from "./money";
import { toHMM, toMin, yen } from "./time";
import type { Contract, DayMap } from "./types";

/**
 * 重さの4段階（§6「重さの考え方」）
 *   error … 🔴 必須：明らかに間違い。出力をブロックする
 *   high  … 🟥 要対応：間違いではないが、放置すると損をする
 *   warn  … ⚠️ 確認：本人の判断が要る
 *   info  … ℹ️ 参考：対応不要。**件数に数えない**
 *   ok    … ✅ 問題なし
 */
export type CheckLevel = "error" | "high" | "warn" | "info" | "ok";

export type Check = {
  id: "C-1" | "C-2" | "C-3" | "C-4" | "C-5" | "C-6";
  level: CheckLevel;
  /** その日に紐づく指摘なら日。月全体の指摘なら undefined */
  day?: number;
  title: string;
  desc: string;
};

export type CheckInput = {
  year: number;
  month: number;
  days: DayMap;
  contract: Contract;
  baseWorkMinutes: number;
};

export function runChecks({ year, month, days, contract, baseWorkMinutes }: CheckInput): Check[] {
  const out: Check[] = [];
  const total = calcMonth(year, month, days, baseWorkMinutes);
  let breakMissing = 0;
  let timeConflict = 0;

  for (let d = 1; d <= daysIn(year, month); d++) {
    const day = days[d];
    if (!day || day.kind !== "勤務") continue;
    const head = `${month}/${d}(${dowOf(year, month, d)})`;

    // --- C-2 時刻の矛盾（🔴 必須）。2種類ある ---
    if (calcDay(day, baseWorkMinutes).error) {
      timeConflict++;
      const backwards = (toMin(day.endAt) ?? 0) <= (toMin(day.startAt) ?? 0);
      out.push({
        id: "C-2",
        level: "error",
        day: d,
        title: `${head}　${backwards ? "終了が開始より前になっています" : "休憩が勤務の時間を超えています"}`,
        desc: backwards
          ? `開始 ${day.startAt} に対して 終了 ${day.endAt}。打ち間違いの可能性があります`
          : `${day.startAt}〜${day.endAt} に対して 休憩 ${day.breakAt}。勤務時間がマイナスになります`,
      });
    }

    // --- C-1 休憩の未入力（⚠️ 確認） ---
    // 🔴 判定は isBreakMissing だけが持つ（I-5）。6:00 以下の勤務（午後休など）は知らせない
    if (isBreakMissing(day)) {
      breakMissing++;
      out.push({
        id: "C-1",
        level: "warn",
        day: d,
        title: `${head}　休憩時間が入力されていません`,
        desc: "6時間を超える勤務なのに、休憩が空欄です。入れ忘れではありませんか",
      });
    }
  }

  // 問題がなかった観点も「OK」として出す（§6）。
  // そうしないと「チェックが動いていないだけ」なのか区別がつかない。
  // 入力のある月だけ出す（空の月に「すべて入力されています」は誤解を招く）
  if (!isEmptyMonth(days)) {
    if (timeConflict === 0) {
      out.push({
        id: "C-2",
        level: "ok",
        title: "時刻の矛盾はありません",
        desc: "すべての勤務日で、終了が開始より後になっています",
      });
    }
    if (breakMissing === 0) {
      out.push({
        id: "C-1",
        level: "ok",
        // 📌 「すべて入力されています」とは言わない（I-5）。
        //    6:00 以下の勤務では休憩が空でも知らせないので、空の日が残りうる
        title: "休憩の入れ忘れはありません",
        desc: "6時間を超える勤務日には、すべて休憩が入っています",
      });
    }
  }

  // --- C-5 祝日表の状態（2026-08-05 追加／2026-08-08 に「予測の年」を分けた）---
  //
  // 🔴 祝日表は3つの状態を取る。**黙って間違える年を作らない**のがこの分岐の目的。
  //
  //      表が無い年     → C-5a ⚠️ 確認：祝日が「勤務」として展開されてしまう
  //      予測の年       → C-5b ℹ️ 参考：入ってはいるが、官報で確定していない
  //      確定している年 → 何も出さない（問題がないので）
  //
  // 📌 C-5 だけは、ほかの観点と違って「OK」を返さない。
  //    問題がない年に「祝日表があります」と出しても、判断材料にならないため。
  if (!hasHolidayTable(year)) {
    out.push({
      id: "C-5",
      level: "warn",
      title: `${year}年の祝日表がありません`,
      desc: "祝日が勤務日として入っています。該当する日を手で「祝日」に直してください（表を足すのは src/lib/holidays.ts）",
    });
  } else if (isPredictedYear(year)) {
    // 🔴 info（ℹ️ 参考）にする。件数には数えない。
    //    祝日は入っていて、たいていは合っている。「対応が必要」と鳴らすと、
    //    毎月おなじ警告が出続けて、本当に見るべき指摘が埋もれる。
    out.push({
      id: "C-5",
      level: "info",
      title: `${year}年の祝日は予測です`,
      desc: "春分・秋分は計算で出したもので、官報ではまだ確定していません。法改正も反映されていません。国立天文台の暦要項（前年2月に公告）で確かめてください",
    });
  }

  // --- C-3 残業の超過 ---
  if (total.ot > OT_LIMIT) {
    out.push({
      id: "C-3",
      level: "warn",
      title: `月の残業時間が 45:00 を超えています（${toHMM(total.ot)}）`,
      desc: "働きすぎていないか、月末を待たずに気づけます",
    });
  } else {
    out.push({
      id: "C-3",
      level: "ok",
      title: "残業時間は上限の範囲内です",
      desc: `${toHMM(total.ot)} ／ 上限 45:00`,
    });
  }

  // --- C-4 契約時間の範囲 ---
  // 🔴 判定に使うのは【精算時間】（15分単位に丸めた合計）。実時間ではない（§7.7）
  const money = calcMoney(total.bill, contract);
  const hourly = contract.kind === "時給";
  const roundNote = total.rounded ? `（実 ${toHMM(total.work)} → 精算 ${toHMM(total.bill)}）` : "";

  // 🔴 下限・上限は未入力（null）でありうる（拡張2）。「―」と書いて 0:00 と区別する
  const loText = contract.lo === null ? "―" : toHMM(contract.lo);
  const hiText = contract.hi === null ? "―" : toHMM(contract.hi);
  const range = `${toHMM(total.bill)} ／ 契約 ${loText}〜${hiText}${roundNote}`;

  if (isEmptyMonth(days)) {
    // まだ何も入力していない月を「下限割れ」と言うのは過剰。判定を保留する
    out.push({
      id: "C-4",
      level: "info",
      title: "契約時間の判定は、まだできません",
      desc: "この月はまだ入力がありません。「営業日すべてに反映する」を押すと判定します",
    });
  } else if (money.state === "hourly") {
    // 🔴 下限・上限が両方とも空の時給契約（08 §3.5）。
    //    何もしないと最後の else に落ちて「範囲に収まっています（緑）」が出る。
    //    範囲が無いのに「範囲内」は誤り。
    //    📌 黙って消さないのは §6 の決めごと。問題がない観点も返す。
    out.push({
      id: "C-4",
      level: "info",
      title: "この月は時給契約です",
      desc: `${range}　※ 契約時間の下限・上限は設定されていません`,
    });
  } else if (money.state === "short") {
    // 下限割れ＝報酬が減る。月末に気づいても取り返せないため最も重い扱い
    // 🔴 文言を契約の種類で分ける（08 §3.5）。
    //    時給契約に減額の仕組みは無いので、そのままだと「¥0 の減額」と出る。
    out.push({
      id: "C-4",
      level: "high",
      title: `契約の下限を下回っています（あと ${toHMM(money.shortMin)} 必要）`,
      desc: hourly
        ? `${range}　※ このままだと見込みは ${yen(money.total)}。月末までに稼働を積んでください`
        : `${range}　※ このままだと ${yen(money.deduct)} の減額。月末までに稼働を積んでください`,
    });
  } else if (money.state === "excess") {
    // 上限超過＝調整すればよい。知らせるだけ
    // 📌 時給契約では、上限を超えても金額の計算は変わらない（働いた分だけ）。
    //    C-4b は「働きすぎの見張り」としてだけ残る（08 §3.4）。
    out.push({
      id: "C-4",
      level: "info",
      title: `契約の上限を超えています（${toHMM(money.excessMin)} 超過）`,
      desc: hourly
        ? `${range}　※ 時給契約なので、超過分もそのまま精算されます`
        : `${range}　※ 超過分 ${yen(money.add)} は調整・精算で対応できます`,
    });
  } else {
    // 🔴 「範囲」と言えるのは両方入っているときだけ（08 §3.4）。
    //    下限だけ／上限だけの時給契約で「範囲に収まっています」と出すのは誤り。
    const both = money.hasLo && money.hasHi;
    // 🔴 入っている側の説明だけを並べる（08 §3.4）。
    //    もとは「下限の文」と「上限の文」をそれぞれ足す書き方にしていたため、
    //    **上限だけ入れた月に「　（／上限まであと 5:00）」**と、
    //    先頭にスラッシュの残った壊れた括弧が出ていた。
    //    入っているものだけを集めて繋ぐ形にすれば、片方でも両方でも崩れない。
    const notes: string[] = [];
    if (money.hasLo) notes.push(`下限を ${toHMM(total.bill - contract.lo!)} 上回っています`);
    if (money.hasHi) notes.push(`上限まであと ${toHMM(contract.hi! - total.bill)}`);
    out.push({
      id: "C-4",
      level: "ok",
      title: both
        ? "契約時間の範囲に収まっています"
        : money.hasLo
          ? `契約の下限 ${loText} を満たしています`
          : `契約の上限 ${hiText} に収まっています`,
      desc: notes.length > 0 ? `${range}　（${notes.join("／")}）` : range,
    });
  }

  // --- C-6 時給の未入力（拡張2・08 §3.5） ---
  // 🔴 月額契約なら、単価0でも C-4 が下限割れで鳴る。
  //    時給契約で下限も空にすると、時給0のまま「見込み 0円」が出続けて
  //    警告が1つも出ない。しかも月額→時給に切り替えると必ず一度この状態を通る。
  if (hourly) {
    if (contract.hourlyRate === 0) {
      out.push({
        id: "C-6",
        // ⚠️ error にしない。時給が未入力でも勤務表そのものは正しく、
        //    Excel には単価を出さないので実害がない（出力は止めない）
        level: "warn",
        title: "時給が入力されていません",
        desc: "⚙契約条件から入力してください。入れるまで見込み金額は出ません",
      });
    } else {
      out.push({
        id: "C-6",
        level: "ok",
        title: "時給が入力されています",
        desc: `${yen(contract.hourlyRate)} ／時`,
      });
    }
  }
  // 📌 月額契約では C-6 を判定しない（時給の欄そのものが無いため）

  return out;
}

/** 🔴 必須があるか。あると Excel 出力をブロックする（F-4） */
export function hasBlockingError(checks: Check[]): boolean {
  return checks.some((c) => c.level === "error");
}

/** 件数。「参考」は対応不要なので数に入れない（§6） */
export function countAttention(checks: Check[]): number {
  return checks.filter((c) => c.level === "error" || c.level === "high" || c.level === "warn").length;
}
