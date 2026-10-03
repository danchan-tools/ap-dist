// @vitest-environment jsdom
// ===================================================================
// 報告サイト「10月分からの画面」への流し込み（2026-10-01 追加・B-5）
//
// 2026-10-01 に実画面で調べた形をまねて組む（設計書 07 §12）。
//   ・React で作られている（欄の値は React が手元に持ち、画面はそこから描く）
//   ・欄の名前は上から数えた行の番号（rows.0.startTime）。日付は入っていない
//   ・行の日付は「10/01（木）」の文字。年月は「対象期間 2026/10/01 ～ 2026/10/31」
//   ・作業時間は、手元の値からサイトが計算して行に出す
//
// 🔴 いちばん大事なのは「値が残らない」「計算が動かない」を拡張が見つけられること。
//    画面の仕組みが変わったとき、欄に値が並んで見えるのに、サイトに届かない形で壊れるため（設計書 §3）。
// ===================================================================

import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { day, loadReportSide, screens, type ApplyResult, type Cell } from "./harness";

// 本物のブラウザと同じく、act で包まずに動かす（拡張は act の外から欄を触る）
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

type Key = "startTime" | "endTime" | "breakTime" | "comment";
type Row = Record<Key, string>;
type Options = {
  /** 対象期間の文字（無ければ出さない） */
  period?: string;
  /** 表の最初の日と最後の日（10月なら 1〜31） */
  month?: number;
  from?: number;
  to?: number;
  /** 作業内容の欄が、打っても手元の値を変えない（＝描き直すと元に戻る）画面 */
  frozenComment?: boolean;
  /** 作業時間を計算しない画面 */
  noCalc?: boolean;
  /** 入力できない画面（報告済みなど） */
  disabled?: boolean;
};

const toMin = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const workOf = (r: Row) => {
  const s = toMin(r.startTime);
  const e = toMin(r.endTime);
  return s !== null && e !== null ? Math.max(0, e - s - (toMin(r.breakTime) ?? 0)) : 0;
};
const WEEK = "日月火水木金土";

