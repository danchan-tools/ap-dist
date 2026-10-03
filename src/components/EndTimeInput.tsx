"use client";

// ===================================================================
// 終業の入力欄
//
// `<input type="time">` を使えない。**24:00 以降を受け付けないため**
// （26:00 と打っても値が空になる）。
// 夜勤を 17:00〜26:00 と書けるように、手入力の欄にしてある。
//
// 📌 ただし、見た目も操作も他の時刻欄（始業・休憩）にそろえる。
//    ・時計マークを押すと一覧が出る
//    ・**「時」と「分」の2列**。始業の時計マークを押したときと同じ形
//    ・**1分単位**。始業・休憩と刻みをそろえる（2026-08-05 利用者の指摘）
//
//   打ちやすさのため、離れたときに整える
//     "9:30"  → "09:30"
//     "2600"  → "26:00"
//
// 🔴 一覧は `position: fixed` で画面に直接浮かせる（2026-08-06 修正）。
//    親（基本パターンのパネル）に `overflow-hidden` が付いているため、
//    `absolute` のままでは**一覧がパネルの枠で切り取られ、後ろも見えなくなる。**
//    親の都合に左右されないよう、画面を基準に置き直した。
// ===================================================================

import { Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { END_TIME_RE } from "@/lib/constants";
import { normalizeEndTime } from "@/lib/time";

const pad = (n: number) => String(n).padStart(2, "0");

/** 時は 00〜29（翌朝5時台まで）、分は 00〜59 の1分きざみ */
const HOURS = Array.from({ length: 30 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

/** 一覧の大きさ（`w-36` と、列 `max-h-52` ＋ 見出し・脚注ぶん） */
const LIST_W = 144;
const LIST_H = 268;

/** 画面の縁からの余白 */
const EDGE = 8;

export default function EndTimeInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  /** 一覧の置き場所（画面の左上からの位置）。閉じているときは null */
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const listRef = useRef<HTMLSpanElement | null>(null);
  const hourRef = useRef<HTMLButtonElement | null>(null);
  const minuteRef = useRef<HTMLButtonElement | null>(null);

  const open = at !== null;
  const invalid = value !== "" && !END_TIME_RE.test(value);

  // いま選ばれている「時」「分」。入力が空・不正なら null
  const parts = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = parts?.[1] ?? null;
  const minute = parts?.[2] ?? null;

  /** 入力欄の位置を測って、その真下（入らなければ真上）に一覧を置く */
  const openList = useCallback(() => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(EDGE, r.right - LIST_W), window.innerWidth - LIST_W - EDGE);
    const below = r.bottom + 4;
    // 下にはみ出すなら、入力欄の上に出す
    const top = below + LIST_H > window.innerHeight ? Math.max(EDGE, r.top - 4 - LIST_H) : below;
    setAt({ top, left });
  }, []);

  // 開いたとき、両方の列を「いまの値」が見える位置までずらす。
  // 🔴 `scrollIntoView()` は使わない。**ページ全体まで動いてしまう**ため、
  //    列の中だけをずらす。
  useEffect(() => {
    if (!open) return;
    for (const ref of [hourRef, minuteRef]) {
      const el = ref.current;
      const box = el?.parentElement;
      if (el && box) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    }
  }, [open]);

  // 画面をスクロールしたり幅を変えたら、位置がずれるので閉じる
  useEffect(() => {
    if (!open) return;

    /**
     * 🔴 **一覧の中（時・分の列）のスクロールでは閉じない。**
     *
     * 上の `useEffect` が「いまの値まで列をずらす」ので、
     * 開いた直後に必ずスクロールが起きる。
     * これを外側のスクロールと同じに扱うと、**開いた瞬間に閉じてしまう**
     * （2026-08-06 に実際にそうなった）。
     */
    const close = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      setAt(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const cell = (selected: boolean) =>
    `block w-full text-center px-2 py-1.5 text-sm tabular-nums hover:bg-ads-hover ${
      selected ? "bg-ads-accent/10 font-bold text-ads-accent-light" : "text-slate-700"
    }`;

  return (
    /*
     * 🔴 枠線・背景・余白は【この外側の箱】が持つ（2026-08-06 変更・段木さんの指摘）。
     *
     *    それまでは入力欄そのものが枠を持ち、時計マークを枠の**右端に固定**していた。
     *    始業・休憩（ブラウザが描く `<input type="time">`）は**数字のすぐ横**に
     *    時計マークが並ぶので、終了だけ数字と時計のあいだが大きく空いて見えていた。
     *
     *    数字 → 時計 の順に横並びにして、**あいだの余白を揃えた。**
     */
    <span
      ref={wrapRef}
      className={`${className ?? ""} inline-flex items-center gap-1.5 focus-within:border-ads-accent ${
        invalid ? "border-rose-400" : ""
      } ${disabled ? "bg-ads-surface text-ads-dim" : ""}`}
    >
      <input
        type="text"
        inputMode="numeric"
        placeholder="18:30"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(normalizeEndTime(e.target.value))}
        aria-invalid={invalid}
        /* 枠は外側が持つので、ここは中身だけ。幅は文字5つぶん（`em` なので文字の大きさに追従する） */
        className="w-[2.9em] flex-none bg-transparent border-0 p-0 outline-none tabular-nums disabled:text-ads-dim"
      />

      {/* 色は始業・休憩の時計マーク（ブラウザが描くもの）に合わせてある。
          片方だけ薄いと、同じ機能に見えなくなるため */}
      <button
        type="button"
        disabled={disabled}
        aria-label="時刻を一覧から選ぶ"
        onClick={() => (open ? setAt(null) : openList())}
        className="flex-none p-0.5 rounded text-slate-600 hover:text-slate-900 disabled:text-ads-dim"
      >
        <Clock className="w-4 h-4" />
      </button>

      {at && !disabled && (
        <>
          {/*
            外側を押したら閉じる。日次編集モーダルまで閉じないよう、ここで止める。
            🔴 モーダル（z-50）より上に置く。下だと、モーダルの中で外側を押しても閉じない
          */}
          <span
            className="fixed inset-0 z-[60]"
            onClick={(e) => {
              e.stopPropagation();
              setAt(null);
            }}
          />
          <span
            ref={listRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Enter") {
                e.stopPropagation();
                e.preventDefault();
                setAt(null);
              }
            }}
            style={{ top: at.top, left: at.left, width: LIST_W }}
            className="fixed z-[61] bg-white border border-ads-border rounded-lg shadow-lg overflow-hidden"
          >
            <span className="grid grid-cols-2 text-[10px] font-bold text-ads-muted bg-ads-surface border-b border-ads-border">
              <span className="block text-center py-1">時</span>
              <span className="block text-center py-1 border-l border-ads-border">分</span>
            </span>

            <span className="grid grid-cols-2">
              {/* 時：選んでも閉じない。続けて分を選べるようにするため */}
              <span className="block max-h-52 overflow-y-auto">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    ref={h === hour ? hourRef : undefined}
                    onClick={() => onChange(`${h}:${minute ?? "00"}`)}
                    // 24時以降（翌日ぶん）は左に線を引いて区切るだけ。
                    // 🔴 「翌0時」の文字は入れない（2026-08-06 段木さんの指摘）。
                    //    列が狭いので2行に折り返して崩れるうえ、
                    //    「24:00以上の数値で入力」の案内が下にすでにある。
                    // 📌 線は紫にしない。紫は AI（F-10）の色として使っているため
                    className={`${cell(h === hour)} ${h >= "24" ? "border-l-2 border-l-slate-300" : ""}`}
                  >
                    {h}
                  </button>
                ))}
              </span>

              {/* 分：選んだら閉じる（時 → 分 の順に選び終わるため） */}
              <span className="block max-h-52 overflow-y-auto border-l border-ads-border">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    ref={m === minute ? minuteRef : undefined}
                    onClick={() => {
                      onChange(`${hour ?? "00"}:${m}`);
                      setAt(null);
                    }}
                    className={cell(m === minute)}
                  >
                    {m}
                  </button>
                ))}
              </span>
            </span>

            <span className="block px-2 py-1.5 text-[10px] text-ads-muted border-t border-ads-border bg-ads-surface text-center">
              直接入力もできます
            </span>
          </span>
        </>
      )}
    </span>
  );
}
