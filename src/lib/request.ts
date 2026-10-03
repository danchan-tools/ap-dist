// ===================================================================
// 画面から API を呼ぶときの共通部品（D-7・2026-10-02）
//
// 失敗したときに画面へ出す1文を、ここで1つに決める。
//   API が番号を返した  → 「保存できませんでした（E-201・7K3Q）」
//   番号の無い失敗      → API の文そのまま（入力の誤りなど。文だけで直し方が分かる）
//   返事が無い          → 「保存できませんでした（E-901）」
//
// 🔴 2026-10-01 まで、通信そのものが失敗したとき（サーバーが止まっている・固まっている）に
//    何も出ない呼び出しがあった（月間一覧の保存など）。fetch が投げた例外を誰も受けていなかった。
// ===================================================================

import { isErrorCode, withCode, type FailureBody } from "./errors";

/** 送った結果。うまくいけば Response、だめなら画面に出す1文 */
export type Sent = { ok: true; res: Response } | { ok: false; message: string };

/**
 * 失敗の返事を、画面に出す1文にする。
 *
 * 📌 Vercel の時間切れ（504）などは、AutoPunch ではなく Vercel が返すので JSON ではない。
 *    そのときは「サーバーから返事が無い」（E-901）として扱う。
 */
export async function failureText(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as Partial<FailureBody> | null;
  if (body && typeof body.error === "string") {
    const code = isErrorCode(body.code) ? body.code : undefined;
    const ref = typeof body.ref === "string" ? body.ref : undefined;
    return withCode(body.error, code, ref);
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) return withCode(fallback, "E-901");
  return fallback;
}

/** fetch して、失敗なら画面に出す1文を返す。通信そのものの失敗も受け止める */
export async function send(url: string, init: RequestInit, fallback: string): Promise<Sent> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, message: withCode(fallback, "E-901") };
  }
  if (res.ok) return { ok: true, res };
  return { ok: false, message: await failureText(res, fallback) };
}
