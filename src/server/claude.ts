// ===================================================================
// F-10 Claude API を呼ぶ（02_基本設計/06_AIアシスタント設計.md §7・§8）
//
// 🔴 APIキーを触るのはこのファイルだけ。
//    `ANTHROPIC_API_KEY` は【サーバー側だけ】。`NEXT_PUBLIC_` を付けない。
//
// 🔴 単価・見込み金額・契約時間は、ここに渡ってこない。
//    渡すデータを組み立てるのは `src/lib/assist.ts` の `buildAssistInput()` で、
//    あの関数は `Contract` 型を引数に取れない形にしてある（§5.2）。
// ===================================================================

import Anthropic from "@anthropic-ai/sdk";
import { HISTORY_LIMIT } from "@/lib/assist";
import type { ChatTurn, RawReply } from "@/lib/assist";
import { KINDS, PLACES } from "@/lib/constants";
import type { ErrorCode } from "@/lib/errors";

/** モデル（§7.3）。Claude Opus 5 */
const MODEL = "claude-opus-5";

/**
 * 考える分も `max_tokens` に含まれる（Opus 5 は既定で考える）。
 * 提案5件でも出力は500トークン程度なので、余裕を持たせてこの値にしてある。
 */
const MAX_TOKENS = 8000;

/** 60秒（§6.1）。SDK はミリ秒で受け取る */
const TIMEOUT_MS = 60_000;

// -------------------------------------------------------------------
// §7.2 構造化出力のスキーマ
// -------------------------------------------------------------------

/**
 * 🔴 単価・契約時間の欄が【無い】。返したくても返せない（§4.2）。
 *    注意書きではなく、形で塞ぐ。
 *
 * 📌 構造化出力で使える書き方には制限がある。
 *    `minLength` `maximum` のような数値・文字数の制限は使えないので、
 *    「1〜31の日」といった範囲の検証は受け取ってから `lib/assist.ts` で行う（§9）。
 *
 * 📌 「文字列 または null」は `type: ["string","null"]` ではなく `anyOf` で書く。
 *    公式に対応が明記されているのは `anyOf` のほうで、型の配列は明記が無い。
 *    確実に通る書き方を選ぶ（意味は同じ）。
 */
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

