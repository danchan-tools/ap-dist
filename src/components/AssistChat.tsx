"use client";

// ===================================================================
// W-1 の中身：例文チップ・会話・入力欄（06_AIアシスタント設計.md §2.6・§3）
//
// 🔴 AIの返しは3種類だけ。
//    ask     … 範囲や時刻が決まらない → 質問＋選択肢
//    propose … 決まった → 確認画面（AssistConfirm）
//    reject  … 読み取れない／範囲外 → 理由を出す
//
// 🔴 ask も propose も保存しない。保存は「反映する」を押したときだけ。
// ===================================================================

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AssistConfirm from "@/components/AssistConfirm";
import type { AssistChange, AssistReply, ChatTurn } from "@/lib/assist";
import { TEXT_LIMIT } from "@/lib/assist";
import { send as request } from "@/lib/request";
import type { Contract, DayMap } from "@/lib/types";

/**
 * 例文チップ（§2.6）。「何を書けばいいのか分からない」で止まらないための入口。
 *
 * 🔴 **数は4つ。中身は毎回同じ**（増えたり変わったりしない。§15-6）。
 *    多いと選ぶのに迷うため。
 *
 * 🔴 **押すとそのまま送る**（2026-08-06 段木さんの要望で変更。§2.7）。
 *    それまでは「入力欄に入れるだけ」だった。
 *    押しても何も起きないので、もう一度送信ボタンを押す必要があり、二度手間だった。
 *
 * ⚠️ **そのため、チップに具体的な日付を書かない。**
 *    「12日は夏季休暇で休み」のままだと、押すたびに必ず12日が対象になる。
 *    日付を外しておけば、AIが「どの日ですか？」と聞き返す。
 *
 * 🔴 **勝手に保存されることはない。**
 *    送ってもAIが返すのは「聞き返し」か「変更一覧」までで、
 *    保存されるのは確認画面で「この内容で反映する」を押したときだけ（§3.1）。
 */
const CHIPS = ["火曜は21時まで", "夏季休暇で休み", "来週は全部 客先", "今週の水曜だけ休み"];

/**
 * 聞き返しは【1回の依頼につき】2回まで。3回目は、AIの聞き返しに手で直す方法を添える（§3.3）。
 *
 * 🔴 「1回の依頼につき」を守るのは `send()` の `fromOption`。
 *    手で書き直したら数え直す。ここを外すと、別々の依頼を3つ続けただけで打ち切られる。
 */
const ASK_LIMIT = 2;

type Bubble = {
  role: "user" | "assistant";
  text: string;
  /** ask のときの選択肢。最新の1件だけ押せる */
  options?: string[];
};

