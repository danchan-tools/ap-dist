"use client";

// ===================================================================
// W-1 AIアシスタント・ウィンドウの「枠」（06_AIアシスタント設計.md §2.3・§2.4）
//
// 🔴 背景を暗くしない。
//    後ろの表・サマリー・見込み金額カードは、そのまま見えて、そのまま押せる。
//    直した結果が金額に出るのを、その場で確認できるようにするため（§1.2）。
//
// 🔴 位置は【画面の右下に固定】（2026-08-08 段木さんの判断）。
//    もとはドラッグで動かせて、位置を localStorage に憶えていた。
//    ノートPCからモニターにつなぎ替えると、憶えた座標のまま取り残されて
//    画面の中途半端な場所に出る、という不具合が出た。
//
//    「ダブルクリックで右下に戻す」を足して直そうとしたが、そもそも
//    **動かせる必要がなかった。**表を見たいときは − で畳めば済む（§2.3）。
//    仕組みを足すのではなく、動かせること自体をやめた。
//
//    これで消えたもの：位置の記憶・画面外への はみ出し・つなぎ替えでの取り残され。
//
//   狭い画面（640px未満）では、いままでどおり下いっぱいに広げる。
// ===================================================================

import { ChevronUp, Minus, Sparkles, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

/** ウィンドウの大きさ。固定（リサイズは作らない。§14 の落とす順番） */
const W = 380;
const H = 520;

/**
 * 画面の右下からの距離。W-0 の丸ボタンと同じ 24px（`right-6 bottom-6`）。
 *
 * 🔴 丸ボタンをよけて 88px 空けない（2026-08-08 段木さんの指摘）。
 *    ウィンドウを開いているあいだ、丸ボタンは隠れる（`MonthView.tsx` の `!assistOpen`）。
 *    よけた分だけ窓が浮き上がって見え、右下に置いたつもりが中途半端な位置になる。
 *
 * 📌 畳んだときと同じ値にしてある。
 *    違う値にすると、− を押した瞬間に帯が上下へ飛ぶ。
 */
const MARGIN = 24;

/** 狭い画面の境目。これ未満はスマホ想定で全幅にする */
const NARROW = 640;

export default function AssistWindow({
  year,
  month,
  onClose,
  children,
}: {
  year: number;
  month: number;
  onClose: () => void;
  children: ReactNode;
}) {
  // null は「まだ画面の広さを測っていない」。サーバー側では window を触れない
  const [narrow, setNarrow] = useState<boolean | null>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    function measure() {
      setNarrow(window.innerWidth < NARROW);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Esc で閉じる（M-1 と同じ規則）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (narrow === null) return null;

  /**
   * 置き場所を決める。**どの場合も画面の右下に貼り付ける**（2026-08-08）。
   *
   * 📌 畳んでも同じ場所（§2.3 の「畳んだら右下にしまう」は、これで自然に満たされる）。
   *
   * 🔴 `maxHeight` を入れておく。
   *    高さの低い画面（ノートPCを縦に狭くしたときなど）で、
   *    520px が入りきらずに上へ はみ出すのを防ぐ。中身は flex で縮む。
   */
  const style = narrow
    ? { left: 0, right: 0, bottom: 0, width: "100%", height: minimized ? "auto" : "70vh" }
    : minimized
      ? { right: MARGIN, bottom: MARGIN, width: W, height: "auto" as const }
      : {
          right: MARGIN,
          bottom: MARGIN,
          width: W,
          height: H,
          maxHeight: `calc(100vh - ${MARGIN + 16}px)`,
        };

  return (
    // 🔴 暗幕（bg-slate-900/40）を置かない。後ろをそのまま押せるようにするため
    <div
      className="fixed z-40 bg-white border border-ads-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      style={style}
      role="dialog"
      aria-label="AIアシスタント"
    >
      <div
        className={`flex items-center gap-2 px-4 py-2.5 bg-ads-surface select-none ${
          minimized ? "" : "border-b border-ads-border"
        }`}
      >
        <Sparkles className="w-4 h-4 text-ads-ai flex-shrink-0" />
        {/* 🔴 畳んでいるあいだも、この見出しは出したままにする（何の窓か分からなくなるため） */}
        <span className="text-sm font-bold text-slate-900">AIに直してもらう</span>
        {/* どの月を直すのかを必ず出す（§2.3）。8月の話のまま9月を直すと事故になる */}
        <span className="text-[11px] font-bold text-ads-muted tabular-nums">
          {year}年{month}月
        </span>
        <button
          onClick={() => setMinimized((v) => !v)}
          aria-label={minimized ? "元の大きさに戻す" : "最小化して右下にしまう"}
          title={minimized ? "元の大きさに戻す" : "最小化して右下にしまう"}
          className="ml-auto text-ads-dim hover:text-slate-900 p-1"
        >
          {minimized ? <ChevronUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
        </button>
        <button onClick={onClose} aria-label="閉じる" className="text-ads-dim hover:text-slate-900 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/*
        最小化しても会話は消えない（§2.3）。
        🔴 ここを `{!minimized && ...}` にすると中身が作り直され、**会話が消える。**
           畳んでいるあいだも置いたまま、CSS で隠すだけにする。
      */}
      <div className={`flex-1 min-h-0 flex flex-col ${minimized ? "hidden" : ""}`}>{children}</div>
    </div>
  );
}
