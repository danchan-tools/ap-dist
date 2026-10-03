// @vitest-environment jsdom
// ===================================================================
// 報告サイト「9月分までの画面」への流し込み（2026-10-01 追加・B-5）
//
// 9月分までの作業報告書は、9月分までの画面のまま残る。
// 10月分からの画面に合わせて作りを変えたときに、こちらを壊していないかを見張る。
//
// 画面は 2026-08-07 に調べた実物どおりに組む（設計書 07 §4.1・§4.3）。
// サイトの計算は「change を受けて、隠れた欄 work_time を埋める」形でまねる（§4.4・§10.3）。
// ===================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { day, loadReportSide, type ApplyResult, type Payload } from "./harness";

const FIELD = "data[DailyReport]";

const toMin = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** 9月分までの画面を組む。日ごとに、サイトの計算が何回動いたかを数える */
function buildV1(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const calcCount: Record<string, number> = {};
  const form = document.createElement("form");

  for (let d = 1; d <= last; d++) {
    const ymd = `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
    const input = (key: string, type: "text" | "hidden") => {
      const el = document.createElement("input");
      el.type = type;
      el.name = `${FIELD}[${ymd}][${key}]`;
      el.id = `${ymd}${key}`;
      if (type === "text") el.className = "js-placeholder modalTable__detailUpDate__input timeInput keyup";
      form.appendChild(el);
      return el;
    };
    input("id", "hidden");
    input("target_date", "hidden").value = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const start = input("start_time", "text");
    const end = input("end_time", "text");
    const relax = input("relax_time", "text");
    const work = input("work_time", "hidden");
    input("work_content", "text");

    // サイトの計算をまねる（実物は jQuery で change を待っている）
    const calc = () => {
      calcCount[ymd] = (calcCount[ymd] || 0) + 1;
      const s = toMin(start.value);
      const e = toMin(end.value);
      const b = toMin(relax.value) ?? 0;
      work.value = s !== null && e !== null ? hhmm(e - s - b) : "";
    };
    for (const el of [start, end, relax]) el.addEventListener("change", calc);
  }

  document.body.appendChild(form);
  const field = (d: number, key: string) =>
    document.querySelector<HTMLInputElement>(
      `input[name="${FIELD}[${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}][${key}]"]`,
    )!;
  const calls = (d: number) => calcCount[`${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`] || 0;
  return { field, calls };
}

/** 流し込みは1日ごとに間を空けるので、時計を進めて待つ */
async function run<T>(p: Promise<T>) {
  await vi.advanceTimersByTimeAsync(10_000);
  return p;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("9月分までの画面", () => {
  it("画面と年月を見分ける（年月は欄の名前の日付から読む）", async () => {
    buildV1("2026-09");
    const side = loadReportSide();
    expect(await side.ping()).toEqual({ screen: "9月分までの画面", ym: "2026-09", period: "2026/09" });
  });

  it("日付どおりの欄に入り、サイトの計算が動く（夜勤の 26:00 も）", async () => {
    const { field } = buildV1("2026-09");
    const side = loadReportSide();
    const payload: Payload = { ym: "2026-09", days: [day(1), day(2, "17:00", "26:00", "01:00", "夜勤")] };

    const res = await run(side.apply(payload));

    expect(res).toEqual({
      ok: true,
      screen: "9月分までの画面",
      filled: 2,
      total: 2,
      missing: [],
      notKept: [],
      notComputed: [],
      noNote: [],
    } satisfies ApplyResult);
    expect([1, 2].map((d) => ["start_time", "end_time", "relax_time", "work_content"].map((k) => field(d, k).value)))
      .toEqual([
        ["09:00", "18:00", "01:00", "通常業務"],
        ["17:00", "26:00", "01:00", "夜勤"],
      ]);
    expect(field(1, "work_time").value).toBe("08:00");
    expect(field(2, "work_time").value).toBe("08:00");
  });

  it("🔴 サイトの計算は1日に1回だけ起こす（2026-08-07 に確かめた入れ方のまま）", async () => {
    // 4つの欄それぞれで起こすと、同じ行を4回計算させる（設計書 §10.1 の6）
    const { calls } = buildV1("2026-09");
    const side = loadReportSide();
    await run(side.apply({ ym: "2026-09", days: [day(1), day(2)] }));
    expect([calls(1), calls(2), calls(3)]).toEqual([1, 1, 0]);
  });

  it("🔴 月がちがえば、1つも入れずに止める", async () => {
    const { field } = buildV1("2026-09");
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1)] }));
    expect(res).toEqual({ ok: false, reason: "月ちがい", pageYm: "2026-09" });
    expect(field(1, "start_time").value).toBe("");
  });

  it("値が空の欄には触らない（前に入れた値を残す）", async () => {
    const { field } = buildV1("2026-09");
    field(1, "work_content").value = "前に入れた作業内容";
    const side = loadReportSide();
    await run(side.apply({ ym: "2026-09", days: [day(1, "09:00", "18:00", "01:00", "")] }));
    expect(field(1, "work_content").value).toBe("前に入れた作業内容");
    expect(field(1, "start_time").value).toBe("09:00");
  });

  it("作業内容が空の日も知らせない（9月分までは任意だった）", async () => {
    buildV1("2026-09");
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-09", days: [day(1, "09:00", "18:00", "01:00", "")] }));
    expect(res).toMatchObject({ ok: true, noNote: [] });
  });

  it("欄が無い日は、日にちを返す（黙って飛ばさない）", async () => {
    const { field } = buildV1("2026-09");
    field(3, "start_time").remove();
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-09", days: [day(2), day(3)] }));
    expect(res).toMatchObject({ ok: true, missing: [3] });
  });
});
