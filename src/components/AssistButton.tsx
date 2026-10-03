"use client";

// ===================================================================
// W-0 AI起動ボタン（06_AIアシスタント設計.md §2.2）
//
//   月間一覧（S-3）の右下に固定。表をスクロールしても動かない。
//   初めて開くまでのあいだだけ、左に「AIに直してもらう」と小さく出す。
// ===================================================================

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

/** 一度でも開いたか。端末ごとの好みなので localStorage に持つ（§4.4） */
const HINT_KEY = "autopunch.assist.opened";

export default function AssistButton({ onOpen }: { onOpen: () => void }) {
  // サーバー側では localStorage を読めない。
  // 最初は出さずに、画面が出てから判定する（読み込み直後にヒントが点滅しないため）
  const [hint, setHint] = useState(false);

  useEffect(() => {
    try {
      // 🔴 検査（react-hooks/set-state-in-effect）を承知の上で外している。
      //    localStorage はサーバーでは読めないので、描画中には読めない。
      //    「画面が出てから入れる」以外に書きようがない。
      //    理由：docs/md/90_不具合と改善/90_不具合と改善の履歴.md §7
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHint(localStorage.getItem(HINT_KEY) !== "1");
    } catch {
      // プライベートモード等で localStorage が使えない場合。ヒントを出さないだけ
    }
  }, []);

  function open() {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* 使えなくても動作に影響しない */
    }
    setHint(false);
    onOpen();
  }

  return (
    <div className="fixed right-6 bottom-6 z-30 flex items-center gap-2">
      {hint && (
        <span className="bg-slate-900 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-lg">
          AIに直してもらう
        </span>
      )}
      <button
        onClick={open}
        aria-label="AIに直してもらう"
        className="w-14 h-14 rounded-full bg-ads-ai hover:bg-ads-ai-dark text-white shadow-lg flex items-center justify-center"
      >
        <Sparkles className="w-6 h-6" />
      </button>
    </div>
  );
}
