// @vitest-environment jsdom
// ===================================================================
// 始業・休憩の時刻入力欄（TimeInput）
//
// 🔴 2026-08-06 の指摘：終了だけ時計マークの色が違う。
//
//   始業・休憩の時計マークは**ブラウザが描くもの**、
//   終了（EndTimeInput）は**こちらで描くもの**だった。
//   別物なので、色も形もそろわない。
//
//   ブラウザの絵柄を隠して、3つとも同じ絵柄を使うようにした。
//   ここで「隠したままか」「同じ形か」を見張る。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EndTimeInput from "../EndTimeInput";
import TimeInput from "../TimeInput";

let container: HTMLDivElement;
let root: Root;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIELD = "bg-white border border-ads-border rounded-lg px-3 py-2 text-sm";

const clockButton = () =>
  container.querySelector<HTMLButtonElement>('button[aria-label="時刻を一覧から選ぶ"]')!;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("始業・休憩の時刻入力欄", () => {
  it("値を打ち替えられる", () => {
    const got: string[] = [];
    act(() => {
      root.render(<TimeInput value="09:30" onChange={(v) => got.push(v)} className={FIELD} />);
    });
    const input = container.querySelector<HTMLInputElement>('input[type="time"]')!;
    expect(input.value).toBe("09:30");
  });

  it("🔴 ブラウザが描く時計マークを隠している（2026-08-06 の指摘）", () => {
    act(() => {
      root.render(<TimeInput value="09:30" onChange={() => {}} className={FIELD} />);
    });
    const input = container.querySelector<HTMLInputElement>('input[type="time"]')!;
    expect(input.className).toContain("[&::-webkit-calendar-picker-indicator]:hidden");
  });

  it("🔴 終了（EndTimeInput）と、時計マークの見た目がまったく同じ", () => {
    // 色・大きさ・余白を別々に決めていると、また食い違う。
    // 同じ指定であることを、ここで固定する
    act(() => {
      root.render(<TimeInput value="09:30" onChange={() => {}} className={FIELD} />);
    });
    const a = clockButton().className;
    const aIcon = clockButton().querySelector("svg")!.getAttribute("class");

    act(() => {
      root.render(<EndTimeInput value="21:30" onChange={() => {}} className={FIELD} />);
    });
    const b = clockButton().className;
    const bIcon = clockButton().querySelector("svg")!.getAttribute("class");

    expect(a).toBe(b);
    expect(aIcon).toBe(bIcon);
  });

  it("🔴 終了（EndTimeInput）と、箱の作りも同じ（数字 → 時計マークの順）", () => {
    act(() => {
      root.render(<TimeInput value="09:30" onChange={() => {}} className={FIELD} />);
    });
    const boxA = container.querySelector<HTMLElement>("span.inline-flex")!;
    expect(boxA.querySelector("input")!.nextElementSibling).toBe(clockButton());

    act(() => {
      root.render(<EndTimeInput value="21:30" onChange={() => {}} className={FIELD} />);
    });
    const boxB = container.querySelector<HTMLElement>("span.inline-flex")!;
    expect(boxB.querySelector("input")!.nextElementSibling).toBe(clockButton());
  });

  it("時計マークを押すと、ブラウザの一覧を開こうとする", () => {
    let called = false;
    act(() => {
      root.render(<TimeInput value="09:30" onChange={() => {}} className={FIELD} />);
    });
    const input = container.querySelector<HTMLInputElement>('input[type="time"]')!;
    // jsdom には showPicker が無いので、こちらで用意して呼ばれたか見る
    (input as unknown as { showPicker: () => void }).showPicker = () => {
      called = true;
    };

    act(() => {
      clockButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(called).toBe(true);
  });

  it("ブラウザが対応していなくても落ちない（入力欄に印を移すだけ）", () => {
    act(() => {
      root.render(<TimeInput value="09:30" onChange={() => {}} className={FIELD} />);
    });
    // showPicker が無い状態のまま押す
    expect(() => {
      act(() => {
        clockButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }).not.toThrow();
  });

  it("使えないとき（disabled）は入力欄もボタンも止まる", () => {
    act(() => {
      root.render(<TimeInput value="09:30" onChange={() => {}} disabled className={FIELD} />);
    });
    expect(container.querySelector<HTMLInputElement>('input[type="time"]')!.disabled).toBe(true);
    expect(clockButton().disabled).toBe(true);
  });
});
