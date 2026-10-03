// ===================================================================
// AC-12：8:07 の日を3日入れると、精算時間が 24:00 になる
//         （24:15 にならない＝日ごとに丸めている）
//
// なぜ別のテストが要るのか：
//   AC-9 の7ケースはすべて15分の倍数なので、
//   丸めが効いていなくても全部通ってしまう（02_機能一覧 §4）。
// ===================================================================

import { describe, expect, it } from "vitest";
import { fillOffDays } from "../apply";
import { calcDay, calcMonth, isEmptyMonth, roundBill } from "../calc";
import type { Day, DayMap } from "../types";

const BASE = 8 * 60; // 基準労働時間 8:00

const work = (startAt: string, endAt: string, breakAt: string): Day => ({
  kind: "勤務",
  startAt,
  endAt,
  breakAt,
  place: "在宅",
  note: "通常業務",
});

describe("AC-12 15分丸めは【日ごと】（§7.7）", () => {
  it("8:07 の日を3日 → 精算 24:00（24:15 にならない）", () => {
    // 09:30〜18:37・休憩1:00 ＝ 8:07
    const days: DayMap = {
      3: work("09:30", "18:37", "01:00"),
      4: work("09:30", "18:37", "01:00"),
      5: work("09:30", "18:37", "01:00"),
    };
    const m = calcMonth(2026, 8, days, BASE);

    expect(m.work).toBe(8 * 60 * 3 + 7 * 3); // 実勤務 24:21
    expect(m.bill).toBe(24 * 60); // 精算 24:00 ← 日ごとに丸めた結果
    expect(m.rounded).toBe(true);

    // 合計してから丸めると 24:15 になる。これは誤り
    const wrong = roundBill(m.work);
    expect(wrong).toBe(24 * 60 + 15);
    expect(m.bill).not.toBe(wrong);
  });

  it("実勤務時間を丸めた値で上書きしない。2つを並べて持つ", () => {
    const c = calcDay(work("09:30", "18:37", "01:00"), BASE);
    expect(c.work).toBe(8 * 60 + 7); // 8:07 のまま残る
    expect(c.bill).toBe(8 * 60); // 8:00
  });

  it("残業時間は丸めない（Excelの残業列と合わせるため）", () => {
    // 09:30〜21:07・休憩1:00 ＝ 勤務 10:37 → 残業 2:37
    const c = calcDay(work("09:30", "21:07", "01:00"), BASE);
    expect(c.work).toBe(10 * 60 + 37);
    expect(c.bill).toBe(10 * 60 + 30); // 精算だけ丸まる
    expect(c.ot).toBe(2 * 60 + 37); // 残業は 2:30 にならない
  });

  it("15分の倍数の日は差が出ない（毎日の見た目は変わらない）", () => {
    const days: DayMap = { 3: work("09:30", "18:30", "01:00") };
    const m = calcMonth(2026, 8, days, BASE);
    expect(m.work).toBe(m.bill);
    expect(m.rounded).toBe(false);
  });
});

describe("1日ごとの計算（§3）", () => {
  it("定時：09:30〜18:30 休憩1:00 → 勤務 8:00 / 残業 0:00", () => {
    const c = calcDay(work("09:30", "18:30", "01:00"), BASE);
    expect(c.work).toBe(8 * 60);
    expect(c.ot).toBe(0);
  });

  it("残業：09:30〜21:00 休憩1:00 → 勤務 10:30 / 残業 2:30", () => {
    const c = calcDay(work("09:30", "21:00", "01:00"), BASE);
    expect(c.work).toBe(10 * 60 + 30);
    expect(c.ot).toBe(2 * 60 + 30);
  });

  it("早退：残業はマイナスにしない", () => {
    const c = calcDay(work("09:30", "16:30", "01:00"), BASE);
    expect(c.work).toBe(6 * 60);
    expect(c.ot).toBe(0);
  });

  it("休憩が空欄なら0分として計算する（止めない）", () => {
    const c = calcDay({ kind: "勤務", startAt: "09:30", endAt: "18:30" }, BASE);
    expect(c.work).toBe(9 * 60);
    expect(c.ot).toBe(60);
    expect(c.error).toBe(false);
  });

  it("C-2 終了 ≦ 開始 は計算しない", () => {
    expect(calcDay(work("18:30", "09:30", "01:00"), BASE).error).toBe(true);
    expect(calcDay(work("09:30", "09:30", "01:00"), BASE).error).toBe(true);
  });

  it("C-2 休憩が勤務を超える場合も計算しない", () => {
    // 09:30〜10:30（1時間）に対して休憩2時間
    expect(calcDay(work("09:30", "10:30", "02:00"), BASE).error).toBe(true);
  });

  it("勤務以外の区分は計算対象外", () => {
    for (const kind of ["休日", "休暇", "祝日"] as const) {
      expect(calcDay({ kind }, BASE).work).toBeNull();
    }
  });

  // B-9（2026-10-02）：日付の画面は、打っている途中の値でも calcDay を呼ぶ。
  // 「2」で NaN が返り、「勤務 NaN:NaN　残業 NaN:NaN」と出ていた
  it("終業を打っている途中は計算しない（NaN を出さない・B-9）", () => {
    for (const endAt of ["2", "20", "20:"]) {
      const c = calcDay(work("09:00", endAt, "01:00"), BASE);
      expect(c.work, endAt).toBeNull();
      expect(c.ot, endAt).toBeNull();
      expect(c.bill, endAt).toBeNull();
    }
  });
});

