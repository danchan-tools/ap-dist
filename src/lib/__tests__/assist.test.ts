// ===================================================================
// F-10 AIアシスタント：提案の検証（06_AIアシスタント設計.md §9.1 の10項目）
//
// 🔴 ここが「AIを信じない」の本体。
//    存在しない日・範囲外の時刻・勤務なのに時刻が空、は普通に返ってくる。
//    10項目それぞれに、落ちることを確かめるテストを置く。
// ===================================================================

import { describe, expect, it } from "vitest";
import {
  buildAssistInput,
  HISTORY_LIMIT,
  trimHistory,
  validateChanges,
  validateReply,
  type RawChange,
} from "../assist";
import type { DayMap } from "../types";

const BASE = 480; // 基準労働時間 8:00

/** 2026年8月。3日(月)は勤務、12日(水)も勤務、1日(土)は休日 */
const CURRENT: DayMap = {
  1: { kind: "休日" },
  3: { kind: "勤務", startAt: "09:30", endAt: "18:30", breakAt: "01:00", place: "在宅", note: "通常業務" },
  4: { kind: "勤務", startAt: "09:30", endAt: "18:30", breakAt: "01:00", place: "在宅", note: "通常業務" },
  12: { kind: "勤務", startAt: "09:30", endAt: "18:30", breakAt: "01:00", place: "在宅", note: "通常業務" },
};

/** 「4日の終業を21:00に」という、正しい提案のひな形 */
function change(over: Partial<RawChange> = {}): RawChange {
  return {
    day: 4,
    kind: "勤務",
    startAt: "09:30",
    endAt: "21:00",
    breakAt: "01:00",
    place: "在宅",
    note: "通常業務",
    reason: "8月4日は火曜日です",
    ...over,
  };
}

function run(raw: RawChange[]) {
  return validateChanges(2026, 8, CURRENT, raw, BASE);
}

