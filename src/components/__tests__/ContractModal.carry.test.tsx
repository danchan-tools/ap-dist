// @vitest-environment jsdom
// ===================================================================
// B-3 ⚙契約条件の「勤務や設定を入れたことがある先の月にも反映する」（2026-09-15 追加）
//
// 🔴 ここが守るもの：
//    ① 勤務や設定を入れたことがある先の月が無いときは、欄を出さない
//    ② チェックは最初からすべて付いている（段木さんの判断）
//    ③ 外した月は、保存するときに送らない
//
// ⚠️ 前の月を弾くのは API 側（src/lib/carryOver.ts）。ここでは画面の動きだけを見る。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContractModal from "../ContractModal";
import type { YearMonth } from "@/lib/carryOver";
import type { Contract } from "@/lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 🔴 単価は 0。実額をテストにも書かない（01_要件定義/03_制約・非機能要件 §2.1）
const contract: Contract = {
  kind: "月額",
  lo: 8400,
  hi: 10800,
  base: 0,
  underRate: 0,
  overRate: 0,
  hourlyRate: 0,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(laterMonths: YearMonth[]) {
  const onSave = vi.fn<(c: Contract, bw: number, carryTo: YearMonth[]) => Promise<string | null>>(
    async () => null,
  );
  act(() => {
    root.render(
      <ContractModal
        projectName="案件A"
        year={2026}
        month={9}
        contract={contract}
        baseWorkMinutes={480}
        aiEnabled={true}
        laterMonths={laterMonths}
        onClose={() => {}}
        onSave={onSave}
      />,
    );
  });
  return onSave;
}

const section = () => container.querySelector('[data-testid="carry-months"]');
const boxes = () =>
  Array.from(
    container.querySelectorAll<HTMLInputElement>('[data-testid="carry-months"] input[type="checkbox"]'),
  );
const saveButton = () =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "保存")!;

const OCT = { year: 2026, month: 10 };
const NOV = { year: 2026, month: 11 };
const JAN = { year: 2027, month: 1 };

describe("⚙契約条件の「勤務や設定を入れたことがある先の月にも反映する」（B-3）", () => {
  it("勤務や設定を入れたことがある先の月が無ければ、欄を出さない", () => {
    render([]);
    expect(section()).toBeNull();
  });

  it("後ろの保存済みの月を並べる。年が変われば年も書く", () => {
    render([OCT, JAN]);
    expect(section()?.textContent).toContain("10月");
    expect(section()?.textContent).toContain("2027年1月");
  });

  it("🔴 チェックは最初からすべて付いている", () => {
    render([OCT, NOV]);
    expect(boxes()).toHaveLength(2);
    expect(boxes().every((b) => b.checked)).toBe(true);
  });

  it("何も外さなければ、並べた月をすべて送る", async () => {
    const onSave = render([OCT, NOV]);
    await act(async () => saveButton().click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][2]).toEqual([OCT, NOV]);
  });

  it("🔴 外した月は送らない", async () => {
    const onSave = render([OCT, NOV]);
    act(() => boxes()[1].click());
    expect(boxes()[1].checked).toBe(false);

    await act(async () => saveButton().click());
    expect(onSave.mock.calls[0][2]).toEqual([OCT]);
  });

  it("欄が無いときは、この月だけとして送る", async () => {
    const onSave = render([]);
    await act(async () => saveButton().click());
    expect(onSave.mock.calls[0][2]).toEqual([]);
  });

  it("🔴 欄の下に、実際の月名で説明が出る（「ここ」「保存」のような言葉を使わない）", () => {
    render([OCT, NOV]);
    const text = section()?.textContent ?? "";
    expect(text).toContain("勤務や設定を入れたことがある月");
    expect(text).toContain("12月から先は11月と同じ設定、8月から前は変わりません。");
    expect(text).not.toContain("ここ");
    expect(text).not.toContain("保存");
  });
});
