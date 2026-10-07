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

// 🆕 I-9（2026-10-07）：E-203・E-204 は待っても直らない。どの番号でも「少し待ってから F5」と出していた
it("E-204 では、手順書の6章を済ませる「やること」を出し、「少し待ってから」は出さない", () => {
  act(() => root.render(<LoadFailed code="E-204" inquiry="7K3Q" />));
  const text = container.textContent ?? "";
  expect(text).toContain("やること");
  expect(text).toContain("手順書の「6. データベースの SQL を流す」を済ませてから、F5 を押してください");
  expect(text).not.toContain("少し待ってから");
});

it("E-203 では、環境変数を入れて公開し直す「やること」を出す", () => {
  act(() => root.render(<LoadFailed code="E-203" inquiry="7K3Q" />));
  const text = container.textContent ?? "";
  expect(text).toContain("Vercel の環境変数を入れて、公開し直してください");
  expect(text).not.toContain("少し待ってから");
});

it("専用の「やること」が無い番号では、少し待ってから F5・直らなければ問い合わせ、と出す", () => {
  act(() => root.render(<LoadFailed code="E-999" inquiry="7K3Q" />));
  const text = container.textContent ?? "";
  expect(text).toContain("やること");
  expect(text).toContain("少し待ってから F5 を押してください（直らなければ問い合わせてください）");
});
