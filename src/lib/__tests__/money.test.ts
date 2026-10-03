// ===================================================================
// AC-9：契約条件を設定すると、見込み金額が計算式どおりに表示される
//        （03_業務ロジック設計 §7.3 の7ケースで検証）
//
// ⚠️ ここで使う数字はすべて【ダミー】。実際の契約の単価ではない
//    （01_要件定義/03_制約・非機能要件.md §2.1）。
// ===================================================================

import { describe, expect, it } from "vitest";
import { autoRates, calcMoney, hasRate } from "../money";
import type { Contract } from "../types";

/** ダミーの契約条件：下限140:00・上限180:00・月額600,000円 */
const DUMMY: Contract = {
  kind: "月額",
  lo: 140 * 60,
  hi: 180 * 60,
  base: 600_000,
  underRate: 4_285,
  overRate: 3_333,
  hourlyRate: 0,
};

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

describe("AC-9 見込み金額（§7.3 の7ケース）", () => {
  const cases = [
    { bill: h(130), state: "short", diff: h(10), total: 557_150, label: "130:00 下限割れ" },
    { bill: h(137, 30), state: "short", diff: h(2, 30), total: 589_287, label: "137:30 下限割れ" },
    { bill: h(140), state: "inRange", diff: 0, total: 600_000, label: "140:00 下限ちょうど＝範囲内" },
    { bill: h(160), state: "inRange", diff: 0, total: 600_000, label: "160:00 範囲内" },
    { bill: h(180), state: "inRange", diff: 0, total: 600_000, label: "180:00 上限ちょうど＝範囲内" },
    { bill: h(190), state: "excess", diff: h(10), total: 633_330, label: "190:00 上限超過" },
    { bill: h(200, 30), state: "excess", diff: h(20, 30), total: 668_327, label: "200:30 上限超過" },
  ] as const;

  for (const c of cases) {
    it(c.label, () => {
      const m = calcMoney(c.bill, DUMMY);
      expect(m.state).toBe(c.state);
      expect(m.total).toBe(c.total);
      if (c.state === "short") expect(m.shortMin).toBe(c.diff);
      if (c.state === "excess") expect(m.excessMin).toBe(c.diff);
    });
  }
});

describe("単価の自動計算（§7.1）", () => {
  it("端数は切り捨て。四捨五入ではない", () => {
    // 600000 ÷ 140 = 4285.71…  → 4285（四捨五入なら 4286 になってしまう）
    // 600000 ÷ 180 = 3333.33…  → 3333
    expect(autoRates(600_000, 140, 180)).toEqual({ underRate: 4_285, overRate: 3_333 });
  });
});

describe("境界（§7.2）", () => {
  it("不足と超過は同時に起きない", () => {
    for (const bill of [0, h(1), h(140), h(160), h(180), h(300)]) {
      const m = calcMoney(bill, DUMMY);
      expect(m.shortMin > 0 && m.excessMin > 0).toBe(false);
    }
  });

  it("下限ちょうど・上限ちょうどは増減なし", () => {
    expect(calcMoney(DUMMY.lo!, DUMMY).total).toBe(DUMMY.base);
    expect(calcMoney(DUMMY.hi!, DUMMY).total).toBe(DUMMY.base);
  });
});

// ===================================================================
// 拡張2 時給契約（08_将来の拡張設計.md §3.4）
//
// ⚠️ ここで使う数字もすべて【ダミー】。
// ===================================================================

/** ダミーの時給契約：下限・上限なし・時給3,333円 */
const HOURLY: Contract = {
  kind: "時給",
  lo: null,
  hi: null,
  base: 0,
  underRate: 0,
  overRate: 0,
  hourlyRate: 3_333,
};

