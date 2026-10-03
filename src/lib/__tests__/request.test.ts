// ===================================================================
// 画面から API を呼ぶ共通部品（D-7・2026-10-02）
//
// 失敗したときに画面へ出す1文を見張る。
//   番号つきの失敗 → 「保存できませんでした（E-201・7K3Q）」
//   番号の無い失敗 → API の文そのまま
//   返事が無い     → 「保存できませんでした（E-901）」
// ===================================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { failureText, send } from "../request";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("failureText", () => {
  it("番号と問い合わせ番号を付けて出す", async () => {
    const res = json({ error: "保存できませんでした", code: "E-201", ref: "7K3Q" }, 500);
    expect(await failureText(res, "既定の文")).toBe("保存できませんでした（E-201・7K3Q）");
  });

  it("番号の無い失敗は、API の文をそのまま出す", async () => {
    const res = json({ error: "上限は下限より大きい値にしてください" }, 400);
    expect(await failureText(res, "既定の文")).toBe("上限は下限より大きい値にしてください");
  });

  it("一覧に無い番号は付けない（Postgres の番号などを取り違えない）", async () => {
    const res = json({ error: "保存できませんでした", code: "23505" }, 500);
    expect(await failureText(res, "既定の文")).toBe("保存できませんでした");
  });

  it("🔴 Vercel の時間切れ（JSON でない 504）は E-901", async () => {
    const res = new Response("An error occurred with your deployment", { status: 504 });
    expect(await failureText(res, "保存できませんでした")).toBe("保存できませんでした（E-901）");
  });

  it("JSON でない 404 などは、既定の文だけ", async () => {
    const res = new Response("Not Found", { status: 404 });
    expect(await failureText(res, "保存できませんでした")).toBe("保存できませんでした");
  });
});

describe("send", () => {
  it("うまくいけば、返事をそのまま渡す", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true }, 200)));
    const sent = await send("/api/x", { method: "PUT" }, "保存できませんでした");
    expect(sent.ok).toBe(true);
  });

  it("🔴 通信そのものが失敗しても、黙らずに E-901 を出す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const sent = await send("/api/x", { method: "PUT" }, "保存できませんでした");
    expect(sent).toEqual({ ok: false, message: "保存できませんでした（E-901）" });
  });

  it("失敗の返事は、番号つきの1文にする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "保存できませんでした", code: "E-202", ref: "AB3C" }, 500)));
    const sent = await send("/api/x", { method: "PUT" }, "既定の文");
    expect(sent).toEqual({ ok: false, message: "保存できませんでした（E-202・AB3C）" });
  });
});
