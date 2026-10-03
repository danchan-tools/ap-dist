// @vitest-environment jsdom
// ===================================================================
// 拡張の小窓（popup.js）と、動く場所の宣言（manifest.json）（2026-10-01 追加・B-5）
//
// 🔴 B-5 の症状は「10月分の作業報告書で、小窓が『使えるページを開いてください』のまま押せない」だった。
//    小窓と manifest.json が、9月分までの画面の場所（/p/workreport/input/）を直接書いていたため。
//    ここでは本物の manifest.json を小窓に読ませ、9月分までと10月分からの両方の場所で押せることを見張る。
//
// 🔴 B-6 の症状は「買った人が自分の場所に置いた AutoPunch の出力画面で、［この月を拡張に送る］が押せない」だった（2026-10-02）。
//    manifest.json に段木さんの場所しか書いていなかったため。
//    ここでは、どこに置いた AutoPunch でも押せることと、manifest.json に AutoPunch の場所が無いことを見張る。
// ===================================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { day, readExt, runScript, setChrome, type ApplyResult, type Payload, type PingResult } from "./harness";
// 🔴 出力画面の案内（I-6）に書いたボタン名。小窓の表示と食い違ったら落ちる
import { EXT_APPLY_LABEL, EXT_SEND_LABEL } from "@/components/ExtensionHint";

const manifest = JSON.parse(readExt("manifest.json"));

const URLS = {
  oldReport: "https://platform.levtech.jp/p/workreport/input/123456/",
  newReport: "https://platform.levtech.jp/p/work-report/1234567/",
  otherOnSite: "https://platform.levtech.jp/p/project/search/",
  exportPage: "https://my-autopunch.vercel.app/export?project=1&ym=2026-10",
  buyerExport: "https://tanaka-autopunch.vercel.app/export?project=1&ym=2026-10",
  buyerMonth: "https://tanaka-autopunch.vercel.app/?project=1&ym=2026-10",
  ownDomainExport: "https://kintai.example.jp/export?project=1&ym=2026-10",
  localExport: "http://localhost:3000/export?project=1&ym=2026-10",
  loopbackExport: "http://127.0.0.1:3000/export?project=1&ym=2026-10",
  unrelated: "https://example.com/",
  chromePage: "chrome://extensions/",
};

const PAYLOAD: Payload = { ym: "2026-10", days: [day(1), day(2)] };

/** 開いているタブの中身 */
type Site =
  /** AutoPunch の出力画面（送るデータの置き場所がある）。"壊れた" は中身が読めない */
  | { kind: "export"; transfer: Payload | "壊れた" }
  /** AutoPunch の、出力画面以外のページ（月間一覧など） */
  | { kind: "autopunch" }
  /** 関係ないページ */
  | { kind: "other"; title: string }
  /** Chrome が拡張を入らせないページ（chrome:// など） */
  | { kind: "blocked" };

type Page = {
  url: string;
  site?: Site;
  /** 拡張が覚えている月 */
  payload?: Payload | null;
  /** ページの中の levtech.js の返事。undefined なら「拡張がページに入っていない」 */
  ping?: PingResult;
  apply?: ApplyResult;
};

/** タブの中身を、小窓とは別の文書として組む（AutoPunch の題名は src/app/layout.tsx と同じ） */
function buildSite(site: Site): Document {
  const doc = document.implementation.createHTMLDocument(site.kind === "other" ? site.title : "AutoPunch");
  if (site.kind === "export") {
    // src/components/ExportView.tsx と同じ置き場所
    const el = doc.createElement("div");
    el.id = "autopunch-transfer";
    el.hidden = true;
    el.dataset.payload = site.transfer === "壊れた" ? "{壊れた" : JSON.stringify(site.transfer);
    doc.body.append(el);
  }
  const p = doc.createElement("p");
  p.textContent = "ページの本文";
  doc.body.append(p);
  return doc;
}

/** 小窓を開く。Chrome の代わりに、決めた返事をする */
async function openPopup({ url, site = { kind: "other", title: "" }, payload = PAYLOAD, ping, apply }: Page) {
  const html = readExt("popup.html");
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("<script"));

  const runtime: { lastError?: { message: string }; getManifest: () => unknown } = { getManifest: () => manifest };
  const sent: unknown[] = [];
  const injected: { tabId: number; changed: boolean }[] = [];
  const stored: unknown[] = [];
  const siteDoc = site.kind === "blocked" ? null : buildSite(site);

  setChrome({
    runtime,
    tabs: {
      query: async () => [{ id: 7, url }],
      sendMessage: (_tabId: number, msg: { type: string }, cb: (res: unknown) => void) => {
        sent.push(msg);
        const res = msg.type === "ping" ? ping : msg.type === "apply" ? apply : undefined;
        // ページに拡張が入っていないと、Chrome は lastError を立てて返事なしで呼ぶ
        runtime.lastError = res === undefined ? { message: "Receiving end does not exist." } : undefined;
        setTimeout(() => cb(res), 0);
      },
    },
    scripting: {
      executeScript: async ({ target, func }: { target: { tabId: number }; func: () => unknown }) => {
        if (!siteDoc) throw new Error("Cannot access a chrome:// URL");
        const before = siteDoc.documentElement.outerHTML;
        // 🔴 Chrome は関数を文字に直してページへ送る。関数の外の名前を使っていれば、ここで落ちる
        const result = new Function("document", `return (${func.toString()})();`)(siteDoc);
        injected.push({ tabId: target.tabId, changed: siteDoc.documentElement.outerHTML !== before });
        return [{ frameId: 0, result }];
      },
    },
    storage: {
      local: {
        get: async () => ({ autopunch_transfer: payload }),
        set: async (v: Record<string, unknown>) => {
          stored.push(v.autopunch_transfer);
        },
      },
    },
  });

  // popup.html に書いた順に読み込む（Chrome と同じ）
  for (const [, src] of html.matchAll(/<script src="([^"]+)"><\/script>/g)) runScript(src);
  await vi.waitFor(() => expect(button().textContent).not.toBe("読み込み中…"));
  await new Promise((r) => setTimeout(r, 10));
  return { sent, injected, stored };
}

