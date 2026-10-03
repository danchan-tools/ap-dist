// ===================================================================
// 失敗を番号に分けて、ログに1行書く（D-7・2026-10-02）
//
// ここで見張るのは3つ。
//   ① 原因ごとに正しい番号に分ける（データベースが止まっているのに E-999 にしない）
//   ② 🔴 ログに値を書かない（単価・案件名・接続先・SQL の値）
//   ③ 画面に返す番号・問い合わせ番号と、ログの行が同じ
// ===================================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError, SchemaError, classify, failure, logFailure, newRef, redact } from "../failure";

/** Postgres が返す形のエラー（@neondatabase/serverless の Pool も同じ形） */
function pgError(message: string, fields: Record<string, unknown>): Error {
  return Object.assign(new Error(message), fields);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** ログに書かれた1行を受け取る */
function captureLog() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => spy.mock.calls.map((c) => c.join(" ")).join("\n");
}

describe("classify", () => {
  it("環境変数が無い → E-203", () => {
    expect(classify(new ConfigError("DATABASE_URL"))).toBe("E-203");
  });

  it("表や最初のデータが足りない → E-204", () => {
    expect(classify(new SchemaError("案件が1件も登録されていません"))).toBe("E-204");
    expect(classify(pgError('relation "months" does not exist', { code: "42P01" }))).toBe("E-204");
    expect(classify(pgError('column "contract_kind" does not exist', { code: "42703" }))).toBe("E-204");
  });

  it("制約に弾かれた → E-202", () => {
    expect(classify(pgError("violates check constraint", { code: "23514" }))).toBe("E-202");
    expect(classify(pgError("duplicate key value", { code: "23505" }))).toBe("E-202");
  });

  it("🔴 つながらない → E-201（番号・Node の番号・メッセージのどれでも）", () => {
    expect(classify(pgError("password authentication failed", { code: "28P01" }))).toBe("E-201");
    expect(classify(pgError('database "x" does not exist', { code: "3D000" }))).toBe("E-201");
    expect(classify(pgError("connection failure", { code: "08006" }))).toBe("E-201");
    expect(classify(pgError("connect ECONNREFUSED 127.0.0.1:5432", { code: "ECONNREFUSED" }))).toBe("E-201");
    expect(classify(new Error("Connection terminated unexpectedly"))).toBe("E-201");
    expect(classify(new Error("WebSocket was closed before the connection was established"))).toBe("E-201");
    expect(classify(new TypeError("Invalid URL"))).toBe("E-201"); // DATABASE_URL の値が壊れている
  });

  it("🔴 WebSocket がつながらないときの ErrorEvent（Error ではなく、中身がほぼ空）→ E-201", () => {
    // 2026-10-02 に、手元で @neondatabase/serverless が実際に投げた形（つながる先にサーバーが無いとき）
    class ErrorEvent {
      type = "error";
      message = "";
      error = new TypeError("");
    }
    expect(classify(new ErrorEvent())).toBe("E-201");
  });

  it("投げた側が番号を決めていれば、それを使う（AI の失敗など）", () => {
    expect(classify(Object.assign(new Error("AIにつながりませんでした"), { code: "E-302" }))).toBe("E-302");
  });

  it("分からなければ E-999", () => {
    expect(classify(new Error("something else"))).toBe("E-999");
    expect(classify(pgError('value "600000" is out of range for type integer', { code: "22003" }))).toBe("E-999");
    expect(classify("文字だけ")).toBe("E-999");
  });
});

describe("newRef", () => {
  it("4文字で、読み違えやすい 0・O・1・I を使わない", () => {
    for (let i = 0; i < 200; i++) expect(newRef()).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
  });

  it("毎回ちがう（200回で重複がほぼ無い）", () => {
    const refs = new Set(Array.from({ length: 200 }, newRef));
    expect(refs.size).toBeGreaterThan(190);
  });
});

describe("redact", () => {
  it("🔴 接続先・引用符の中の値・数字を伏せる", () => {
    const out = redact('connect to postgresql://owner:secret@ep-x.neon.tech/neondb failed: value "600000" for 案件 「トラント」 in 2026');
    expect(out).not.toContain("secret");
    expect(out).not.toContain("neon.tech");
    expect(out).not.toContain("600000");
    expect(out).not.toContain("トラント");
    expect(out).not.toContain("2026");
    expect(out).toContain("<url>");
  });

  it("🔴 つながらないときのホスト名・IP も伏せる", () => {
    const out = redact("getaddrinfo ENOTFOUND ep-cool-123456.us-east-2.aws.neon.tech / connect ECONNREFUSED 127.0.0.1:5432");
    expect(out).not.toContain("neon.tech");
    expect(out).not.toContain("ep-cool");
    expect(out).not.toContain("127.0.0.1");
    expect(out).toContain("ENOTFOUND"); // 原因の種類は残す
    expect(out).toContain("ECONNREFUSED");
  });
});

