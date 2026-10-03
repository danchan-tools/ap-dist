// ===================================================================
// B-3 契約条件を、先の月にも反映する（2026-09-15 追加）
//
// 🔴 ここが守るもの：
//    ① 前の月に書き込まないこと（parseCarryTargets）
//       前の月の設定が変わると、提出済みの金額が後から変わる（03_業務ロジック設計 §7.4）。
//       画面は後ろの月しか出さないが、API に届いた値はこの関数で必ず確かめる。
//    ② 画面の説明に、実際の月名が正しく入ること（carryNote）
//       「ここ」「この設定」のような言葉では伝わらなかった（段木さんの指摘）。
// ===================================================================

import { describe, expect, it } from "vitest";
import {
  MAX_CARRY_MONTHS,
  carryNote,
  monthIndex,
  monthLabel,
  parseCarryTargets,
} from "../carryOver";

const SEP = { year: 2026, month: 9 };

describe("parseCarryTargets（反映先の月を読む）", () => {
  it("送られてこなければ「この月だけ」", () => {
    expect(parseCarryTargets(undefined, SEP)).toEqual({ ok: true, months: [] });
    expect(parseCarryTargets(null, SEP)).toEqual({ ok: true, months: [] });
    expect(parseCarryTargets([], SEP)).toEqual({ ok: true, months: [] });
  });

  it("後ろの月は受け付け、古い順に並べる", () => {
    expect(parseCarryTargets(["2026-11", "2026-10"], SEP)).toEqual({
      ok: true,
      months: [
        { year: 2026, month: 10 },
        { year: 2026, month: 11 },
      ],
    });
  });

  it("同じ月が2回来ても、1回だけにする", () => {
    expect(parseCarryTargets(["2026-10", "2026-10"], SEP)).toEqual({
      ok: true,
      months: [{ year: 2026, month: 10 }],
    });
  });

  it("🔴 この月と同じ月が混ざったら、全体を弾く", () => {
    expect(parseCarryTargets(["2026-09"], SEP)).toEqual({ ok: false });
  });

  it("🔴 前の月が1つでも混ざったら、黙って捨てずに全体を弾く", () => {
    expect(parseCarryTargets(["2026-10", "2026-08"], SEP)).toEqual({ ok: false });
  });

  it("🔴 年をまたいでも前後を取り違えない（2025年12月は前、2027年1月は後ろ）", () => {
    expect(parseCarryTargets(["2025-12"], SEP)).toEqual({ ok: false });
    expect(parseCarryTargets(["2027-01"], SEP)).toEqual({
      ok: true,
      months: [{ year: 2027, month: 1 }],
    });
  });

  it("形が違えば弾く", () => {
    expect(parseCarryTargets("2026-10", SEP)).toEqual({ ok: false });
    expect(parseCarryTargets(["2026-9"], SEP)).toEqual({ ok: false });
    expect(parseCarryTargets([202610], SEP)).toEqual({ ok: false });
    expect(parseCarryTargets([null], SEP)).toEqual({ ok: false });
    expect(parseCarryTargets(["2026-13"], SEP)).toEqual({ ok: false });
  });

  it("数が多すぎれば弾く", () => {
    const many = Array.from({ length: MAX_CARRY_MONTHS + 1 }, () => "2027-01");
    expect(parseCarryTargets(many, SEP)).toEqual({ ok: false });
  });
});

describe("monthIndex・monthLabel", () => {
  it("年をまたいでも大小が正しく並ぶ", () => {
    expect(monthIndex({ year: 2025, month: 12 })).toBeLessThan(monthIndex({ year: 2026, month: 1 }));
  });

  it("同じ年なら月だけ、年が変われば年も書く（案A）", () => {
    expect(monthLabel({ year: 2026, month: 10 }, SEP)).toBe("10月");
    expect(monthLabel({ year: 2027, month: 1 }, SEP)).toBe("2027年1月");
  });
});

describe("carryNote（反映の欄の下に出す1行・案A）", () => {
  it("2026年9月を開き、10月・11月が並ぶとき（本番のデータと同じ形）", () => {
    const later = [
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ];
    expect(carryNote(SEP, later)).toBe("12月から先は11月と同じ設定、8月から前は変わりません。");
  });

  it("🔴 12月を開くと先の月は翌年なので、そちらにだけ年が付く", () => {
    const dec = { year: 2026, month: 12 };
    const later = [
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ];
    expect(carryNote(dec, later)).toBe(
      "2027年3月から先は2027年2月と同じ設定、11月から前は変わりません。",
    );
  });

  it("🔴 1月を開くと前の月が前の年なので、そちらにだけ年が付く", () => {
    const jan = { year: 2027, month: 1 };
    expect(carryNote(jan, [{ year: 2027, month: 2 }])).toBe(
      "3月から先は2月と同じ設定、2026年12月から前は変わりません。",
    );
  });

  it("11月の次は翌年の1月ではなく12月（年の繰り上がりを取り違えない）", () => {
    expect(carryNote(SEP, [{ year: 2026, month: 11 }])).toBe(
      "12月から先は11月と同じ設定、8月から前は変わりません。",
    );
  });

  it("月が飛んでいても、いちばん後ろの月で書く", () => {
    const later = [
      { year: 2026, month: 10 },
      { year: 2028, month: 1 },
    ];
    expect(carryNote(SEP, later)).toBe(
      "2028年2月から先は2028年1月と同じ設定、8月から前は変わりません。",
    );
  });

  it("並ぶ月が無ければ空（欄そのものを出さない）", () => {
    expect(carryNote(SEP, [])).toBe("");
  });
});
