// ===================================================================
// AC-5 5観点のチェックが正しく警告を出す
//
// 📌 ここは「下限割れ＝要対応／上限超過＝参考」という、
//    設計がいちばん強調した重さの区別を守る場所。
//    取り違えても画面は動いてしまうので、テストで固定する。
//
// ⚠️ 数字はすべてダミー（01_要件定義/03_制約・非機能要件.md §2.2）。
// ===================================================================

import { describe, expect, it } from "vitest";
import { isBreakMissing } from "../calc";
import { countAttention, hasBlockingError, runChecks } from "../checks";
import type { Contract, Day, DayMap } from "../types";

const BASE = 8 * 60;
const DUMMY: Contract = {
  kind: "月額",
  lo: 140 * 60,
  hi: 180 * 60,
  base: 600_000,
  underRate: 4_285,
  overRate: 3_333,
  hourlyRate: 0,
};

const work = (startAt: string, endAt: string, breakAt: string | null = "01:00"): Day => ({
  kind: "勤務",
  startAt,
  endAt,
  breakAt,
  place: "在宅",
  note: "通常業務",
});

/** 同じ勤務を n 日ぶん並べた月を作る */
function monthOf(n: number, day: Day): DayMap {
  const days: DayMap = {};
  for (let d = 1; d <= n; d++) days[d] = day;
  return days;
}

const run = (days: DayMap, contract: Contract = DUMMY, year = 2026, month = 8) =>
  runChecks({ year, month, days, contract, baseWorkMinutes: BASE });

const find = (days: DayMap, id: string, contract?: Contract) =>
  run(days, contract).filter((c) => c.id === id);

describe("C-4 契約時間（重さの区別がいちばん大事）", () => {
  it("下限割れは 🟥 要対応（high）", () => {
    // 8:00 × 17日 ＝ 136:00 < 140:00
    const c4 = find(monthOf(17, work("09:30", "18:30")), "C-4")[0];
    expect(c4.level).toBe("high");
    expect(c4.title).toContain("下回っています");
  });

  it("上限超過は ℹ️ 参考（info）。要対応にしない", () => {
    // 11:00 × 20日 ＝ 220:00 > 180:00
    const c4 = find(monthOf(20, work("09:30", "21:30")), "C-4")[0];
    expect(c4.level).toBe("info");
    expect(c4.level).not.toBe("high");
  });

  it("範囲内は ✅ OK", () => {
    // 8:00 × 20日 ＝ 160:00
    expect(find(monthOf(20, work("09:30", "18:30")), "C-4")[0].level).toBe("ok");
  });

  it("🔴 実勤務では足りているが、精算時間では下限を割る月を見逃さない", () => {
    // 8:14 × 17日 ＝ 実 139:58／精算は 8:00 × 17 ＝ 136:00
    // 実時間で判定していると 139:58 でも「あと2分」に見えるが、
    // 精算時間では 4:00 も足りない（§7.7 の「実時間で計算すると見逃す」）
    const days = monthOf(17, work("09:30", "18:44"));
    const c4 = find(days, "C-4")[0];
    expect(c4.level).toBe("high");
    expect(c4.desc).toContain("実 139:58");
    expect(c4.desc).toContain("精算 136:00");
  });

  it("まだ1日も入力がない月は判定を保留する（金額がマイナスになるのを防ぐ）", () => {
    const c4 = find({}, "C-4")[0];
    expect(c4.level).toBe("info");
    expect(c4.title).toContain("まだできません");
    expect(c4.level).not.toBe("high");
  });
});

describe("C-1 休憩の未入力", () => {
  it("空欄なら ⚠️ 確認。その日を指し示す", () => {
    const found = find({ 3: work("09:30", "18:30", null) }, "C-1");
    const warn = found.find((c) => c.level === "warn");
    expect(warn?.day).toBe(3);
  });

  it("0:00 も未入力として扱う", () => {
    expect(find({ 3: work("09:30", "18:30", "00:00") }, "C-1")[0].level).toBe("warn");
  });

  it("全日入っていれば ✅ OK として出す（チェックが動いていることが分かるように）", () => {
    const ok = find(monthOf(20, work("09:30", "18:30")), "C-1")[0];
    expect(ok.level).toBe("ok");
  });

  // I-5（2026-09-15）：午後休の日に ⚠️ が消せなかった
  it("🔴 午後休（09:30〜13:00・休憩なし）は ⚠️ を出さない", () => {
    const found = find({ 10: work("09:30", "13:00", null) }, "C-1");
    expect(found.some((c) => c.level === "warn")).toBe(false);
    expect(found[0].level).toBe("ok");
  });

  // 2026-09-16：午前休も同じ判定で出ないことを、テストで押さえる（段木さんの確認事項）
  it("🔴 午前休（14:00〜18:30・休憩なし）も ⚠️ を出さない", () => {
    const found = find({ 10: work("14:00", "18:30", null) }, "C-1");
    expect(found.some((c) => c.level === "warn")).toBe(false);
    expect(found[0].level).toBe("ok");
  });

  it("休憩に 00:00 を入れた短い日も ⚠️ を出さない", () => {
    expect(find({ 10: work("09:30", "13:00", "00:00") }, "C-1")[0].level).toBe("ok");
  });

  it("6:00 ちょうどは知らせない（境界。6時間を【超える】ときだけ知らせる）", () => {
    expect(find({ 10: work("09:30", "15:30", null) }, "C-1")[0].level).toBe("ok");
  });

  it("6:01 は ⚠️ 確認", () => {
    expect(find({ 10: work("09:30", "15:31", null) }, "C-1")[0].level).toBe("warn");
  });

  it("夜勤（17:00〜26:00・休憩なし）は9時間あるので ⚠️ 確認", () => {
    expect(find({ 10: work("17:00", "26:00", null) }, "C-1")[0].level).toBe("warn");
  });
});