describe("logFailure", () => {
  it("番号・問い合わせ番号・何をしていたか・原因の種類を1行に書く", () => {
    const read = captureLog();
    const { code, ref } = logFailure(
      "契約条件の保存",
      pgError('new row for relation "months" violates check constraint "months_contract_range"', {
        code: "23514",
        constraint: "months_contract_range",
        table: "months",
      }),
    );
    expect(code).toBe("E-202");
    expect(read()).toMatch(new RegExp(`^\\[E-202\\] ${ref} 契約条件の保存: データベースの決まりに弾かれた \\(`));
    expect(read()).toContain("constraint=months_contract_range");
    expect(read()).toContain("table=months");
  });

  it("🔴 ログに値を書かない（単価・案件名・接続先・SQL の値）", () => {
    const read = captureLog();
    logFailure(
      "1日分の保存",
      pgError('duplicate key value violates unique constraint "projects_name_key"', {
        code: "23505",
        constraint: "projects_name_key",
        detail: "Key (name)=(トラント) already exists.",
        where: "SQL statement",
        query: "INSERT INTO projects (name) VALUES ('トラント')",
      }),
    );
    logFailure("Excelの出力", pgError('value "600000" is out of range for type integer', { code: "22003" }));
    logFailure("案件の読み込み", new Error("connect to postgresql://owner:secret@ep-x.neon.tech/neondb failed"));
    const log = read();
    for (const leak of ["トラント", "600000", "secret", "neon.tech", "INSERT", "Key (name)"]) {
      expect(log, leak).not.toContain(leak);
    }
  });

  it("Error でないもの（ErrorEvent）も、何が投げられたかを書く（空の括弧にしない）", () => {
    const read = captureLog();
    class ErrorEvent {
      type = "error";
      error = new TypeError("");
    }
    expect(logFailure("案件の読み込み", new ErrorEvent()).code).toBe("E-201");
    expect(read()).toContain("kind=ErrorEvent type=error");
    expect(read()).toContain("error(name=TypeError");
  });

  it("どの環境変数が無いかは書く（値ではない）", () => {
    const read = captureLog();
    logFailure("ログイン", new ConfigError("APP_PASSWORD / SESSION_SECRET"));
    expect(read()).toContain("variable=APP_PASSWORD / SESSION_SECRET");
  });

  it("AI の失敗は、元の失敗の種類と状態も書く", () => {
    const read = captureLog();
    const cause = Object.assign(new Error("429 rate_limit_error"), { name: "RateLimitError", status: 429 });
    const e = Object.assign(new Error("少し時間をおいてからお試しください", { cause }), { code: "E-302", status: 429 });
    expect(logFailure("AIへの問い合わせ", e).code).toBe("E-302");
    expect(read()).toContain("cause(name=RateLimitError status=429");
  });

  it("分からないときは、渡した番号にする（Excel なら E-303）", () => {
    captureLog();
    expect(logFailure("Excelの出力", new Error("exceljs failed"), "E-303").code).toBe("E-303");
  });

  it("🔴 データベースの失敗なら、渡した番号より分類を優先する", () => {
    captureLog();
    expect(logFailure("Excelの出力", new Error("Connection terminated unexpectedly"), "E-303").code).toBe("E-201");
  });
});

describe("failure", () => {
  it("🔴 画面に返す番号・問い合わせ番号が、ログの行と同じ", async () => {
    const read = captureLog();
    const res = failure("1日分の保存", new ConfigError("DATABASE_URL"), "保存できませんでした");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; code: string; ref: string };
    expect(body.error).toBe("保存できませんでした");
    expect(body.code).toBe("E-203");
    expect(read()).toContain(`[E-203] ${body.ref} 1日分の保存`);
  });

  it("状態は変えられる（AI なら 502）", () => {
    captureLog();
    expect(failure("AIへの問い合わせ", new Error("x"), "AIにつながりませんでした", { status: 502 }).status).toBe(502);
  });
});