describe("§9.1 提案の検証（10項目）", () => {
  it("正しい提案は通り、変わる項目だけが差分になる", () => {
    const { changes, dropped } = run([change()]);
    expect(dropped).toBe(0);
    expect(changes).toHaveLength(1);
    expect(changes[0].day).toBe(4);
    expect(changes[0].dow).toBe("火"); // 曜日はサーバー側で計算する（§8.2）
    expect(changes[0].blocked).toBe(false);
    expect(changes[0].diffs).toEqual([{ label: "終業", before: "18:30", after: "21:00" }]);
  });

  it("① その月に存在しない日は捨てる", () => {
    // 8月は31日まで。32日と0日は存在しない
    const { changes, dropped } = run([change({ day: 32 }), change({ day: 0 }), change({ day: 4.5 })]);
    expect(changes).toHaveLength(0);
    expect(dropped).toBe(3);
  });

  it("① 2月31日のような、月によって変わる日も捨てる", () => {
    const { changes } = validateChanges(2026, 2, {}, [change({ day: 31 })], BASE);
    expect(changes).toHaveLength(0);
  });

  it("② 同じ日が2件あったら、後の1件を捨てる", () => {
    const { changes, dropped } = run([
      change({ endAt: "21:00" }),
      change({ endAt: "22:00" }), // 同じ4日。こちらを捨てる
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0].next.endAt).toBe("21:00");
    expect(dropped).toBe(1);
  });

  it("③ 区分が4つ以外なら捨てる", () => {
    const { changes, dropped } = run([change({ kind: "有給" }), change({ day: 5, kind: "" })]);
    expect(changes).toHaveLength(0);
    expect(dropped).toBe(2);
  });

  it("④ 始業・休憩が 00:00〜24:59 から外れたら捨てる", () => {
    const { changes, dropped } = run([
      change({ startAt: "99:99" }),
      change({ day: 5, startAt: "25:00" }), // 始業は24:59まで
      change({ day: 6, breakAt: "26:00" }),
    ]);
    expect(changes).toHaveLength(0);
    expect(dropped).toBe(3);
  });

  it("⑤ 終業は 29:59 まで通す（夜勤）。30:00 は捨てる", () => {
    const ok = run([change({ startAt: "17:00", endAt: "26:00", breakAt: "01:00" })]);
    expect(ok.changes).toHaveLength(1);
    expect(ok.changes[0].next.endAt).toBe("26:00");
    expect(ok.changes[0].blocked).toBe(false);

    const ng = run([change({ endAt: "30:00" })]);
    expect(ng.changes).toHaveLength(0);
  });

  it("⑥ 区分が「勤務」なのに始業か終業が空なら捨てる", () => {
    const { changes, dropped } = run([
      change({ startAt: null }),
      change({ day: 5, endAt: null }),
      change({ day: 6, startAt: "", endAt: "" }),
    ]);
    expect(changes).toHaveLength(0);
    expect(dropped).toBe(3);
  });

  it("⑦ 区分が「勤務」以外なら、時刻と場所を null に落として通す", () => {
    // AIが「休暇なのに時刻つき」を返しても、捨てずに直して通す
    const { changes } = run([
      change({ day: 12, kind: "休暇", startAt: "09:30", endAt: "99:99", place: "在宅", note: "夏季休暇" }),
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0].next).toEqual({
      kind: "休暇",
      startAt: null,
      endAt: null,
      breakAt: null,
      place: null,
      note: "夏季休暇",
    });
  });

  it("⑧ 場所が 在宅／客先／その他 以外なら null にして通す", () => {
    const { changes } = run([change({ place: "リモート" })]);
    expect(changes).toHaveLength(1);
    expect(changes[0].next.place).toBeNull();
    expect(changes[0].diffs).toContainEqual({ label: "場所", before: "在宅", after: "―" });
  });

  it("⑨ C-2（終了≦開始）に当たる提案は、捨てずに『反映できない』印で見せる", () => {
    // 🔴 ここだけは捨てない。捨てると「何も起きない」になり、原因が見えなくなる
    const { changes } = run([change({ startAt: "17:00", endAt: "02:00" })]);
    expect(changes).toHaveLength(1);
    expect(changes[0].blocked).toBe(true);
    expect(changes[0].blockReason).toBe("終了が開始より前になっています");
  });

  it("⑨ C-2（休憩が勤務を超える）も『反映できない』印になる", () => {
    const { changes } = run([change({ startAt: "09:00", endAt: "10:00", breakAt: "02:00" })]);
    expect(changes).toHaveLength(1);
    expect(changes[0].blocked).toBe(true);
    expect(changes[0].blockReason).toBe("休憩が勤務の時間を超えています");
  });

  it("⑩ 元の値と何も変わらない提案は捨てる", () => {
    // 4日は元から 09:30-18:30。同じ値を返されても保存しない
    const { changes, dropped } = run([change({ endAt: "18:30" })]);
    expect(changes).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it("まだ行が無い日への提案は「変更あり」として通る", () => {
    const { changes } = run([change({ day: 20 })]);
    expect(changes).toHaveLength(1);
    expect(changes[0].diffs.map((d) => d.label)).toEqual([
      "区分",
      "始業",
      "終業",
      "休憩",
      "場所",
      "備考",
    ]);
  });
});

describe("§7.2 返し方は3つだけ", () => {
  it("ask は changes を持たず、選択肢だけを返す（保存しない）", () => {
    const r = validateReply(
      2026,
      8,
      CURRENT,
      {
        kind: "ask",
        message: "8月の火曜は 4・11・18・25 の4日です。どれを直しますか？",
        options: ["4日すべて", "今週の火曜だけ", "日を選んで指定する"],
        changes: [change()], // ask なのに提案が入っていても、通さない
      },
      BASE,
    );
    expect(r.kind).toBe("ask");
    expect(r.changes).toHaveLength(0);
    expect(r.options).toHaveLength(3);
  });

  it("選択肢は4つまでに切りそろえる", () => {
    const r = validateReply(
      2026,
      8,
      CURRENT,
      { kind: "ask", message: "?", options: ["1", "2", "3", "4", "5", "6"], changes: [] },
      BASE,
    );
    expect(r.options).toEqual(["1", "2", "3", "4"]);
  });

  it("propose は options を持たない", () => {
    const r = validateReply(
      2026,
      8,
      CURRENT,
      { kind: "propose", message: "終業を21:00にします", options: ["はい"], changes: [change()] },
      BASE,
    );
    expect(r.kind).toBe("propose");
    expect(r.options).toHaveLength(0);
    expect(r.changes).toHaveLength(1);
  });

  it("提案が全部ふるい落とされたら、propose ではなく reject にする", () => {
    // 黙って「0件の提案」を見せない（§10）
    const r = validateReply(
      2026,
      8,
      CURRENT,
      { kind: "propose", message: "直します", options: [], changes: [change({ day: 99 })] },
      BASE,
    );
    expect(r.kind).toBe("reject");
    expect(r.dropped).toBe(1);
    expect(r.message).toContain("見つかりませんでした");
  });

  it("reject は message だけを返す", () => {
    const r = validateReply(
      2026,
      8,
      CURRENT,
      { kind: "reject", message: "単価は変えられません", options: ["a"], changes: [change()] },
      BASE,
    );
    expect(r.kind).toBe("reject");
    expect(r.options).toHaveLength(0);
    expect(r.changes).toHaveLength(0);
  });
});

describe("§8.2 AIに渡すデータ", () => {
  const text = buildAssistInput({
    year: 2026,
    month: 8,
    days: CURRENT,
    baseWorkMinutes: BASE,
    today: "2026-08-06",
  });

  it("対象の年月・日数・今日・基準労働時間を先頭に書く", () => {
    expect(text).toContain("対象：2026年8月（31日）／今日：2026-08-06");
    expect(text).toContain("基準労働時間：8:00"); // 表示用の H:MM（設計書 §8.2 と同じ形）
  });

  it("曜日をサーバー側で計算して書く（AIに数えさせない）", () => {
    expect(text).toContain("4(火) 勤務 09:30-18:30");
    expect(text).toContain("1(土) 休日");
  });

  it("祝日名を書く", () => {
    // 2026-08-11 は山の日。まだ行が無いので「未設定」＋祝日名
    expect(text).toContain("11(火) 未設定 ※山の日");
  });

  it("31日ぶんの行がある", () => {
    const lines = text.split("\n").filter((l) => /^\d+\(/.test(l));
    expect(lines).toHaveLength(31);
  });

  it("🔴 単価・見込み金額・契約時間を含めない", () => {
    // 引数に Contract 型を取らないので、そもそも渡せない（§5.2）
    for (const word of ["単価", "円", "契約", "下限", "上限", "見込み"]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("§11 会話の切りそろえ", () => {
  it("直近5往復（10件）だけ残す", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: "user" as const, text: `${i}` }));
    const out = trimHistory(many);
    expect(out).toHaveLength(HISTORY_LIMIT);
    expect(out[out.length - 1].text).toBe("29");
  });

  it("形が違うものは落とす", () => {
    expect(trimHistory([{ role: "system", text: "x" }, { role: "user", text: "" }, null, "x"])).toEqual([]);
    expect(trimHistory("not an array")).toEqual([]);
  });

  it("300文字を超える発言は切る", () => {
    const out = trimHistory([{ role: "user", text: "あ".repeat(500) }]);
    expect(out[0].text).toHaveLength(300);
  });
});
