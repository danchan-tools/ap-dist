// @vitest-environment jsdom
// ===================================================================
// 年月の切り替え（MonthPicker）
//
// 🔴 ここが守るもの：**案件を持ったまま飛ぶこと。**
//
//    URL を直に組み立てると、案件を1か所付け忘れただけで
//    **別の案件の勤務表を黙って読み書きする**（CLAUDE.md の決めごと）。
//    月を選んだときに `?project=` が必ず付くことを固定する。
//
// 📌 あわせて「開くたびに、いま見ている月の年へ戻る」ことも見る。
//    前に開いたときの年が残っていると、押した場所と違う年へ飛ぶ。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const { default: MonthPicker } = await import("../MonthPicker");

let container: HTMLDivElement;
let root: Root;

/** React の act() 警告を止める（React 19 のテスト環境フラグ） */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(projectId = 1, year = 2026, month = 8) {
  act(() => {
    root.render(<MonthPicker projectId={projectId} year={year} month={month} />);
  });
}

/** 見出しのボタン（押すと開く） */
const head = () => container.querySelector<HTMLButtonElement>('button[aria-label="年月を選ぶ"]')!;

/** パネルの中の月ボタン。閉じていれば空 */
const monthButtons = () =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].filter((b) =>
    /^\d{4}年\d{1,2}月$/.test(b.getAttribute("aria-label") ?? ""),
  );

const monthButton = (label: string) =>
  monthButtons().find((b) => b.getAttribute("aria-label") === label)!;

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// 🔴 「今月」の印は今日の日付で変わる。
//    固定しないと、月が替わった日にテストが落ちる（何も直していないのに）。
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 8)); // 2026-08-08
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("年月の切り替え", () => {
  it("はじめは閉じている", () => {
    render();
    expect(head().textContent).toContain("2026年 8月");
    expect(monthButtons()).toHaveLength(0);
  });

  it("押すと開き、12か月ぶんのボタンが出る", () => {
    render();
    click(head());
    expect(monthButtons()).toHaveLength(12);
  });

  it("いま見ている月に印が付く", () => {
    render();
    click(head());
    expect(monthButton("2026年8月").getAttribute("aria-current")).toBe("true");
    expect(monthButton("2026年7月").getAttribute("aria-current")).toBeNull();
  });

  it("🔴 月を選ぶと、案件を持ったまま飛ぶ", () => {
    render(3, 2026, 8);
    click(head());
    click(monthButton("2026年2月"));
    expect(push).toHaveBeenCalledWith("/?project=3&ym=2026-02");
  });

  it("選んだら閉じる", () => {
    render();
    click(head());
    click(monthButton("2026年2月"));
    expect(monthButtons()).toHaveLength(0);
  });

  it("🎯 年をまたいで一度に飛べる（2026年8月 → 2028年2月）", () => {
    render(1, 2026, 8);
    click(head());
    const nextYear = container.querySelector<HTMLButtonElement>('button[aria-label="次の年"]')!;
    click(nextYear);
    click(nextYear);
    click(monthButton("2028年2月"));
    expect(push).toHaveBeenCalledWith("/?project=1&ym=2028-02");
  });

  it("🔴 開き直すと、いま見ている月の年に戻る", () => {
    render(1, 2026, 8);
    click(head());
    click(container.querySelector<HTMLButtonElement>('button[aria-label="次の年"]')!);
    expect(monthButton("2027年1月")).toBeTruthy(); // 2027年を見ている

    click(head()); // 閉じる
    click(head()); // 開き直す
    expect(monthButton("2026年1月")).toBeTruthy(); // 2026年に戻っている
  });

  it("Esc で閉じる", () => {
    render();
    click(head());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(monthButtons()).toHaveLength(0);
  });

  it("外を押すと閉じる", () => {
    render();
    click(head());
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(monthButtons()).toHaveLength(0);
  });

  // ===================================================================
  // 「今月」の印（2026-08-08 追加・段木さんの指摘）
  //
  // 🔴 印は2種類あり、意味が違う。混ざると読めなくなる。
  //      いま開いている月 … 青く塗る（aria-current）
  //      今月             … “今月” と書く
  //    テストの「今日」は 2026-08-08 に固定してある。
  // ===================================================================

  it("🎯 今月のボタンに「今月」と出る", () => {
    render(1, 2026, 1); // 1月を開いていても、今月は8月
    click(head());
    expect(monthButton("2026年8月").textContent).toContain("今月");
    expect(monthButton("2026年1月").textContent).not.toContain("今月");
  });

  it("🔴 「いま開いている月」と「今月」は別の印", () => {
    render(1, 2026, 1);
    click(head());
    // 1月＝開いている月（青）だが、今月ではない
    expect(monthButton("2026年1月").getAttribute("aria-current")).toBe("true");
    expect(monthButton("2026年1月").textContent).not.toContain("今月");
    // 8月＝今月だが、開いてはいない
    expect(monthButton("2026年8月").getAttribute("aria-current")).toBeNull();
    expect(monthButton("2026年8月").textContent).toContain("今月");
  });

  it("同じ月なら、両方の印が付く", () => {
    render(1, 2026, 8);
    click(head());
    expect(monthButton("2026年8月").getAttribute("aria-current")).toBe("true");
    expect(monthButton("2026年8月").textContent).toContain("今月");
  });

  it("別の年には「今月」を出さない", () => {
    render(1, 2026, 8);
    click(head());
    click(container.querySelector<HTMLButtonElement>('button[aria-label="次の年"]')!);
    expect(monthButton("2027年8月").textContent).not.toContain("今月");
  });

  it("今月を開いているときは「今月へ戻る」を押せない", () => {
    render(1, 2026, 8);
    click(head());
    const backBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "いま今月を開いています",
    )!;
    expect(backBtn).toBeTruthy();
    expect(backBtn.disabled).toBe(true);
  });

  it("別の月を開いているときは「今月へ戻る」で今月へ飛べる", () => {
    render(1, 2026, 1);
    click(head());
    const backBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "今月へ戻る",
    )!;
    expect(backBtn.disabled).toBe(false);
    click(backBtn);
    expect(push).toHaveBeenCalledWith("/?project=1&ym=2026-08");
  });

  it("📌 中を押しても閉じない（年を動かしている途中で閉じない）", () => {
    render();
    click(head());
    const nextYear = container.querySelector<HTMLButtonElement>('button[aria-label="次の年"]')!;
    act(() => {
      nextYear.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(monthButtons()).toHaveLength(12);
  });
});
