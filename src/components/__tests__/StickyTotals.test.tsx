// @vitest-environment jsdom
// ===================================================================
// スクロール中に合計を残す1行バー（StickyTotals）
//
// このバーは「サマリーと同じ数字を、別の場所にもう一度出す」部品。
// 同じ数字を2か所に出す作りは、片方だけ直して食い違うことがいちばん怖い。
//
// ここで見張るのは3つ。
//   ① サマリーが見えているあいだは出さない（出しっぱなしにしない）
//   ② 🔴 過不足は【精算時間】で判定する。実勤務時間で判定すると下限割れを見逃す
//   ③ 判定できない月（入力なし・単価なし）に、数字を出してしまわない
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MonthCalc } from "@/lib/calc";
import type { Contract } from "@/lib/types";
import StickyTotals from "../StickyTotals";

let container: HTMLDivElement;
let root: Root;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** 契約：下限140:00〜上限180:00。単価はダミー（実額はコミットしない） */
const CONTRACT: Contract = {
  kind: "月額",
  lo: 140 * 60,
  hi: 180 * 60,
  base: 600000,
  underRate: 4285,
  overRate: 3333,
  hourlyRate: 0,
};

/** サマリーの代わり。bottom を指定して「見えている／上に消えた」を作る */
function anchor(bottom: number) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ bottom }) as DOMRect;
  return { current: el as HTMLElement };
}

function render(total: MonthCalc, opts: { bottom?: number; noData?: boolean; base?: number } = {}) {
  act(() =>
    root.render(
      <StickyTotals
        anchorRef={anchor(opts.bottom ?? 10)}
        total={total}
        contract={{ ...CONTRACT, base: opts.base ?? CONTRACT.base }}
        noData={opts.noData ?? false}
      />,
    ),
  );
  return container.textContent ?? "";
}

/** 実 139:58 ／ 精算 136:00 の月。実時間で判定すると下限割れを見逃す */
const ROUNDED: MonthCalc = {
  work: 139 * 60 + 58,
  bill: 136 * 60,
  ot: 5 * 60,
  days: 20,
  errorDays: [],
  rounded: true,
};

const IN_RANGE: MonthCalc = {
  work: 160 * 60,
  bill: 160 * 60,
  ot: 10 * 60,
  days: 20,
  errorDays: [],
  rounded: false,
};

describe("StickyTotals（スクロール中の合計バー）", () => {
  it("サマリーが見えているあいだは、バーを出さない", () => {
    const text = render(IN_RANGE, { bottom: 300 });
    expect(text).toBe("");
  });

  it("サマリーが画面の上に消えたら、バーを出す", () => {
    const text = render(IN_RANGE, { bottom: 10 });
    expect(text).toContain("勤務");
    expect(text).toContain("160:00");
  });

  it("🔴 過不足は【精算時間】で判定する（実 139:58 ではなく 136:00 で -4:00）", () => {
    const text = render(ROUNDED);
    expect(text).toContain("-4:00");
    // 実時間 139:58 で判定していたら -0:02 になる
    expect(text).not.toContain("-0:02");
  });

  it("丸めで差が出る月は、実勤務時間と精算時間を両方出す", () => {
    expect(render(ROUNDED)).toContain("139:58 → 136:00");
    // 差がない月に矢印を出すと読みにくいので出さない
    expect(render(IN_RANGE)).not.toContain("→");
  });

  it("残業が45:00を超えたら、超えていない月と違う見た目にする", () => {
    const over: MonthCalc = { ...IN_RANGE, ot: 46 * 60 };
    act(() =>
      root.render(
        <StickyTotals anchorRef={anchor(10)} total={over} contract={CONTRACT} noData={false} />,
      ),
    );
    expect(container.innerHTML).toContain("text-rose-500");
  });

  it("まだ1日も入力がない月は、過不足も金額も出さない", () => {
    const empty: MonthCalc = { work: 0, bill: 0, ot: 0, days: 0, errorDays: [], rounded: false };
    const text = render(empty, { noData: true });
    // 「-140:00 不足」「¥0」を出すと、本当にそうだと誤解される
    expect(text).not.toContain("-140:00");
    expect(text).toContain("―");
  });

  it("契約の単価が未入力の月は、金額を出さない", () => {
    const text = render(IN_RANGE, { base: 0 });
    expect(text).toContain("―");
    expect(text).not.toContain("¥0");
  });

  it("範囲内の月は「範囲内」と見込み金額を出す", () => {
    const text = render(IN_RANGE);
    expect(text).toContain("範囲内");
    expect(text).toContain("¥600,000");
  });
});