export const ASSIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "message", "options", "changes"],
  properties: {
    kind: { type: "string", enum: ["ask", "propose", "reject"] },
    message: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "kind", "startAt", "endAt", "breakAt", "place", "note", "reason"],
        properties: {
          day: { type: "integer" },
          kind: { type: "string", enum: KINDS },
          startAt: nullableString,
          endAt: nullableString,
          breakAt: nullableString,
          place: { anyOf: [{ type: "string", enum: PLACES }, { type: "null" }] },
          note: nullableString,
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

// -------------------------------------------------------------------
// §8.1 システムプロンプト
// -------------------------------------------------------------------

const SYSTEM = `あなたは勤務表の編集を手伝う。
できるのは「その月の各日の内容を書き換える提案」だけ。

# いちばん大事な決めごと：勝手に範囲を決めない

利用者は「勝手に修正されること」をいちばん嫌がっている。
**迷ったら提案せず、必ず kind="ask" で聞き返す。**
聞き返しは失礼ではない。勝手に決めるほうが失礼だと考えること。

次のどれかに当てはまったら、**提案せず必ず kind="ask" にする**（判断で迷う余地はない。機械的に従う）。

## ① 曜日で言われたのに、日付が1つも書かれていないとき
「火曜は21時まで」「水曜だけ休み」「毎週金曜は客先」など。
**「その月の火曜すべて」と解釈できる場合でも、絶対に提案しない。**
どの週を直したいのかは、書いた本人にしか分からない。

例：対象が2026年9月で「火曜は21時まで」と言われたとき
  message: "9月の火曜は 1・8・15・22・29 の5日です。どれを直しますか？"
  options: ["5日すべて", "今週の火曜だけ", "日を選んで指定する"]
  changes: []

## ② 「休み」としか言われず、休暇か休日か決まらないとき
例：「12日は休み」
  message: "12日を「休暇」にしますか、それとも「休日」ですか？"
  options: ["休暇", "休日"]
※ 「夏季休暇で休み」のように**理由が書かれていれば「休暇」と決めてよい**（聞き返さない）。

## ③ 何時までかが書かれていないとき
例：「火曜残業」
  message: "終業を何時にしますか？"
  options: ["20:00", "21:00", "22:00", "自分で入れる"]

## ④ 対象の月に無い日を指されたとき
例：「来月の月曜も」
  message: "この画面は2026年9月です。10月は月を切り替えてから話しかけてください。"
  → これは kind="ask" ではなく kind="reject"。

**逆に、日付が具体的に書かれていて（「12日」「4日と11日」など）、
やることも決まっているときは、聞き返さずに kind="propose" を返す。**
「今週」「来週」も、今日が分かっているので範囲が決まったものとして扱ってよい。

# そのほか守ること
- 決して推測で埋めない。
- 単価・契約時間・基準労働時間・基本パターンは扱えない。頼まれたら kind="reject" にし、
  「単価と契約時間は、この画面からは変えられません。⚙設定から変更してください」と返す。
  ※「管理担当に確認してください」のような案内はしない。使うのは本人ひとり。
- 対象は下に示した年月の日だけ。ほかの月の日は扱えない。
- 変更する日は、その日の完成形を返す（変える項目だけでなく全項目）。
- 区分が「勤務」以外のときは、時刻と作業場所を null にする。
- 終業は 00:00〜29:59。夜勤は 26:00 のように24時以降の数値で書く。
- 始業・休憩は 00:00〜24:59。
- 祝日や休日を勤務に変えるときは、それでよいか kind="ask" で確かめる。

# 返し方は3つだけ
- kind="ask"     … changes は必ず空。options に2〜4件の選択肢を入れる。
- kind="propose" … options は必ず空。changes に1件以上を入れる。
- kind="reject"  … どちらも空。message に理由を書く。

日付と曜日の対応は、下の一覧に書いてある。自分で曜日を数えないこと。
reason には「9月1日は火曜日です」のように、なぜその日を選んだのかを日本語で書く。
「今週」は、今日を含む月曜〜日曜のうち、この月に入っている日だけを指す。`;

// -------------------------------------------------------------------

/**
 * 呼び出しに失敗したときの、画面に出す文言つきエラー（§10）
 *
 * 🆕 D-7（2026-10-02）：画面の文だけでは原因が分からない失敗に、エラー番号（code）を付ける。
 *    元の失敗（Anthropic の応答）は cause に持たせ、ログに種類と状態だけを書く（src/server/failure.ts）。
 *    「この内容には答えられませんでした」のように、文だけで次の手が分かるものには付けない。
 */
export class AssistError extends Error {
  constructor(
    message: string,
    /** HTTPのステータス。画面はこれで再送ボタンの出し分けをする */
    readonly status: number,
    readonly code?: ErrorCode,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AssistError";
  }
}

/** APIキーが入っているか。未設定なら画面に「AIの設定がされていません」と出す */
export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * 利用者の文章をAIに読ませ、§7.2 の形で受け取る。
 *
 * ⚠️ ここでは「形が合っているか」までしか見ない。
 *    中身が正しいか（存在する日か・時刻の範囲は妥当か）は
 *    `lib/assist.ts` の `validateReply()` が見る（§9）。
 */
export async function askAssistant(params: {
  /** 利用者が書いた文章 */
  text: string;
  /** 直近5往復の会話 */
  history: ChatTurn[];
  /** その月の一覧（`buildAssistInput()` が作った1日1行のテキスト） */
  monthText: string;
}): Promise<RawReply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AssistError("AIの設定がされていません", 503, "E-301");
  }

  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  const messages = [
    ...params.history.slice(-HISTORY_LIMIT).map((h) => ({
      role: h.role,
      content: h.text,
    })),
    { role: "user" as const, content: params.text },
  ];

  let res;
  try {
    res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: `${SYSTEM}\n\n---\n${params.monthText}`,
      messages,
      output_config: {
        // 日付と曜日の対応さえ間違えなければよく、深く考えさせる必要がない（§7.3）
        effort: "medium",
        format: { type: "json_schema", schema: ASSIST_SCHEMA as unknown as Record<string, unknown> },
      },
      // 🔴 temperature は渡さない。Opus 5 では 400 エラーになる（§7.3）
      // 🔴 thinking も指定しない。Opus 5 は既定で考える
    });
  } catch (e) {
    // 🔴 ログには理由だけ。プロンプトの中身（勤務データ）を出さない（§10）。
    //    ログは API 側で、番号と一緒に1行だけ書く（D-7・src/server/failure.ts）
    if (e instanceof Anthropic.RateLimitError) {
      throw new AssistError("少し時間をおいてからお試しください", 429, "E-302", e);
    }
    if (e instanceof Anthropic.APIConnectionTimeoutError) {
      throw new AssistError("時間がかかりすぎました。もう一度お試しください", 504, "E-302", e);
    }
    if (e instanceof Anthropic.AuthenticationError) {
      throw new AssistError("AIの設定が正しくありません", 503, "E-302", e);
    }
    throw new AssistError("AIにつながりませんでした。もう一度お試しください", 502, "E-302", e);
  }

  // 安全側の判定で断られたとき。content が空か途中で終わっている
  if (res.stop_reason === "refusal") {
    throw new AssistError("この内容には答えられませんでした", 422);
  }
  if (res.stop_reason === "max_tokens") {
    throw new AssistError("返事が長すぎて途中で切れました。短く区切ってお試しください", 502);
  }

  const text = res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    return JSON.parse(text) as RawReply;
  } catch (e) {
    throw new AssistError("AIの返事を読み取れませんでした", 502, "E-302", e);
  }
}
