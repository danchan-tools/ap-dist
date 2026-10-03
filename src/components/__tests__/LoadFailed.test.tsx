// @vitest-environment jsdom
// ===================================================================
// 画面を開けなかったときの表示（LoadFailed・D-7・2026-10-02）
//
// ⚙設定が開けないので、番号・問い合わせ番号・何が起きたか・バージョンを、この画面だけで伝える。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { formatAppVersion } from "@/lib/version";
import LoadFailed from "../LoadFailed";

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

it("番号・問い合わせ番号・何が起きたか・バージョンを出す", () => {
  act(() => root.render(<LoadFailed code="E-201" inquiry="7K3Q" />));
  const text = container.textContent ?? "";
  expect(text).toContain("画面を開けませんでした（E-201・7K3Q）");
  expect(text).toContain("データベースにつながらない");
  expect(text).toContain("ERRORS.md");
  expect(text).toContain(formatAppVersion());
});
