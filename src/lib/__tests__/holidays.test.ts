// ===================================================================
// 祝日表（03_業務ロジック設計 §5）
//
// 🔴 ここが守っているもの：**表に写し間違いが無いこと。**
//
//    祝日表は手で貼る。貼り間違えても画面は普通に動き、
//    その年だけ祝日が「勤務」になる。しかも C-5 は
//    「表がある」と判断して黙るので、**警告ごと消える。**
//
//    だから、貼った表を毎回ルールと突き合わせる。
//    ルールは `scripts/gen-holidays.mjs`（唯一の実装）から読み込む。
//
// 📌 ルール自体が正しいことは、①2026年の表（2026-08-05 から使っている）と
//    ②国立天文台の官報（暦要項）で確かめてある。
//    ②の実値は §「官報で確かめた日付」に固定してある。
// ===================================================================

import { describe, expect, it } from "vitest";
// 🔴 唯一のルール実装。テストの中にルールを書き直さない（直し忘れる場所が2つできる）
import { allHolidays } from "../../../scripts/gen-holidays.mjs";
import { daysIn } from "../calendar";
import {
  CONFIRMED_THROUGH,
  hasHolidayTable,
  holidayOf,
  isPredictedYear,
  tabledYears,
} from "../holidays";

/** holidays.ts が実際に返す、その年の全祝日を `{ "M-D": 名前 }` で集める */
function tableOf(year: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysIn(year, m); d++) {
      const name = holidayOf(year, m, d);
      if (name) out[`${m}-${d}`] = name;
    }
  }
  return out;
}

describe("祝日表とルールが一致している", () => {
  it.each(tabledYears())("%i年", (year) => {
    expect(tableOf(year)).toEqual(allHolidays(year));
  });

  it("2024〜2035 が抜けなく載っている", () => {
    const years = tabledYears();
    expect(years[0]).toBe(2024);
    expect(years[years.length - 1]).toBe(2035);
    expect(years).toHaveLength(2035 - 2024 + 1);
  });
});

describe("官報で確かめた日付（国立天文台 暦要項）", () => {
  // 🔴 ここだけは生成ルールを通さず、公告された実値を直に固定する。
  //    ルールと表が「同じ間違い」をしていたら、上のテストでは捕まらないため。
  it("2024年：春分 3/20・秋分 9/22（秋分が日曜なので 9/23 が振替休日）", () => {
    expect(holidayOf(2024, 3, 20)).toBe("春分の日");
    expect(holidayOf(2024, 9, 22)).toBe("秋分の日");
    expect(holidayOf(2024, 9, 23)).toBe("振替休日");
  });

  it("2025年：春分 3/20・秋分 9/23", () => {
    expect(holidayOf(2025, 3, 20)).toBe("春分の日");
    expect(holidayOf(2025, 9, 23)).toBe("秋分の日");
  });

  it("2026年：春分 3/20・秋分 9/23（9/22 は国民の休日）", () => {
    expect(holidayOf(2026, 3, 20)).toBe("春分の日");
    expect(holidayOf(2026, 9, 22)).toBe("国民の休日");
    expect(holidayOf(2026, 9, 23)).toBe("秋分の日");
  });

  it("2027年：春分 3/21（日曜なので 3/22 が振替休日）・秋分 9/23", () => {
    expect(holidayOf(2027, 3, 21)).toBe("春分の日");
    expect(holidayOf(2027, 3, 22)).toBe("振替休日");
    expect(holidayOf(2027, 9, 23)).toBe("秋分の日");
  });

  it("🔴 2020年の改称後なので「体育の日」ではなく「スポーツの日」", () => {
    expect(holidayOf(2024, 10, 14)).toBe("スポーツの日");
  });
});

describe("確定と予測の切り分け（C-5 が何を出すかを決める）", () => {
  it("官報で確定しているのは 2027年まで", () => {
    expect(CONFIRMED_THROUGH).toBe(2027);
  });

  it("確定の年は「予測」ではない", () => {
    expect(isPredictedYear(2026)).toBe(false);
    expect(isPredictedYear(2027)).toBe(false);
  });

  it("2028年から先は「予測」", () => {
    expect(isPredictedYear(2028)).toBe(true);
    expect(isPredictedYear(2035)).toBe(true);
  });

  it("🔴 表が無い年は「予測」ではない（別の状態・別の警告）", () => {
    expect(hasHolidayTable(2036)).toBe(false);
    expect(isPredictedYear(2036)).toBe(false);
  });

  it("表がある年・ない年", () => {
    expect(hasHolidayTable(2023)).toBe(false);
    expect(hasHolidayTable(2024)).toBe(true);
    expect(hasHolidayTable(2035)).toBe(true);
  });
});
