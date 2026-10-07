// @vitest-environment jsdom
// ===================================================================
// 日付の画面（DayModal）：終業を打っている途中の注意（I-10・2026-10-07）
//
// 打っている途中の「2」も「時:分」の形ではないので、黄色の
// 「終業の形が正しくありません」が一瞬出ていた（B-9 の残り）。
// 欄に入っている間は出さず、離れて、まだ形が違えば出す。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import DayModal from "../DayModal";

let container: HTMLDivElement;
let root: Root;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WARNING = "終業の形が正しくありません";

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <DayModal
        year={2026}
        month={10}
        day={20}
        value={{ kind: "勤務", startAt: "09:00", endAt: "18:00", breakAt: "01:00", place: "在宅", note: "通常業務" }}
        pattern={{ start: "09:00", end: "18:00", brk: "01:00", place: "在宅" }}
        baseWorkMinutes={480}
        onClose={() => {}}
        onSave={async () => null}
        onClear={async () => null}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** 終業の欄（placeholder が 18:30 の手入力の欄） */
const endInput = () => container.querySelector<HTMLInputElement>('input[placeholder="18:30"]')!;

/** React が受け取れる形で、欄の文字を書き換える */
function typeInto(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("終業の欄に入ったまま「2」にしても、黄色の注意は出さない", () => {
  act(() => endInput().focus());
  typeInto(endInput(), "2");
  expect(endInput().value).toBe("2");
  expect(container.textContent).not.toContain(WARNING);
});

it("「2」のまま欄を離れると、黄色の注意を出す", () => {
  act(() => endInput().focus());
  typeInto(endInput(), "2");
  act(() => endInput().blur());
  expect(container.textContent).toContain(WARNING);
});

it("打ち終えて「20:00」にすれば、離れても注意は出ない", () => {
  act(() => endInput().focus());
  typeInto(endInput(), "20:00");
  act(() => endInput().blur());
  expect(container.textContent).not.toContain(WARNING);
});
