// @vitest-environment jsdom
// ===================================================================
// 終業の時刻一覧（EndTimeInput）
//
// 🔴 2026-08-06 に2回続けて壊したので、テストで固定する。
//
//   1回目：親のパネルの `overflow-hidden` に切り取られて、一覧が見えなかった
//   2回目：「スクロールしたら閉じる」を足したら、**開いた瞬間に閉じる**ようになった
//          （開くと必ず「時・分の列を今の値までずらす」ので、
//            それ自身がスクロールとして拾われていた）
//
//   どちらも「画面を見ないと分からない」種類の不具合。
//   だからこそ、ここで機械に確かめさせる。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EndTimeInput from "../EndTimeInput";

let container: HTMLDivElement;
let root: Root;

/** React の act() 警告を止める（React 19 のテスト環境フラグ） */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(value: string, onChange: (v: string) => void = () => {}) {
  act(() => {
    root.render(<EndTimeInput value={value} onChange={onChange} className="border border-ads-border rounded-lg px-3 py-2" />);
  });
}

/** 時計マーク（一覧を開くボタン） */
const clockButton = () =>
  container.querySelector<HTMLButtonElement>('button[aria-label="時刻を一覧から選ぶ"]')!;

/** 一覧そのもの。閉じていれば null */
const list = () => container.querySelector<HTMLElement>(".fixed.z-\\[61\\]");

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("終業の時刻一覧", () => {
  it("時計マークを押すと開く", () => {
    render("21:30");
    expect(list()).toBeNull();

    click(clockButton());
    expect(list()).not.toBeNull();
  });

  it("🔴 一覧の中をスクロールしても閉じない（2026-08-06 の不具合）", () => {
    render("21:30");
    click(clockButton());
    expect(list()).not.toBeNull();

    // 「時」の列が、開いた直後に自分でスクロールするのと同じことを起こす
    const column = list()!.querySelector<HTMLElement>(".overflow-y-auto")!;
    act(() => {
      column.dispatchEvent(new Event("scroll", { bubbles: false }));
    });

    expect(list()).not.toBeNull(); // ← 開いたままであること
  });

  it("画面（外側）をスクロールすると閉じる", () => {
    render("21:30");
    click(clockButton());
    expect(list()).not.toBeNull();

    act(() => {
      document.dispatchEvent(new Event("scroll", { bubbles: false }));
    });

    expect(list()).toBeNull();
  });

  it("もう一度 時計マークを押すと閉じる", () => {
    render("21:30");
    click(clockButton());
    expect(list()).not.toBeNull();

    click(clockButton());
    expect(list()).toBeNull();
  });

  it("親が overflow-hidden でも切り取られない（画面に直接浮かせている）", () => {
    render("21:30");
    click(clockButton());

    // `position: fixed` なら、親の overflow-hidden の影響を受けない
    expect(list()!.className).toContain("fixed");
    expect(list()!.className).not.toContain("absolute");
  });

  it("日次編集モーダル（z-50）より上に出る", () => {
    render("21:30");
    click(clockButton());
    expect(list()!.className).toContain("z-[61]");
  });

  it("時を選んでも閉じない。分を選ぶと閉じる", () => {
    const picked: string[] = [];
    render("21:30", (v) => picked.push(v));
    click(clockButton());

    const columns = list()!.querySelectorAll<HTMLElement>(".overflow-y-auto");
    const hours = columns[0].querySelectorAll<HTMLButtonElement>("button");
    const minutes = columns[1].querySelectorAll<HTMLButtonElement>("button");

    click(hours[22]); // 22時
    expect(picked.at(-1)).toBe("22:30");
    expect(list()).not.toBeNull(); // 続けて分を選べるよう、開いたまま

    click(minutes[45]); // 45分
    expect(picked.at(-1)).toBe("21:45"); // value は 21:30 のままなので時は 21
    expect(list()).toBeNull();
  });

  it("夜勤の 26:00 を選べる（24時以降）", () => {
    const picked: string[] = [];
    render("17:00", (v) => picked.push(v));
    click(clockButton());

    const hours = list()!.querySelectorAll<HTMLElement>(".overflow-y-auto")[0];
    const buttons = hours.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(30); // 00〜29

    click(buttons[26]);
    expect(picked.at(-1)).toBe("26:00");
  });

  it("🔴 時計マークは、数字のすぐ隣に並ぶ（右端に固定しない）", () => {
    // 2026-08-06 の指摘。始業・休憩（ブラウザが描く時刻欄）は数字のすぐ横に
    // 時計マークが出るのに、終了だけ枠の右端に固定されていて余白が食い違っていた。
    render("21:30");
    const box = container.querySelector<HTMLElement>("span.inline-flex")!;
    const input = box.querySelector("input")!;
    const button = clockButton();

    expect(box.className).toContain("inline-flex"); // 横並び
    expect(input.nextElementSibling).toBe(button); // 数字のすぐ次が時計マーク
    expect(button.className).not.toContain("absolute"); // 右端への固定をやめた
  });

  it("枠線と余白は外側の箱が持つ（入力欄そのものは持たない）", () => {
    render("21:30");
    const box = container.querySelector<HTMLElement>("span.inline-flex")!;
    const input = box.querySelector("input")!;

    expect(box.className).toContain("border-ads-border"); // 枠は外側
    expect(input.className).toContain("border-0"); // 中身に枠を描かない
    expect(input.className).toContain("bg-transparent");
  });

  it("使えないとき（disabled）は開かない", () => {
    act(() => {
      root.render(<EndTimeInput value="21:30" onChange={() => {}} disabled className="border border-ads-border rounded-lg px-3 py-2" />);
    });
    click(clockButton());
    expect(list()).toBeNull();
  });
});
