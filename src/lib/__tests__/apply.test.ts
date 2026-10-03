// ===================================================================
// AC-2 基本パターンを1回入力すると、その月の平日すべてに値が入る
// AC-3 土日・祝日が自動で休日扱いになる
//
// あわせて、暦まわり（月の日数・年またぎ）も固定する。
// ===================================================================

import { describe, expect, it } from "vitest";
import { DEFAULT_NOTE, expandPattern, fillOffDays, offDayOf, toDbRow } from "../apply";
import { daysIn, dowOf, parseYm, shiftMonth, ymKey } from "../calendar";
import { hasHolidayTable, holidayOf } from "../holidays";
import type { DayMap, Pattern } from "../types";

const PATTERN: Pattern = { start: "09:30", end: "18:30", brk: "01:00", place: "在宅" };

describe("AC-2 / AC-3 基本パターンの一括反映", () => {
  const days = expandPattern(2026, 8, PATTERN);

  it("31日ぶんが埋まる", () => {
    expect(Object.keys(days)).toHaveLength(31);
  });

  it("平日は「勤務」＋パターンの値が入る", () => {
    // 2026-08-03 は月曜
    expect(days[3]).toEqual({
      kind: "勤務",
      startAt: "09:30",
      endAt: "18:30",
      breakAt: "01:00",
      place: "在宅",
      note: DEFAULT_NOTE,
    });
  });

  it("土日は「休日」で、時刻を持たない", () => {
    expect(days[1]).toEqual({ kind: "休日" }); // 8/1 土
    expect(days[2]).toEqual({ kind: "休日" }); // 8/2 日
  });

  it("祝日は「祝日」＋備考に祝日名", () => {
    expect(days[11]).toEqual({ kind: "祝日", note: "山の日" }); // 8/11 山の日
  });

  it("平日20日・土日10日・祝日1日になる", () => {
    const count = (kind: string) => Object.values(days).filter((d) => d?.kind === kind).length;
    expect(count("勤務")).toBe(20);
    expect(count("休日")).toBe(10);
    expect(count("祝日")).toBe(1);
  });

  it("その月に無い日は作らない（2月は28日まで）", () => {
    expect(Object.keys(expandPattern(2026, 2, PATTERN))).toHaveLength(28);
  });

  it("🔴 祝日表のない年は、祝日が勤務日として入る（C-5 が警告する前提）", () => {
    // 2036-01-01（火）は元日だが、表が 2035年までなので勤務になる
    // 📌 2026-08-08 に表を 2035年まで足したので、ここは 2027 → 2036 に変えた
    expect(expandPattern(2036, 1, PATTERN)[1]?.kind).toBe("勤務");
    expect(hasHolidayTable(2036)).toBe(false);
    expect(hasHolidayTable(2026)).toBe(true);
  });

  it("祝日は年も見る（ある年の表を他の年に流用しない）", () => {
    // 成人の日は「1月の第2月曜」なので、年によって日が動く
    expect(holidayOf(2026, 1, 12)).toBe("成人の日");
    expect(holidayOf(2027, 1, 12)).toBeNull();
    expect(holidayOf(2027, 1, 11)).toBe("成人の日");
  });

  it("夜勤のパターンも展開できる", () => {
    const night = expandPattern(2026, 8, { ...PATTERN, start: "17:00", end: "26:00" });
    expect(night[3]?.endAt).toBe("26:00");
  });
});

describe("DBへ渡す直前の整形（勤務以外は NULL に落とす）", () => {
  it("勤務はそのまま", () => {
    expect(toDbRow({ kind: "勤務", startAt: "09:30", endAt: "18:30", breakAt: "01:00", place: "在宅", note: "x" }))
      .toEqual({ kind: "勤務", startAt: "09:30", endAt: "18:30", breakAt: "01:00", place: "在宅", note: "x" });
  });

  it("🔴 勤務以外は、時刻も場所もすべて null にする", () => {
    // 画面の作業場所は select なので、無効化しても値が残る。
    // そのまま送ると DB の days_work_has_times 制約に弾かれる
    expect(toDbRow({ kind: "休暇", startAt: "09:30", endAt: "18:30", breakAt: "01:00", place: "在宅", note: "夏季休暇" }))
      .toEqual({ kind: "休暇", startAt: null, endAt: null, breakAt: null, place: null, note: "夏季休暇" });
  });

  it("空文字は null にそろえる", () => {
    const row = toDbRow({ kind: "勤務", startAt: "09:30", endAt: "18:30", breakAt: "", place: "在宅", note: "" });
    expect(row.breakAt).toBeNull();
    expect(row.note).toBeNull();
  });
});