export default function AssistChat({
  projectId,
  ym,
  days,
  contract,
  baseWorkMinutes,
  year,
  month,
  onApplied,
}: {
  /** どの案件か。APIのURLに使う（拡張1） */
  projectId: number;
  /** 'YYYY-MM'。APIのURLに使う */
  ym: string;
  days: DayMap;
  /** 🔴 画面側の計算にだけ使う。AIには送らない（§5.2） */
  contract: Contract;
  baseWorkMinutes: number;
  year: number;
  month: number;
  /** 反映が終わったとき。表を読み直してもらう */
  onApplied: (count: number) => void;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<AssistChange[] | null>(null);
  const askStreak = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  // 新しい発言が増えたら、いちばん下まで送る
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [bubbles, busy]);

  /**
   * 入力欄の高さを、中身に合わせて伸ばす（I-1・2026-08-29）。
   *
   * 🔴 いったん `auto` に戻してから測る。
   *    前の高さのままだと `scrollHeight` がそれ以上に縮まず、
   *    文を消しても高いまま残る。
   *
   * 📌 上限は CSS（`max-h-36` ＝ 約8行）に任せている。
   *    ここで入れた高さが上限を超えると、CSS 側が抑えて中がスクロールする。
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  /**
   * @param fromOption AIが出した選択肢のボタンから送ったか。
   *   🔴 手で書いた文章・例文チップは【新しい依頼】とみなし、聞き返しの回数を数え直す。
   *      ASK_LIMIT は「1回の依頼につき2回まで」であって、会話全体の上限ではない（§3.3）。
   *      数え直さないと、別々の依頼を3つ続けただけで打ち切られる（2026-08-07 に実際に起きた）。
   */
  async function send(text: string, fromOption = false) {
    const body = text.trim();
    if (!body || busy) return;

    if (!fromOption) askStreak.current = 0;

    // 直近5往復ぶんは API 側で切りそろえる（§11）。ここでは全部渡す
    const history: ChatTurn[] = bubbles.map((b) => ({ role: b.role, text: b.text }));

    setBubbles((prev) => [
      // 選択肢は「押せるのは最新の1件だけ」。過去の分は消す
      ...prev.map((b) => ({ ...b, options: undefined })),
      { role: "user", text: body },
    ]);
    setInput("");
    setError("");
    setBusy(true);

    let reply: AssistReply | null = null;
    const sent = await request(
      `/api/projects/${projectId}/months/${ym}/assist`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body, history }) },
      "AIにつながりませんでした",
    );
    // 🔴 黙って失敗しない。何も起きないのがいちばん困る（§10）。番号つき（D-7）
    if (sent.ok) reply = (await sent.res.json().catch(() => null)) as AssistReply | null;
    if (!reply) {
      setError(sent.ok ? "AIの返事を読み取れませんでした" : sent.message);
      setBusy(false);
      return;
    }
    setBusy(false);

    // ここから下は setBubbles の中（あとから走る処理）で使うので、
    // 中身が変わらない const に受け直しておく
    const r: AssistReply = reply;

    if (r.kind === "ask") {
      askStreak.current += 1;
      if (askStreak.current > ASK_LIMIT) {
        askStreak.current = 0;
        setBubbles((prev) => [
          ...prev,
          // 🔴 AIの聞き返しを捨てない（2026-08-07）。
          //    案内だけ出すと、答えが返ってこなかったように見えて会話が途切れる。
          //    選択肢も残すので、押せばそのまま続けられる。
          { role: "assistant", text: r.message, options: r.options },
          {
            role: "assistant",
            text: "決まらないときは、表の行をクリックすると、その日を手で直せます。",
          },
        ]);
        return;
      }
      setBubbles((prev) => [...prev, { role: "assistant", text: r.message, options: r.options }]);
      return;
    }

    askStreak.current = 0;

    if (r.kind === "reject") {
      setBubbles((prev) => [...prev, { role: "assistant", text: r.message }]);
      return;
    }

    // propose：まだ保存しない。確認画面を出す（§3.1）
    setBubbles((prev) => [...prev, { role: "assistant", text: r.message }]);
    setProposal(r.changes);
  }

  /** 確認画面で「この内容で反映する」を押したとき。ここで初めて保存する */
  async function apply(picked: AssistChange[]) {
    setBusy(true);
    setError("");
    try {
      const sent = await request(`/api/projects/${projectId}/months/${ym}/days`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: picked.map((c) => ({
            day: c.day,
            ...c.next,
            reason: c.reason,
          })),
        }),
      }, "反映できませんでした");
      if (!sent.ok) {
        setError(sent.message); // 番号つき（D-7）
        setBusy(false);
        return;
      }
      const out = (await sent.res.json()) as { saved?: number };
      setProposal(null);
      setBubbles((prev) => [
        ...prev,
        { role: "assistant", text: `${out.saved ?? picked.length}件を反映しました。` },
      ]);
      onApplied(out.saved ?? picked.length);
    } catch {
      setError("反映できませんでした。もう一度お試しください");
    }
    setBusy(false);
  }

  // 確認画面を出しているあいだは、会話の代わりにこちらを見せる
  if (proposal) {
    return (
      <>
        <AssistConfirm
          year={year}
          month={month}
          days={days}
          contract={contract}
          baseWorkMinutes={baseWorkMinutes}
          changes={proposal}
          busy={busy}
          onCancel={() => setProposal(null)}
          onApply={apply}
        />
        {error && <p className="px-4 pb-3 text-[11px] font-bold text-rose-600">{error}</p>}
      </>
    );
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {bubbles.length === 0 && (
          <>
            <p className="text-xs font-bold text-slate-900">やりたいことは？</p>
            <div className="grid grid-cols-2 gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  // 🔴 押すとそのまま送る（§2.7・2026-08-06 変更）
                  onClick={() => void send(c)}
                  disabled={busy}
                  className="border border-ads-border rounded-lg px-2 py-2 text-[11px] font-bold text-ads-muted hover:border-ads-ai hover:text-ads-ai-dark disabled:opacity-50 text-left"
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ads-dim">
              押すとそのまま送ります。日付が決まっていないときは、AIが聞き返します。
            </p>
          </>
        )}

        {bubbles.map((b, i) => (
          <div key={i} className={b.role === "user" ? "self-end max-w-[85%]" : "max-w-[90%]"}>
            <p
              className={`rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                b.role === "user"
                  ? "bg-ads-ai text-white"
                  : "bg-ads-surface border border-ads-border text-slate-900"
              }`}
            >
              {b.text}
            </p>
            {b.options && b.options.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {b.options.map((o) => (
                  <button
                    key={o}
                    // 押すと、その文言がそのまま自分の発言として送られる（§3.3）
                    // 🔴 第2引数は「いまの話題の続き」の印。ここだけ true にする
                    onClick={() => void send(o, true)}
                    disabled={busy}
                    className="border border-ads-ai text-ads-ai-dark rounded-full px-3 py-1 text-[11px] font-bold hover:bg-ads-ai/5 disabled:opacity-50"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {busy && <p className="text-[11px] text-ads-dim">考えています…</p>}
        {error && (
          <p className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
            <br />
            表の行をクリックすれば、手で直せます。
          </p>
        )}
        <div ref={bottom} />
      </div>

      <div className="px-4 py-3 border-t border-ads-border flex flex-col gap-1.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={boxRef}
            rows={1}
            value={input}
            maxLength={TEXT_LIMIT}
            placeholder="例：火曜は21時まで"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // 🔴 変換中の Enter は「変換の確定」。送信にも改行にも使わない（I-1）。
              //    見ていなかったので、「かようびは」を確定した瞬間に送信されていた
              if (e.nativeEvent.isComposing) return;

              // Ctrl+Enter ／ Alt+Enter で送信。Enter だけなら改行（2026-08-29 変更）
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.altKey)) {
                e.preventDefault();
                void send(input);
              }
            }}
            // 高さは中身に合わせて伸ばす。max-h-36 は約8行ぶん（12px × 8行 ＋ 上下の余白）
            className="flex-1 resize-none overflow-y-auto max-h-36 bg-white border border-ads-border rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-ads-ai"
          />
          <button
            onClick={() => void send(input)}
            disabled={busy || input.trim() === ""}
            aria-label="送信"
            className="bg-ads-ai hover:bg-ads-ai-dark disabled:bg-ads-dim text-white rounded-lg p-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-ads-dim">
          Enter で改行 ／ Ctrl+Enter で送信　　⚠ 反映する前に、必ず内容を確認できます
        </p>
      </div>
    </>
  );
}