const button = () => document.getElementById("go") as HTMLButtonElement;
const message = () => document.getElementById("msg")!.textContent;
const pageBox = () => document.getElementById("page")!;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("manifest.json", () => {
  it("🔴 報告サイトでは、画面の定義（levtech-screens.js）を levtech.js より先に読み込む", () => {
    const report = manifest.content_scripts.find((cs: { js: string[] }) => cs.js.includes("levtech.js"));
    expect(report.js).toEqual(["levtech-screens.js", "levtech.js"]);
  });

  it("拡張のファイルが、manifest.json に書いたとおり実在する", () => {
    for (const cs of manifest.content_scripts) for (const f of cs.js) expect(() => readExt(f)).not.toThrow();
  });

  it("🔴 AutoPunch の場所を書かない。入れるのは報告サイトだけ（B-6）", () => {
    const places = [...manifest.host_permissions, ...manifest.content_scripts.flatMap((cs: { matches: string[] }) => cs.matches)];
    expect(places.length).toBeGreaterThan(0);
    for (const p of places) expect(p).toMatch(/^https:\/\/platform\.levtech\.jp\//);
  });

  it("🔴 小窓を開いたときだけページを読むための権限（activeTab・scripting）を持つ（B-6）", () => {
    expect(manifest.permissions).toEqual(expect.arrayContaining(["activeTab", "scripting"]));
  });

  it("小窓は、ページへ送る関数（autopunch.js）を popup.js より先に読み込む", () => {
    const srcs = [...readExt("popup.html").matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
    expect(srcs).toEqual(["autopunch.js", "popup.js"]);
  });
});

describe("報告サイトの作業報告書", () => {
  it("🔴 10月分からの画面で押せる（B-5）", async () => {
    await openPopup({ url: URLS.newReport, ping: { screen: "10月分からの画面", ym: "2026-10", period: "2026/10/01 ～ 2026/10/31" } });
    expect(button().textContent).toBe(EXT_APPLY_LABEL);
    expect(button().disabled).toBe(false);
    expect(pageBox().hidden).toBe(false);
    expect(pageBox().textContent).toContain("2026-10");
    expect(pageBox().textContent).toContain("10月分からの画面");
  });

  it("🔴 9月分までの画面でも、これまでどおり押せる", async () => {
    await openPopup({
      url: URLS.oldReport,
      payload: { ym: "2026-09", days: [day(1)] },
      ping: { screen: "9月分までの画面", ym: "2026-09", period: "2026/09" },
    });
    expect(button().textContent).toBe(EXT_APPLY_LABEL);
    expect(button().disabled).toBe(false);
  });

  it("🔴 報告サイトのページには、AutoPunch 用の関数を送らない（中は levtech.js が受け持つ）", async () => {
    const { injected } = await openPopup({ url: URLS.newReport, ping: { screen: "10月分からの画面", ym: "2026-10", period: "" } });
    expect(injected).toEqual([]);
  });

  it("報告サイトでも、作業報告書でなければ押せない", async () => {
    await openPopup({ url: URLS.otherOnSite, ping: { screen: null } });
    expect(button().textContent).toBe("作業報告書を開いてください");
    expect(button().disabled).toBe(true);
  });

  it("ページに拡張が入っていなければ、再読み込みを頼む", async () => {
    await openPopup({ url: URLS.newReport, ping: undefined });
    expect(button().disabled).toBe(true);
    expect(message()).toBe("ページを再読み込み（F5）してください");
  });

  it("🔴 覚えている月とちがえば、押す前に止める", async () => {
    await openPopup({ url: URLS.newReport, payload: { ym: "2026-09", days: [day(1)] }, ping: { screen: "10月分からの画面", ym: "2026-10", period: "" } });
    expect(button().disabled).toBe(true);
    expect(message()).toBe("この作業報告書は 2026-10 です（覚えているのは 2026-09）");
  });

  it("🔴 年月が読めなければ、押す前に止める", async () => {
    await openPopup({ url: URLS.newReport, ping: { screen: "10月分からの画面", ym: null, period: "2026/09/21 ～ 2026/10/20" } });
    expect(button().disabled).toBe(true);
    expect(message()).toBe("この作業報告書の年月が読めません（対象期間 2026/09/21 ～ 2026/10/20）");
  });

  it("まだ何も覚えていなければ、先に送るよう案内する", async () => {
    await openPopup({ url: URLS.newReport, payload: null, ping: { screen: "10月分からの画面", ym: "2026-10", period: "" } });
    expect(button().disabled).toBe(true);
    expect(message()).toBe("先に AutoPunch の出力画面で「送る」を押してください");
  });

  it("反映がすべて通れば、日数だけを出す", async () => {
    await openPopup({
      url: URLS.newReport,
      ping: { screen: "10月分からの画面", ym: "2026-10", period: "" },
      apply: { ok: true, screen: "10月分からの画面", filled: 21, total: 21, missing: [], notKept: [], notComputed: [], noNote: [] },
    });
    button().click();
    await vi.waitFor(() => expect(message()).toBe("✓ 21日分を反映しました"));
  });

  it("🔴 気になる日は、実際の日付で出す", async () => {
    await openPopup({
      url: URLS.newReport,
      ping: { screen: "10月分からの画面", ym: "2026-10", period: "" },
      apply: {
        ok: true,
        screen: "10月分からの画面",
        filled: 19,
        total: 21,
        missing: [12, 13],
        notKept: [],
        notComputed: [1, 2, 5, 6, 7],
        noNote: [20],
      },
    });
    button().click();
    await vi.waitFor(() => expect(message()).toContain("⚠️ 19日分を反映"));
    expect(message()).toContain("10/12・10/13 は欄が見つかりません");
    expect(message()).toContain("10/1・10/2・10/5 ほか2日 は作業時間が計算されませんでした");
    expect(message()).toContain("10/20 は作業内容が空です（必須）");
    expect(message()).toContain("合計を AutoPunch と見比べてください");
  });

  it("押したあとに止まったら、理由を出す", async () => {
    await openPopup({
      url: URLS.newReport,
      ping: { screen: "10月分からの画面", ym: "2026-10", period: "" },
      apply: { ok: false, reason: "月ちがい", pageYm: "2026-11" },
    });
    button().click();
    await vi.waitFor(() => expect(message()).toBe("この作業報告書は 2026-11 です（覚えているのは 2026-10）"));
  });
});

describe("AutoPunch とそれ以外", () => {
  it("🔴 どこに置いた AutoPunch でも、出力画面で［この月を拡張に送る］が押せる（B-6）", async () => {
    for (const url of [URLS.exportPage, URLS.buyerExport, URLS.ownDomainExport, URLS.localExport, URLS.loopbackExport]) {
      await openPopup({ url, site: { kind: "export", transfer: PAYLOAD } });
      expect(button().textContent, url).toBe(EXT_SEND_LABEL);
      expect(button().disabled, url).toBe(false);
    }
  });

  it("🔴 押すと、押した瞬間の中身を覚える", async () => {
    const { stored } = await openPopup({ url: URLS.buyerExport, site: { kind: "export", transfer: PAYLOAD }, payload: null });
    button().click();
    await vi.waitFor(() => expect(message()).toBe("✓ 2026-10 を 2日分 覚えました"));
    expect(stored).toEqual([PAYLOAD]);
  });

  it("送るデータが読めなければ、覚えずに理由を出す", async () => {
    const { stored } = await openPopup({ url: URLS.buyerExport, site: { kind: "export", transfer: "壊れた" } });
    button().click();
    await vi.waitFor(() => expect(message()).toBe("この画面から値を読めませんでした"));
    expect(stored).toEqual([]);
  });

  it("月間一覧では、出力画面へ案内する（どこに置いた AutoPunch でも）", async () => {
    await openPopup({ url: URLS.buyerMonth, site: { kind: "autopunch" } });
    expect(button().textContent).toBe("出力画面で使えます");
    expect(button().disabled).toBe(true);
  });

  it("関係ないページでは押せない", async () => {
    const { sent } = await openPopup({ url: URLS.unrelated, site: { kind: "other", title: "Example Domain" } });
    expect(button().textContent).toBe("使えるページを開いてください");
    expect(button().disabled).toBe(true);
    expect(sent).toEqual([]); // ページに話しかけない
  });

  it("🔴 ページは読むだけで、何も足さない・変えない", async () => {
    for (const site of [{ kind: "export", transfer: PAYLOAD }, { kind: "autopunch" }, { kind: "other", title: "Example Domain" }] as Site[]) {
      const { injected } = await openPopup({ url: URLS.buyerExport, site });
      expect(injected.length).toBeGreaterThan(0);
      expect(injected.every((i) => !i.changed)).toBe(true);
    }
  });

  it("Chrome が入らせないページでも止まらず、案内を出す", async () => {
    await openPopup({ url: URLS.chromePage, site: { kind: "blocked" } });
    expect(button().textContent).toBe("使えるページを開いてください");
    expect(button().disabled).toBe(true);
  });
});