describe("暦まわり", () => {
  it("月の日数（うるう年を含む）", () => {
    expect(daysIn(2026, 2)).toBe(28);
    expect(daysIn(2028, 2)).toBe(29);
    expect(daysIn(2026, 4)).toBe(30);
    expect(daysIn(2026, 8)).toBe(31);
  });

  it("曜日", () => {
    expect(dowOf(2026, 8, 11)).toBe("火");
    expect(dowOf(2026, 8, 1)).toBe("土");
  });

  it("年をまたぐ月移動", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("年月キーの読み書き", () => {
    expect(ymKey(2026, 8)).toBe("2026-08");
    expect(parseYm("2026-08")).toEqual({ year: 2026, month: 8 });
  });

  it("ありえない年月は受け付けない", () => {
    expect(parseYm("2026-13")).toBeNull();
    expect(parseYm("2026-00")).toBeNull();
    expect(parseYm("2026-8")).toBeNull();
    // 年0〜99 は Date が1900年代と解釈してしまうので弾く
    expect(parseYm("0000-01")).toBeNull();
    expect(parseYm("1999-12")).toBeNull();
  });
});

// ===================================================================
// 読み込み時の補完（2026-08-08 追加）
//
// 「営業日すべてに反映する」を押していなくても、土日と祝日は入っている。
// 🔴 ここが守るもの：**記録がある日を絶対に上書きしないこと。**
//    上書きすると、利用者が直した休日出勤が黙って消える。
// ===================================================================

describe("offDayOf 働かない日の判定（土日・祝日を1か所で決める）", () => {
  it("土曜・日曜は休日", () => {
    expect(offDayOf(2026, 8, 1)).toEqual({ kind: "休日" }); // 土
    expect(offDayOf(2026, 8, 2)).toEqual({ kind: "休日" }); // 日
  });

  it("平日の祝日は、備考に祝日名が入る", () => {
    expect(offDayOf(2026, 8, 11)).toEqual({ kind: "祝日", note: "山の日" }); // 火
  });

  it("ふつうの平日は null", () => {
    expect(offDayOf(2026, 8, 3)).toBeNull(); // 月
  });

  it("🔴 土日が祝日より先（2028-01-01 は元日だが土曜なので休日）", () => {
    expect(holidayOf(2028, 1, 1)).toBe("元日");
    expect(offDayOf(2028, 1, 1)).toEqual({ kind: "休日" });
  });

  it("祝日表のない年は、平日のまま", () => {
    expect(hasHolidayTable(2036)).toBe(false);
    expect(offDayOf(2036, 1, 1)).toBeNull(); // 2036-01-01 は火曜
  });
});

describe("fillOffDays 記録が無い日を補う", () => {
  it("空の月でも、土日と祝日は入る", () => {
    const days = fillOffDays(2026, 8, {});
    expect(days[1]?.kind).toBe("休日"); // 8/1 土
    expect(days[11]).toMatchObject({ kind: "祝日", note: "山の日" }); // 8/11 火
  });

  it("🔴 平日は埋めない（基本パターンを入れるのは利用者の操作）", () => {
    const days = fillOffDays(2026, 8, {});
    expect(days[3]).toBeUndefined(); // 8/3 月
    // 8月の平日20日のうち、祝日 8/11 だけが埋まる → 補われるのは 10土日 + 1祝日
    expect(Object.keys(days)).toHaveLength(11);
  });

  it("🔴 記録がある日は上書きしない（土曜の休日出勤が消えない）", () => {
    const saved: DayMap = {
      1: { kind: "勤務", startAt: "09:30", endAt: "18:30", breakAt: "01:00", place: "在宅" },
    };
    const days = fillOffDays(2026, 8, saved);
    expect(days[1]?.kind).toBe("勤務");
    expect(days[1]?.startAt).toBe("09:30");
    expect(days[1]?.auto).toBeUndefined();
  });

  it("🔴 祝日を「勤務」に直した日も、そのまま残る", () => {
    const saved: DayMap = { 11: { kind: "勤務", startAt: "09:30", endAt: "18:30" } };
    expect(fillOffDays(2026, 8, saved)[11]?.kind).toBe("勤務");
  });

  it("🔴 補った日には auto が付く（利用者が入れた日と見分けるため）", () => {
    const days = fillOffDays(2026, 8, {});
    expect(days[1]?.auto).toBe(true);
    expect(days[11]?.auto).toBe(true);
  });

  it("もとの DayMap を書き換えない", () => {
    const saved: DayMap = {};
    fillOffDays(2026, 8, saved);
    expect(Object.keys(saved)).toHaveLength(0);
  });

  it("🔴 auto は DB に渡らない（toDbRow が落とす）", () => {
    const day = fillOffDays(2026, 8, {})[1]!;
    expect(day.auto).toBe(true);
    expect(toDbRow(day)).not.toHaveProperty("auto");
  });

  it("祝日表のない年は、土日だけ入る", () => {
    const days = fillOffDays(2036, 1, {});
    expect(days[1]).toBeUndefined(); // 2036-01-01 火。元日だが表が無い
    expect(days[5]?.kind).toBe("休日"); // 2036-01-05 土
  });
});