describe("拡張2 時給契約の金額", () => {
  it("見込み金額は 精算時間 × 時給", () => {
    expect(calcMoney(h(100), HOURLY).total).toBe(333_300);
  });

  it("🔴 1円未満は切り捨て（四捨五入だと 2,500 になる例で見張る）", () => {
    // 3,333円 × 0:45 ＝ 2,499.75円
    // 切り捨て 2,499／四捨五入 2,500／切り上げ 2,500
    // 🔴 0:15（833.25円）だと切り捨ても四捨五入も 833 になり、取り違えを捕まえられない
    expect(calcMoney(h(0, 45), HOURLY).total).toBe(2_499);
  });

  it("🔴 掛けてから割る（15分単位のすべてで、割ってから掛けた値と一致する）", () => {
    // いまの精算単位（15分）では、どちらの順でも答えは同じはず。
    // ここが崩れたら、丸め方か単位のどちらかを壊している
    for (let min = 0; min <= 31 * 24 * 60; min += 15) {
      const a = Math.floor((min * HOURLY.hourlyRate) / 60);
      const b = Math.floor((min / 60) * HOURLY.hourlyRate);
      expect(a).toBe(b);
    }
  });

  it("減額・増額は常に 0（時給契約に増減の仕組みは無い）", () => {
    for (const bill of [0, h(1), h(140), h(300)]) {
      const m = calcMoney(bill, HOURLY);
      expect(m.deduct).toBe(0);
      expect(m.add).toBe(0);
      expect(m.base).toBe(0);
    }
  });

  it("入力がゼロの月は 0円（月額と違い、これが正解）", () => {
    expect(calcMoney(0, HOURLY).total).toBe(0);
  });

  it("🔴 下限・上限が両方とも空なら state は hourly（inRange にしない）", () => {
    // inRange を返すと、画面に「契約時間の範囲に収まっています」と緑で出る。
    // 範囲がないのに「範囲内」は誤り
    const m = calcMoney(h(160), HOURLY);
    expect(m.state).toBe("hourly");
    expect(m.hasLo).toBe(false);
    expect(m.hasHi).toBe(false);
  });

  it("下限だけ入れれば、下限だけで判定する", () => {
    const loOnly: Contract = { ...HOURLY, lo: h(140) };
    expect(calcMoney(h(130), loOnly).state).toBe("short");
    expect(calcMoney(h(130), loOnly).shortMin).toBe(h(10));
    // 上限は存在しないので、いくら働いても超過にならない
    expect(calcMoney(h(300), loOnly).state).toBe("inRange");
    expect(calcMoney(h(300), loOnly).excessMin).toBe(0);
    expect(calcMoney(h(300), loOnly).hasHi).toBe(false);
  });

  it("上限だけ入れれば、上限だけで判定する", () => {
    const hiOnly: Contract = { ...HOURLY, hi: h(150) };
    expect(calcMoney(h(160), hiOnly).state).toBe("excess");
    expect(calcMoney(h(160), hiOnly).excessMin).toBe(h(10));
    // 下限は存在しないので、働かなくても下限割れにならない
    expect(calcMoney(0, hiOnly).state).toBe("inRange");
    expect(calcMoney(0, hiOnly).shortMin).toBe(0);
  });

  it("🔴 下限が空のとき、null を 0 として計算しない", () => {
    // `Math.max(0, null - billMin)` は null が 0 に化けて、下限0として静かに通る
    const m = calcMoney(h(100), HOURLY);
    expect(m.shortMin).toBe(0);
    expect(m.excessMin).toBe(0);
  });

  it("上限を超えても、時給契約では金額の出し方が変わらない", () => {
    const hiOnly: Contract = { ...HOURLY, hi: h(150) };
    // 働いた分だけ。超過単価という考えが無い
    expect(calcMoney(h(160), hiOnly).total).toBe(calcMoney(h(160), HOURLY).total);
  });
});

describe("拡張2 単価が入っているかの判定（hasRate）", () => {
  it("月額契約は基本単価を見る", () => {
    expect(hasRate(DUMMY)).toBe(true);
    expect(hasRate({ ...DUMMY, base: 0 })).toBe(false);
  });

  it("🔴 時給契約は時給を見る（基本単価が0でも金額を出す）", () => {
    // ここを base で判定すると、時給契約の金額が永久に「―」になる
    expect(hasRate(HOURLY)).toBe(true);
    expect(hasRate({ ...HOURLY, hourlyRate: 0 })).toBe(false);
  });
});