describe("isBreakMissing（C-1 の判定を1か所に集めたもの・I-5）", () => {
  it("勤務以外の日は知らせない", () => {
    expect(isBreakMissing({ kind: "休暇" })).toBe(false);
  });

  it("休憩が入っていれば知らせない", () => {
    expect(isBreakMissing(work("09:30", "18:30", "01:00"))).toBe(false);
  });

  it("⚠️ 始業か終業が空の日は、長さが分からないので知らせる", () => {
    expect(isBreakMissing(work("09:30", "", null))).toBe(true);
  });
});

describe("C-2 時刻の矛盾（🔴 必須・出力をブロックする）", () => {
  it("終了 ≦ 開始 は error", () => {
    const checks = run({ 4: work("18:30", "09:30") });
    expect(hasBlockingError(checks)).toBe(true);
    expect(checks.find((c) => c.id === "C-2")?.title).toContain("終了が開始より前");
  });

  it("休憩が勤務を超える場合は、別の文言で error", () => {
    const c2 = run({ 4: work("09:30", "10:30", "02:00") }).find((c) => c.level === "error");
    expect(c2?.title).toContain("休憩が勤務の時間を超えています");
  });

  it("夜勤（17:00〜26:00）は矛盾にしない", () => {
    expect(hasBlockingError(run({ 4: work("17:00", "26:00") }))).toBe(false);
  });

  it("矛盾がなければ ✅ OK として出す", () => {
    expect(find(monthOf(20, work("09:30", "18:30")), "C-2")[0].level).toBe("ok");
  });
});

describe("C-3 残業の超過", () => {
  it("45:00 ちょうどは超過にしない（境界）", () => {
    // 11:00 × 15日 ＝ 残業 3:00 × 15 ＝ 45:00
    expect(find(monthOf(15, work("09:30", "21:30")), "C-3")[0].level).toBe("ok");
  });

  it("45:00 を超えたら ⚠️ 確認", () => {
    expect(find(monthOf(16, work("09:30", "21:30")), "C-3")[0].level).toBe("warn");
  });
});

describe("C-5 祝日表の状態（2026-08-05 追加／2026-08-08 に予測の年を分けた）", () => {
  const c5of = (year: number) =>
    run(monthOf(20, work("09:30", "18:30")), DUMMY, year, 1).find((c) => c.id === "C-5");

  it("C-5a 表がない年は ⚠️ 確認（祝日が勤務日として入るため）", () => {
    expect(c5of(2036)?.level).toBe("warn");
    expect(c5of(2036)?.title).toContain("2036年");
  });

  it("C-5b 予測の年は ℹ️ 参考（祝日は入るが、官報で確定していない）", () => {
    expect(c5of(2028)?.level).toBe("info");
    expect(c5of(2028)?.title).toContain("2028年");
  });

  it("🔴 官報で確定している年は、何も出さない", () => {
    expect(c5of(2026)).toBeUndefined();
    expect(c5of(2027)).toBeUndefined();
  });

  it("🔴 予測の年は件数に数えない（毎月おなじ警告で本当の指摘が埋もれるため）", () => {
    const checks = run(monthOf(20, work("09:30", "18:30")), DUMMY, 2028, 1);
    expect(countAttention(checks)).toBe(countAttention(run(monthOf(20, work("09:30", "18:30")))));
  });
});

describe("件数の数え方（§6）", () => {
  it("「参考」と「OK」は件数に数えない", () => {
    // 上限超過だけの月 → C-4 は info、C-1・C-2・C-3 は ok
    const checks = run(monthOf(20, work("09:30", "21:30")));
    expect(checks.some((c) => c.level === "info")).toBe(true);
    expect(countAttention(checks)).toBe(1); // C-3 の残業超過のみ
  });

  it("必須・要対応・確認だけを数える", () => {
    const checks = run({ 3: work("09:30", "18:30", null), 4: work("18:30", "09:30") });
    // C-1(warn) ＋ C-2(error) ＋ C-3(ok) ＋ C-4(high) → 3件
    expect(countAttention(checks)).toBe(3);
  });
});

// ===================================================================
// 拡張2 時給契約（08_将来の拡張設計.md §3.5）
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