function Cell({ name, value, onChange, disabled }: { name: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="text"
      name={name}
      className="volt-TextInputArea"
      data-disabled="false"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** 10月分からの作業報告書をまねた画面 */
function WorkReport({ period, month = 10, from = 1, to = 31, frozenComment, noCalc, disabled }: Options) {
  const days = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const [rows, setRows] = useState<Row[]>(() => days.map(() => ({ startTime: "", endTime: "", breakTime: "", comment: "" })));
  const set = (i: number, key: Key, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const works = rows.map(workOf);

  return (
    <div>
      {/* 🔴 対象期間より先に、別の期間を置く（契約期間を対象期間と取り違えないか） */}
      <dl>
        <dt>契約期間</dt>
        <dd>2026/09/01 〜 2026/11/30</dd>
      </dl>
      {period && (
        <dl>
          <dt>対象期間</dt>
          <dd>{period}</dd>
        </dl>
      )}
      <div>
        作業日数 <span>{works.filter((w) => w > 0).length}日</span>
      </div>
      <div>
        作業時間合計 <span>{works.reduce((a, b) => a + b, 0) / 60}時間</span>
      </div>
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                {month}/{String(days[i]).padStart(2, "0")}（{WEEK[new Date(2026, month - 1, days[i]).getDay()]}）
              </td>
              {(["startTime", "endTime", "breakTime"] as const).map((k) => (
                <td key={k}>
                  <Cell name={`rows.${i}.${k}`} value={r[k]} onChange={(v) => set(i, k, v)} disabled={disabled} />
                </td>
              ))}
              <td>{noCalc ? "00:00" : hhmm(works[i])}</td>
              <td>
                <button type="button">+</button>
              </td>
              <td>
                <Cell
                  name={`rows.${i}.comment`}
                  value={r.comment}
                  onChange={(v) => (frozenComment ? undefined : set(i, "comment", v))}
                  disabled={disabled}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <textarea name="additionalNotes" defaultValue="" />
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

function render(options: Options = {}) {
  flushSync(() => root.render(<WorkReport period="2026/10/01 ～ 2026/10/31" {...options} />));
}

/** 行の番号から欄を引く（テストで答え合わせをするため） */
const field = (row: number, key: Key) => document.querySelector<HTMLInputElement>(`input[name="rows.${row}.${key}"]`)!;
const valuesOf = (row: number) => (["startTime", "endTime", "breakTime", "comment"] as const).map((k) => field(row, k).value);
const workShown = (row: number) => field(row, "startTime").closest("tr")!.children[4].textContent;

/** 流し込みは1日ごとに間を空けるので、時計を進めて待つ */
async function run<T>(p: Promise<T>) {
  await vi.advanceTimersByTimeAsync(10_000);
  return p;
}

beforeEach(() => {
  // 🔴 <script> の中の文字を、対象期間と取り違えないか（画面に出ない文字）
  const decoy = document.createElement("script");
  decoy.type = "application/json";
  decoy.textContent = '{"label":"対象期間 2026/12/01 ～ 2026/12/31"}';
  document.body.appendChild(decoy);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  flushSync(() => root.unmount());
  document.body.innerHTML = "";
});

describe("10月分からの画面", () => {
  it("画面と年月を見分ける（年月は対象期間から読む）", async () => {
    render();
    const side = loadReportSide();
    expect(await side.ping()).toEqual({ screen: "10月分からの画面", ym: "2026-10", period: "2026/10/01 ～ 2026/10/31" });
  });

  it("「対象期間」と日付のあいだに記号が挟まっても、年月を読める（〜 の書き方ちがいも）", async () => {
    render({ period: "ⓘ：2026/10/01 〜 2026/10/31" });
    const side = loadReportSide();
    expect(await side.ping()).toEqual({ screen: "10月分からの画面", ym: "2026-10", period: "2026/10/01 ～ 2026/10/31" });
  });

  it("行の日付どおりに入り、値が残り、サイトの計算が動く（夜勤の 26:00 も）", async () => {
    render();
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1), day(2, "17:00", "26:00", "01:00", "夜勤"), day(5)] }));

    expect(res).toEqual({
      ok: true,
      screen: "10月分からの画面",
      filled: 3,
      total: 3,
      missing: [],
      notKept: [],
      notComputed: [],
      noNote: [],
    } satisfies ApplyResult);
    expect(valuesOf(0)).toEqual(["09:00", "18:00", "01:00", "通常業務"]);
    expect(valuesOf(1)).toEqual(["17:00", "26:00", "01:00", "夜勤"]);
    expect(valuesOf(4)).toEqual(["09:00", "18:00", "01:00", "通常業務"]);
    expect(valuesOf(2)).toEqual(["", "", "", ""]); // 10/03（土）には触らない
    expect([workShown(0), workShown(1), workShown(4)]).toEqual(["08:00", "08:00", "08:00"]);
    expect(document.body.textContent).toContain("作業日数 3日");
    expect(document.body.textContent).toContain("作業時間合計 24時間");
  });

  it("🔴 行の番号ではなく、行に書かれた日付で日にちを引く（対象期間が月の途中から始まる）", async () => {
    // rows.0 が 10/15 になる。行の番号を日にちと決めつけると、10/1 の値が 10/15 に入る
    render({ period: "2026/10/15 ～ 2026/10/31", from: 15 });
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1), day(15, "10:00", "19:00")] }));

    expect(res).toMatchObject({ ok: true, filled: 1, missing: [1] });
    expect(valuesOf(0)).toEqual(["10:00", "19:00", "01:00", "通常業務"]);
  });

  it("行に書かれた日付の月が対象期間とちがえば、その行には入れない", async () => {
    // 対象期間は10月なのに、行が「9/01（火）」… のように並ぶ画面。どちらが正しいか拡張には決められない
    render({ month: 9, to: 30 });
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1), day(2)] }));
    expect(res).toMatchObject({ ok: true, filled: 0, missing: [1, 2] });
    expect(valuesOf(0)).toEqual(["", "", "", ""]);
  });

  it("🔴 月がちがえば、1つも入れずに止める", async () => {
    render({ period: "2026/11/01 ～ 2026/11/30", month: 11, to: 30 });
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1)] }));
    expect(res).toEqual({ ok: false, reason: "月ちがい", pageYm: "2026-11" });
    expect(valuesOf(0)).toEqual(["", "", "", ""]);
  });

  it("🔴 年月が読めなければ止める（9月分までの拡張は、読めないと照合を飛ばして進んでいた）", async () => {
    render({ period: "" });
    const side = loadReportSide();
    expect(await side.ping()).toEqual({ screen: "10月分からの画面", ym: null, period: "" });
    const res = await run(side.apply({ ym: "2026-10", days: [day(1)] }));
    expect(res).toEqual({ ok: false, reason: "年月が読めない", period: "" });
    expect(valuesOf(0)).toEqual(["", "", "", ""]);
  });

  it("🔴 月をまたぐ対象期間は扱わない（AutoPunch は暦の1か月ごと）", async () => {
    render({ period: "2026/09/21 ～ 2026/10/20" });
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1)] }));
    expect(res).toEqual({ ok: false, reason: "年月が読めない", period: "2026/09/21 ～ 2026/10/20" });
  });

  it("🔴 描き直しで値が元に戻る画面では、その日を返す", async () => {
    // 画面の仕組みが変わり、拡張の入れ方がサイトに届かなくなった、を見つけるため
    render({ frozenComment: true });
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1), day(2)] }));
    expect(res).toMatchObject({ ok: true, notKept: [1, 2] });
    expect(field(0, "comment").value).toBe("");
  });

  it("🔴 サイトが作業時間を計算しない画面では、その日を返す", async () => {
    render({ noCalc: true });
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1), day(2)] }));
    expect(res).toMatchObject({ ok: true, notKept: [], notComputed: [1, 2] });
  });

  it("入力できない欄（報告済みなど）には入れず、その日を返す", async () => {
    render({ disabled: true });
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1)] }));
    expect(res).toMatchObject({ ok: true, filled: 0, missing: [1] });
    expect(valuesOf(0)).toEqual(["", "", "", ""]);
  });

  it("値が空の欄には触らない（前に入れた作業内容を残す）", async () => {
    render();
    const side = loadReportSide();
    await run(side.apply({ ym: "2026-10", days: [day(1, "09:00", "18:00", "01:00", "前に入れた作業内容")] }));
    const res = await run(side.apply({ ym: "2026-10", days: [day(1, "10:00", "19:00", "01:00", "")] }));
    expect(res).toMatchObject({ ok: true, notKept: [], notComputed: [], noNote: [] });
    expect(valuesOf(0)).toEqual(["10:00", "19:00", "01:00", "前に入れた作業内容"]);
  });

  it("🔴 作業内容が空のままの日を返す（10月分から必須。2026-09-19 のお知らせ）", async () => {
    // AutoPunch で作業内容を消した日・AIアシスタントの提案で作業内容が付かなかった日（設計書 §11.3）
    render();
    const side = loadReportSide();
    const res = await run(side.apply({ ym: "2026-10", days: [day(1), day(2, "09:00", "18:00", "01:00", ""), day(5, "09:00", "18:00", "01:00", " ")] }));
    expect(res).toMatchObject({ ok: true, filled: 3, notKept: [], notComputed: [], noNote: [2, 5] });
  });

  it("🔴 9月分までの入れ方では、この画面に値が残らない（入れ方を1つにまとめない）", async () => {
    // 9月分までの入れ方：値を全部入れて、最後の時刻の欄だけで合図を起こす。
    // React は合図の無い欄を、描き直すときに手元の値（空）へ戻す。
    render();
    loadReportSide();
    const v1 = screens().find((s) => s.id === "v1")!;
    const cells: Cell[] = [
      { key: "startAt", el: field(0, "startTime"), value: "09:00" },
      { key: "endAt", el: field(0, "endTime"), value: "18:00" },
      { key: "breakAt", el: field(0, "breakTime"), value: "01:00" },
      { key: "note", el: field(0, "comment"), value: "通常業務" },
    ];
    v1.fill(cells);
    await vi.advanceTimersByTimeAsync(100);
    expect(valuesOf(0)).not.toEqual(["09:00", "18:00", "01:00", "通常業務"]);
    expect(workShown(0)).toBe("00:00");
  });
});
