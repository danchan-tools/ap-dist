// @vitest-environment jsdom
// ===================================================================
// B-4 月間一覧の <colgroup> に文字を入れない（2026-09-15 追加）
//
// 🔴 ここが守るもの：**<colgroup> の中身が <col> だけであること。**
//
//    `<col className="…" /> {/* 日付 */}` のように、<col /> とコメントのあいだに
//    空白を入れると、その空白が <colgroup> の中に文字として残る。
//    <colgroup> の中には文字を置けないので、React が警告を出し、
//    手元の画面の左下に「1 Issue」が出たままになっていた。
//
//    見た目では気づけない（空白は表示されない）ので、テストで見張る。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MonthTable from "../MonthTable";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function render() {
  act(() => {
    root.render(
      <MonthTable
        year={2026}
        month={9}
        days={{}}
        baseWorkMinutes={480}
        errorDays={new Set()}
        warnDays={new Set()}
        onPickDay={() => {}}
      />,
    );
  });
}

describe("月間一覧の列の幅（B-4）", () => {
  it("🔴 <colgroup> の中は <col> だけ。空白の文字を含まない", () => {
    render();
    const colgroup = container.querySelector("colgroup");
    expect(colgroup).not.toBeNull();

    const nodes = Array.from(colgroup!.childNodes);
    const texts = nodes.filter((n) => n.nodeType === Node.TEXT_NODE);
    expect(texts).toHaveLength(0);
    expect(nodes.every((n) => n.nodeName === "COL")).toBe(true);
  });

  it("列は見出しと同じ10本", () => {
    render();
    expect(container.querySelectorAll("colgroup > col")).toHaveLength(10);
    expect(container.querySelectorAll("thead th")).toHaveLength(10);
  });
});
