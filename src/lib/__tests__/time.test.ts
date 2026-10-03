// ===================================================================
// 時刻の変換と、終業の入力補助（夜勤対応・2026-08-05）
// ===================================================================

import { describe, expect, it } from "vitest";
import { END_TIME_RE, TIME_RE } from "../constants";
import { normalizeEndTime, toHHMM, toHMM, toMin } from "../time";

describe("時刻 ⇄ 分", () => {
  it("24時以降も分に直せる", () => {
    expect(toMin("26:00")).toBe(26 * 60);
    expect(toMin("29:59")).toBe(29 * 60 + 59);
  });

  it("分から表示に戻せる", () => {
    expect(toHMM(26 * 60)).toBe("26:00");
    expect(toHHMM(26 * 60)).toBe("26:00");
  });

  it("未入力は null／「―」", () => {
    expect(toMin("")).toBeNull();
    expect(toHMM(null)).toBe("―");
  });

  // B-9（2026-10-02）：終業を打っている途中の「2」「20」で NaN を返し、
  // 日付の画面の合計が「勤務 NaN:NaN」になっていた。時:分 の形でなければ null
  it("打っている途中の形は null（NaN にしない・B-9）", () => {
    for (const s of ["2", "20", "20:", "20:0", ":", "ab:cd", "20:00:00"]) {
      expect(toMin(s), s).toBeNull();
    }
  });

  it("1桁の時も分に直せる（B-9 で形を決めたあとも読める）", () => {
    expect(toMin("9:30")).toBe(9 * 60 + 30);
  });
});

describe("時刻の形（DBの CHECK 制約と同じ条件）", () => {
  it("始業・休憩は 24:59 まで", () => {
    expect(TIME_RE.test("09:30")).toBe(true);
    expect(TIME_RE.test("24:00")).toBe(true);
    expect(TIME_RE.test("26:00")).toBe(false); // 始業が24時以降になることはない
    expect(TIME_RE.test("9:30")).toBe(false); // 2桁でないと弾く
  });

  it("終業は 29:59 まで許す（夜勤のため）", () => {
    expect(END_TIME_RE.test("18:30")).toBe(true);
    expect(END_TIME_RE.test("26:00")).toBe(true);
    expect(END_TIME_RE.test("29:59")).toBe(true);
    expect(END_TIME_RE.test("30:00")).toBe(false);
  });
});

describe("終業の入力補助", () => {
  it("桁を補う", () => {
    expect(normalizeEndTime("9:30")).toBe("09:30");
    expect(normalizeEndTime("26:0")).toBe("26:00");
  });

  it("区切りなしでも読み取る", () => {
    expect(normalizeEndTime("2600")).toBe("26:00");
    expect(normalizeEndTime("930")).toBe("09:30");
  });

  it("空はそのまま空", () => {
    expect(normalizeEndTime("  ")).toBe("");
  });

  it("読み取れないものは変えずに返す（画面側で赤く出す）", () => {
    expect(normalizeEndTime("よる")).toBe("よる");
  });
});
