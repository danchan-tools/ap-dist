"use client";

// ===================================================================
// 始業・休憩の時刻入力欄（2026-08-06 追加）
//
// 中身は今までどおり `<input type="time">`。
// 変えたのは**時計マークだけ**。
//
// 🔴 なぜ作ったか（段木さんの指摘）。
//    それまで、始業・休憩の時計マークは**ブラウザが描くもの**、
//    終了（`EndTimeInput`）の時計マークは**こちらで描くもの**だった。
//    別物なので、色も形も余白もそろわない。
//    「色を合わせる」と調整しても、ブラウザや環境が変われば また ずれる。
//
//    **ブラウザの絵柄を隠して、3つとも同じ絵柄を使う。**
//    こうすれば、そろえる調整そのものが要らなくなる。
//
// 📌 押したときの動きは変えない。
//    ブラウザが持っている時刻の一覧（`showPicker()`）をそのまま開く。
//    使えないブラウザでは、入力欄に印を移すだけにする（キーボードで打てる）。
// ===================================================================

import { Clock } from "lucide-react";
import { useRef } from "react";

export default function TimeInput({
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  function openPicker() {
    const el = ref.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      // 対応していないブラウザ。入力欄に印を移すだけにする
      el.focus();
    }
  }

  return (
    // 枠線・背景・余白は【この外側の箱】が持つ（EndTimeInput と同じ作り）
    <span
      className={`${className ?? ""} inline-flex items-center gap-1.5 focus-within:border-ads-accent ${
        disabled ? "bg-ads-surface text-ads-dim" : ""
      }`}
    >
      <input
        ref={ref}
        type="time"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        /*
         * 🔴 `[&::-webkit-calendar-picker-indicator]:hidden` が肝。
         *    ブラウザが描く時計マークを消して、下のボタンに置き換える。
         *    幅は指定しない。中身に合わせて自然な大きさになる
         */
        className="flex-none bg-transparent border-0 p-0 outline-none tabular-nums disabled:text-ads-dim [&::-webkit-calendar-picker-indicator]:hidden"
      />

      <button
        type="button"
        disabled={disabled}
        aria-label="時刻を一覧から選ぶ"
        onClick={openPicker}
        className="flex-none p-0.5 rounded text-slate-600 hover:text-slate-900 disabled:text-ads-dim"
      >
        <Clock className="w-4 h-4" />
      </button>
    </span>
  );
}
