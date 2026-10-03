// @vitest-environment jsdom
// ===================================================================
// ⚙設定に出るバージョン番号（2026-08-12 追加）
//
// 🔴 ここが守るもの：**買った人が「私のはどれ？」に答えられること。**
//
//    番号は package.json だけが正で、画面はそれを読むだけ
//    （src/lib/version.ts ／ docs/md/02_基本設計/09_バージョンと改訂履歴.md）。
//    画面側に数字を書き足すと、package.json と別の番号を持つことになる。
//
// ⚠️ このテストは「出ているか」だけを見る。**番号の正しさは version.test.ts。**
//    役割を混ぜると、どちらが落ちたのか分からなくなる。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContractModal from "../ContractModal";
import { UNKNOWN_VERSION } from "@/lib/version";
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
  vi.unstubAllEnvs();
});

function render() {
  act(() => {
    root.render(
      <ContractModal
        projectName="案件A"
        year={2026}
        month={8}
        contract={contract}
        baseWorkMinutes={480}
        aiEnabled={true}
        laterMonths={[]}
        onClose={() => {}}
        onSave={async () => null}
      />,
    );
  });
}

const versionText = () =>
  container.querySelector('[data-testid="app-version"]')?.textContent?.trim() ?? "";

describe("⚙設定のバージョン表示", () => {
  it("焼き込まれた番号が出る", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    render();
    expect(versionText()).toBe("AutoPunch v1.2.3");
  });

  it("番号が上がれば、画面の表示も一緒に動く", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "2.0.0");
    render();
    expect(versionText()).toBe("AutoPunch v2.0.0");
  });

  it("🔴 番号が取れないとき、それらしい番号を出さない", () => {
    // ここで v0.0.0 などと出ると、仕組みが壊れているのに気づけない
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", undefined);
    render();
    expect(versionText()).toBe(`AutoPunch ${UNKNOWN_VERSION}`);
    expect(versionText()).not.toMatch(/v\d/);
  });

  it("🔴 画面に出るバージョンは1か所だけ", () => {
    // 2か所に出すと、片方を直し忘れて別々の番号が並ぶ
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    render();
    expect(container.querySelectorAll('[data-testid="app-version"]')).toHaveLength(1);
    expect(container.textContent?.match(/v1\.2\.3/g) ?? []).toHaveLength(1);
  });
});