describe("C-6 時給の未入力（拡張2で新設）", () => {
  it("時給が 0 なら ⚠️ 確認（warn）。出力は止めない", () => {
    const c = find(monthOf(20, work("09:30", "18:30")), "C-6", { ...HOURLY, hourlyRate: 0 });
    expect(c).toHaveLength(1);
    expect(c[0].level).toBe("warn");
    // 🔴 error にしない。時給が未入力でも勤務表そのものは正しく、Excel にも単価は出さない
    expect(hasBlockingError(run(monthOf(20, work("09:30", "18:30")), { ...HOURLY, hourlyRate: 0 }))).toBe(false);
  });

  it("時給が入っていれば ✅（判定したことを残す）", () => {
    const c = find(monthOf(20, work("09:30", "18:30")), "C-6", HOURLY);
    expect(c).toHaveLength(1);
    expect(c[0].level).toBe("ok");
  });

  it("🔴 月額契約では C-6 を判定しない（時給の欄そのものが無いため）", () => {
    expect(find(monthOf(20, work("09:30", "18:30")), "C-6", DUMMY)).toHaveLength(0);
  });

  it("🔴 時給0・下限なしの月は、C-6 が無いと警告が1つも出ない", () => {
    // 月額なら単価0でも C-4 が下限割れで鳴る。時給契約はここが盲点になる。
    // しかも月額→時給に切り替えると必ず一度この状態を通る
    const checks = run(monthOf(20, work("09:30", "18:30")), { ...HOURLY, hourlyRate: 0 });
    expect(countAttention(checks)).toBe(1); // C-6 だけ
    expect(checks.filter((c) => c.level === "warn").map((c) => c.id)).toEqual(["C-6"]);
  });
});

describe("C-4 時給契約（範囲がないときの言い方）", () => {
  it("🔴 下限・上限が空なら ℹ️ 参考。緑の『範囲に収まっています』を出さない", () => {
    const c = find(monthOf(20, work("09:30", "18:30")), "C-4", HOURLY);
    expect(c).toHaveLength(1);
    expect(c[0].level).toBe("info");
    expect(c[0].title).toContain("時給契約");
    // 範囲がないのに「範囲内」と言わない
    expect(c[0].title).not.toContain("範囲に収まって");
  });

  it("下限だけ入れれば、下限だけで判定する", () => {
    const loOnly: Contract = { ...HOURLY, lo: 140 * 60 };
    // 8:00 × 17日 ＝ 136:00 < 140:00
    const short = find(monthOf(17, work("09:30", "18:30")), "C-4", loOnly);
    expect(short[0].level).toBe("high");
    // 🔴 時給契約に減額の仕組みは無いので「¥0 の減額」と書かない
    expect(short[0].desc).not.toContain("の減額");
    expect(short[0].desc).toContain("見込み");

    // 満たしていれば ok。ただし上限は存在しないので「範囲」と言わない
    const okc = find(monthOf(20, work("09:30", "18:30")), "C-4", loOnly);
    expect(okc[0].level).toBe("ok");
    expect(okc[0].title).toContain("下限");
    expect(okc[0].title).not.toContain("範囲に収まって");
  });

  it("🔴 空の下限・上限を 0:00 と書かない（「―」と出す）", () => {
    const c = find(monthOf(20, work("09:30", "18:30")), "C-4", { ...HOURLY, lo: 140 * 60 });
    expect(c[0].desc).toContain("140:00〜―");
  });
});

describe("C-4 上限だけの契約（レビューで見つかった穴）", () => {
  it("🔴 説明文の括弧が壊れない", () => {
    // もとは「下限の文」と「上限の文」をそれぞれ足す書き方で、
    // 上限だけの月に「　（／上限まであと 5:00）」と、
    // 先頭にスラッシュの残った括弧が出ていた。
    // 「下限だけ」のテストしか書いていなかったため、見つからなかった
    const hiOnly: Contract = { ...HOURLY, hi: 180 * 60 };
    const c = find(monthOf(20, work("09:30", "18:30")), "C-4", hiOnly);
    expect(c[0].level).toBe("ok");
    expect(c[0].desc).not.toContain("（／");
    expect(c[0].desc).toContain("上限まであと");
    expect(c[0].desc).not.toContain("下限を");
  });

  it("上限だけなら、タイトルも「範囲」と言わない", () => {
    const hiOnly: Contract = { ...HOURLY, hi: 180 * 60 };
    const c = find(monthOf(20, work("09:30", "18:30")), "C-4", hiOnly);
    expect(c[0].title).toContain("上限");
    expect(c[0].title).not.toContain("範囲に収まって");
  });

  it("両方入っていれば、いままでどおり「範囲」と言う", () => {
    const both: Contract = { ...HOURLY, lo: 140 * 60, hi: 180 * 60 };
    const c = find(monthOf(20, work("09:30", "18:30")), "C-4", both);
    expect(c[0].title).toBe("契約時間の範囲に収まっています");
    expect(c[0].desc).toContain("下限を");
    expect(c[0].desc).toContain("上限まであと");
  });
});
