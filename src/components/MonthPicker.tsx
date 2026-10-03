"use client";

// ===================================================================
// 年月の切り替え（2026-08-08 追加・段木さんの要望）
//
// それまでは ‹ › で1か月ずつしか動けなかった。
// 2026年8月 から 2028年2月 へ行くのに **18回**押す必要があり、
// 実際には URL の `ym=` を手で書き換えて移動していた。
//
// 🔴 いちばん効くのは Excel 取り込み（2024年1月〜2026年8月の43か月）。
//    43か月を行ったり来たりするので、1か月ずつでは終わらない。
//
// 📌 見た目と作法は `ProjectPicker` に合わせる。
//    ヘッダーに2つプルダウンが並ぶので、開き方が違うと迷う。
// ===================================================================

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { monthHref } from "@/lib/urls";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function MonthPicker({
  projectId,
  year,
  month,
}: {
  projectId: number;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /** パネルの中で見ている年。開いている月の年とは別に動く */
  const [viewYear, setViewYear] = useState(year);
  const boxRef = useRef<HTMLDivElement>(null);

  /**
   * 今日が属する年月。**マウントしてから入れる。**
   *
   * 🔴 描画中に `new Date()` を呼ばない（2026-08-08）。
   *    この部品はサーバーでも1回描かれる。サーバーとブラウザで日付がずれると、
   *    React が食い違いを出す。だから最初は null にしておき、
   *    ブラウザで動きだしてから入れる。
   */
  const [today, setToday] = useState<{ y: number; m: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    // 🔴 検査（react-hooks/set-state-in-effect）を承知の上で外している。
    //    描画中に new Date() を呼ぶと、サーバーとブラウザで日付がずれる（上の注記）。
    //    理由：docs/md/90_不具合と改善/90_不具合と改善の履歴.md §7
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday({ y: now.getFullYear(), m: now.getMonth() + 1 });
  }, []);

  // 外を押したら閉じる（ProjectPicker と同じ）。
  // 📌 スクロールでは閉じない。中を触っただけで閉じてしまうため
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    // 🔴 開くたびに、いま見ている月の年へ戻す。
    //    前に開いたときの年が残っていると、押した場所と違う年へ飛ぶ
    if (!open) setViewYear(year);
    setOpen((v) => !v);
  }

  function go(y: number, m: number) {
    setOpen(false);
    // 🔴 年月を変えても案件は変えない（`monthHref` が案件を必ず付ける）
    router.push(monthHref(projectId, y, m));
    router.refresh();
  }

  /** いま開いているのが今月か（今月へ戻るボタンを押せなくするため） */
  const isOnThisMonth = today?.y === year && today?.m === month;

  function goThisMonth() {
    // 🔴 描画中に new Date() を呼ばない。
    //    サーバーとブラウザで日付がずれると、React が食い違いを出す。
    //    押したときにだけ評価する
    const now = new Date();
    go(now.getFullYear(), now.getMonth() + 1);
  }

  return (
    <div ref={boxRef} className="relative flex-shrink-0">
      <button
        onClick={toggle}
        aria-label="年月を選ぶ"
        aria-expanded={open}
        className="flex items-center gap-1 text-sm font-bold text-slate-900 tabular-nums min-w-28 justify-center px-2 py-1.5 rounded-lg hover:bg-ads-hover"
      >
        {year}年 {month}月
        {/* 🔴 ads-dim(#94a3b8) だと薄くて「押せる」と気づけない。
            ads-muted(#64748b) に上げた（2026-08-08・段木さんの指摘）。
            ProjectPicker の ▾ も同じ役割なので、あちらも同時に上げてある */}
        <ChevronDown className="w-3.5 h-3.5 text-ads-muted flex-shrink-0" />
      </button>

      {open && (
        // ⚠️ z-30 は【ヘッダーの中でしか効かない】（2026-08-07 の学び）。
        //    外と比べるときは親（ヘッダー z-20）の数字で比べられる。
        //    ヘッダーの z を下げると、ここが合計バーの下に潜る。
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-60 bg-white border border-ads-border rounded-xl shadow-lg p-2 z-30">
          {/* 年を動かす */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="前の年"
              className="p-1.5 rounded-lg text-ads-muted hover:bg-ads-hover hover:text-slate-900"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{viewYear}年</span>
            <button
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="次の年"
              className="p-1.5 rounded-lg text-ads-muted hover:bg-ads-hover hover:text-slate-900"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 月を選ぶ */}
          {/*
            🔴 印は2種類ある。混ぜない（2026-08-08）。
              「いま開いている月」 … 青く塗る。どこを見ているか
              「今月」             … 下に “今月” と書く。今日がどこか
            どちらも同じ月のこともあるので、塗りと文字で分けてある。
            📌 記号（点や枠）ではなく文字にしたのは、記号は意味を説明しないと伝わらないため。
          */}
          <div className="grid grid-cols-4 gap-1">
            {MONTHS.map((m) => {
              const here = viewYear === year && m === month; // いま開いている月
              const isThisMonth = today?.y === viewYear && today?.m === m; // 今月
              return (
                <button
                  key={m}
                  onClick={() => go(viewYear, m)}
                  aria-label={`${viewYear}年${m}月`}
                  aria-current={here ? "true" : undefined}
                  className={`flex flex-col items-center py-1.5 rounded-lg text-xs font-bold tabular-nums ${
                    here ? "bg-ads-accent text-white" : "text-slate-900 hover:bg-ads-hover"
                  }`}
                >
                  <span>{m}月</span>
                  {/* 📌 空でも場所を取る。ボタンの高さがそろわないとガタつくため */}
                  <span
                    className={`text-[9px] leading-none h-2.5 font-bold ${
                      here ? "text-white/80" : "text-ads-accent-light"
                    }`}
                  >
                    {isThisMonth ? "今月" : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={goThisMonth}
            disabled={isOnThisMonth}
            className="mt-2 w-full text-xs font-bold text-ads-accent-light hover:bg-ads-hover disabled:text-ads-dim disabled:hover:bg-transparent rounded px-2 py-1.5 border-t border-ads-border pt-2"
          >
            {isOnThisMonth ? "いま今月を開いています" : "今月へ戻る"}
          </button>
        </div>
      )}
    </div>
  );
}
