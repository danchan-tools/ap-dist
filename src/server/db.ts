// ===================================================================
// Neon への接続（02_基本設計/02_データ設計.md §8）
//
// 🔴 `neon()`（HTTPドライバ）ではなく `Pool`（WebSocket）を使う。
//    §5.2 の一括反映で、BEGIN → 3文 → COMMIT のトランザクションを張るため。
//
// ⚠️ このファイルはサーバー側でしか読み込まないこと。
//    ブラウザに接続文字列が漏れる。
// ===================================================================

import { Pool } from "@neondatabase/serverless";
import { ConfigError, redact } from "./failure";

// 開発中はファイルを保存するたびにコードが読み直される。
// そのたびに新しい Pool を作ると接続が増え続けるので、1つを使い回す。
const globalForDb = globalThis as unknown as { autopunchPool?: Pool };

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    // E-203（D-7）。手元なら .env.local、Vercel なら環境変数の設定を確かめる
    throw new ConfigError("DATABASE_URL");
  }
  if (!globalForDb.autopunchPool) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

    // 🔴 これが無いとサーバーごと落ちる。
    //    Neon の無料プランは数分放置すると接続を切る。
    //    待機中の接続が切られると Pool が error を出すが、
    //    受け取る人がいないと Node は例外として投げてしまう。
    pool.on("error", (e: unknown) => console.error("[pool]", redact(e instanceof Error ? e.message : String(e))));

    globalForDb.autopunchPool = pool;
  }
  return globalForDb.autopunchPool;
}

/** 1文だけ流す */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

/**
 * 複数の文をまとめて、途中で落ちたら全部なかったことにする。
 *
 * 🔴 `BEGIN; … COMMIT;` を1つのクエリとして送ることはできない
 *    （`cannot insert multiple commands into a prepared statement`）。
 *    1文ずつ送って、こちら側でトランザクションを張る（§5.2）。
 */
export async function transaction<T>(
  fn: (run: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  let failed: unknown = null;
  try {
    await client.query("BEGIN");
    const result = await fn(async (text, params = []) => {
      const res = await client.query(text, params);
      return res.rows as Record<string, unknown>[];
    });
    await client.query("COMMIT");
    return result;
  } catch (e) {
    failed = e;
    // ⚠️ ROLLBACK 自体が失敗しても、投げるのは【元の例外】にする。
    //    ここで上書きすると「本当は何がだめだったのか」が消える
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[rollback]", redact(rollbackError instanceof Error ? rollbackError.message : String(rollbackError)));
    }
    throw e;
  } finally {
    // 失敗した接続は捨てる。中途半端な状態のまま使い回すと、
    // 次のリクエストが「トランザクションが中断されています」で落ちる
    client.release(failed ? true : undefined);
  }
}
