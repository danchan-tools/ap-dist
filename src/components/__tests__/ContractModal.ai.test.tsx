// @vitest-environment jsdom
// ===================================================================
// D-3 F-10 の任意化（2026-09-05 追加）
//
// 🔴 ここが守るもの：**APIキーを入れていない人が「壊れている」と思わないこと。**
//
//    キーが無い環境では、月間一覧のAIボタンを出さない（MonthView）。
//    ただし何も出さないと「機能が足りない」と誤解されるので、
//    ⚙契約条件のいちばん下に、理由を1行だけ置く。
//
// ⚠️ ボタンを出す・出さないの判定そのものは MonthView 側。
//    ここで見るのは「説明が出るか／消えるか」だけ。
// ===================================================================

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ContractModal from "../ContractModal";
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

function render(aiEnabled: boolean) {
  act(() => {
    root.render(
      <ContractModal
        projectName="案件A"
        year={2026}
        month={8}
        contract={contract}
        baseWorkMinutes={480}
        aiEnabled={aiEnabled}
        laterMonths={[]}
        onClose={() => {}}
        onSave={async () => null}
      />,
    );
  });
}

const notice = () => container.querySelector('[data-testid="ai-disabled"]');

describe("⚙契約条件のAIアシスタント表示（D-3）", () => {
  it("キーが無いときは、理由が1行出る", () => {
    render(false);
    expect(notice()).not.toBeNull();
  });

  it("キーが無いときの文面に、環境変数の名前が入っている", () => {
    render(false);
    expect(notice()?.textContent).toContain("ANTHROPIC_API_KEY");
  });

  it("キーが無くても「ほかの機能は使える」と伝える", () => {
    render(false);
    expect(notice()?.textContent).toContain("ほかの機能はすべて使えます");
  });

  it("キーがあるときは、何も出さない", () => {
    render(true);
    expect(notice()).toBeNull();
  });

  it("🔴 APIキーそのものは画面に渡っていない", () => {
    render(false);
    // 渡しているのは boolean だけ。キーらしき文字列が描画に混ざっていないこと
    expect(container.textContent).not.toMatch(/sk-ant/);
  });
});
