// @vitest-environment jsdom
// ===================================================================
// 出力画面の、ブラウザ拡張の案内（ExtensionHint・2026-10-02・I-6）
//
// ここで見張るのは2つ。
//   ① 🔴 案内に書いたボタン名が、拡張の小窓（extension/popup.js）の表示と同じ
//      違うと、案内どおりに探しても見つからない
//   ② 出力画面の「② 報告サイトに転記する」の中に、案内が出ている
// ===================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MonthData } from "@/lib/types";
import ExportView from "../ExportView";
import ExtensionHint, { EXT_APPLY_LABEL, EXT_SEND_LABEL } from "../ExtensionHint";

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

// ⚠️ jsdom の中では import.meta.url が jsdom のものに差し替わるので、作業フォルダから引く
const POPUP_JS = readFileSync(path.resolve(process.cwd(), "extension/popup.js"), "utf8");

describe("ボタン名", () => {
  it("🔴 ［この月を拡張に送る］が、拡張の小窓の表示と同じ", () => {
    expect(POPUP_JS).toContain(`go.textContent = "${EXT_SEND_LABEL}";`);
  });

  it("🔴 ［AutoPunchから反映］が、拡張の小窓の表示と同じ", () => {
    expect(POPUP_JS).toContain(`go.textContent = "${EXT_APPLY_LABEL}";`);
  });
});

describe("案内", () => {
  it("押す順番どおりに、2つのボタン名と保存の注意を出す", () => {
    act(() => root.render(<ExtensionHint />));
    const text = container.textContent ?? "";
    expect(text).toContain("拡張を入れている場合は");
    expect(text.indexOf(EXT_SEND_LABEL)).toBeGreaterThan(-1);
    expect(text.indexOf(EXT_APPLY_LABEL)).toBeGreaterThan(text.indexOf(EXT_SEND_LABEL));
    expect(text).toContain("拡張は保存を押しません");
  });

  it("出力画面の「② 報告サイトに転記する」の中に出る", () => {
    // 単価はダミー（実額はコミットしない）。勤務の日は無くてよい
    const data = {
      projectId: 3,
      projectName: "サンプル案件",
      year: 2026,
      month: 10,
      pattern: { startAt: "09:00", endAt: "18:00", breakAt: "01:00", note: "通常業務" },
      contract: { kind: "月額", lo: 140 * 60, hi: 180 * 60, base: 500000, underRate: 0, overRate: 0, hourlyRate: 0 },
      baseWorkMinutes: 480,
      days: {},
    } as unknown as MonthData;
    act(() => root.render(<ExportView data={data} />));

    const section = [...container.querySelectorAll("section")].find((s) =>
      s.querySelector("h2")?.textContent?.includes("報告サイトに転記する"),
    );
    expect(section).toBeTruthy();
    expect(section!.textContent).toContain(EXT_SEND_LABEL);
    expect(section!.textContent).toContain(EXT_APPLY_LABEL);
  });
});