describe("夜勤（日をまたぐ勤務・2026-08-05 追加）", () => {
  it("17:00〜26:00 休憩1:00 → 勤務 8:00 / 残業 0:00", () => {
    const c = calcDay(work("17:00", "26:00", "01:00"), BASE);
    expect(c.work).toBe(8 * 60);
    expect(c.ot).toBe(0);
    expect(c.error).toBe(false);
  });

  it("21:00〜29:00 休憩1:00 → 勤務 7:00（翌朝5時まで扱える）", () => {
    const c = calcDay(work("21:00", "29:00", "01:00"), BASE);
    expect(c.work).toBe(7 * 60);
  });

  it("24:00 ちょうどの終業も扱える（現行Excelに実例がある）", () => {
    // 15:00〜24:00 休憩1:00 ＝ 8:00
    const c = calcDay(work("15:00", "24:00", "01:00"), BASE);
    expect(c.work).toBe(8 * 60);
  });

  it("夜勤でも15分丸めは効く（17:00〜26:07 → 精算 8:00）", () => {
    const c = calcDay(work("17:00", "26:07", "01:00"), BASE);
    expect(c.work).toBe(8 * 60 + 7);
    expect(c.bill).toBe(8 * 60);
  });

  it("24時以降を使わず 02:00 と書いた日は、打ち間違いとして弾く", () => {
    // 夜勤は 26:00 と書く決まり。02:00 は「終了＜開始」なので C-2
    expect(calcDay(work("17:00", "02:00", "01:00"), BASE).error).toBe(true);
  });
});

describe("月の集計（§3）", () => {
  it("計算できない日は合計に含めず、日付を返す", () => {
    const days: DayMap = {
      3: work("09:30", "18:30", "01:00"),
      4: work("18:30", "09:30", "01:00"), // 矛盾
      5: { kind: "休暇", note: "夏季休暇" },
    };
    const m = calcMonth(2026, 8, days, BASE);
    expect(m.work).toBe(8 * 60);
    expect(m.days).toBe(2); // 区分が「勤務」の日数。矛盾した日も勤務として数える
    expect(m.errorDays).toEqual([4]);
  });
});

// ===================================================================
// isEmptyMonth（2026-08-08 に意味を変えた）
//
// 🔴 ここが今回いちばん壊れやすかったところ。
//
//    読み込み時に土日・祝日が自動で入るようになったので、
//    **「キーが1つでもあれば入力あり」と数えると、どの月も「入力あり」になる。**
//    そうなると、1日も入れていない月に **下限割れの減額** が出る。
//    月額契約なら「不足140時間ぶん」が丸ごと引かれ、金額がマイナスになる。
//
//    だから `auto`（自動で補った日）は数えない。
// ===================================================================

describe("isEmptyMonth 利用者が入れた記録があるか", () => {
  it("本当に空の月", () => {
    expect(isEmptyMonth({})).toBe(true);
  });

  it("🔴 自動で補った土日・祝日だけの月は「空」のまま", () => {
    // 8月は 10日の土日 ＋ 1日の祝日 が自動で入るが、利用者は何も入れていない
    const days = fillOffDays(2026, 8, {});
    expect(Object.keys(days).length).toBeGreaterThan(0); // 行はある
    expect(isEmptyMonth(days)).toBe(true); // それでも「空」
  });

  it("勤務を1日でも入れたら「空でない」", () => {
    const days = fillOffDays(2026, 8, { 3: work("09:30", "18:30", "01:00") });
    expect(isEmptyMonth(days)).toBe(false);
  });

  it("🔴 全日を休暇にした月は「空でない」（下限割れとして正しく警告するため）", () => {
    const days = fillOffDays(2026, 8, {
      3: { kind: "休暇", note: "夏季休暇" },
      4: { kind: "休暇", note: "夏季休暇" },
    });
    expect(isEmptyMonth(days)).toBe(false);
  });

  it("利用者が「休日」として保存した日も、入力に数える", () => {
    // auto が付いていない ＝ 自分で選んで保存した日
    expect(isEmptyMonth({ 3: { kind: "休日" } })).toBe(false);
  });
});
