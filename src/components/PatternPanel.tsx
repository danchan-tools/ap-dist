"use client";

// ===================================================================
// P-1 この月の基本パターン（F-2）
//
// ここを1回入れれば、営業日すべてに反映される。
// ⚠️ すでに入力済みの日も上書きされる。押す前に確認をとる（§4）。
// ===================================================================

import { ChevronDown, ChevronUp, Loader2, Wand2 } from "lucide-react";
import { useState } from "react";
import EndTimeInput from "@/components/EndTimeInput";
import TimeInput from "@/components/TimeInput";
import { PLACES } from "@/lib/constants";
import type { Pattern } from "@/lib/types";

export default function PatternPanel({
  pattern,
  hasDays,
  onApply,
}: {
  pattern: Pattern;
  /** すでに入力済みの日があるか。あれば確認ダイアログを出す */
  hasDays: boolean;
  onApply: (p: Pattern) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<Pattern>(pattern);
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (busy) return;
    if (hasDays && !confirm("すでに入力済みの内容が上書きされます。よろしいですか？")) return;
    setBusy(true);
    try {
      await onApply(draft);
    } finally {
      setBusy(false);
    }
  }

  const field = "bg-white border border-ads-border rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-ads-accent";

  return (
    <section className="bg-ads-accent/5 border-2 border-ads-accent/30 rounded-xl overflow-hidden">
      <div className="px-5 py-2.5 flex items-center justify-between gap-3 border-b border-ads-accent/20">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-ads-accent" />
          <span className="text-sm font-bold text-slate-900">この月の基本パターン</span>
          <span className="text-[11px] text-ads-muted hidden sm:inline">
            ここを1回入れれば、営業日すべてに反映されます
          </span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] font-bold text-ads-muted hover:text-slate-900 flex items-center gap-1 flex-shrink-0"
        >
          {open ? (
            <>
              折りたたむ <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              開く <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {open && (
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ads-muted">開始</span>
              {/* 🔴 時計マークを終了とそろえるため、ブラウザの絵柄は使わない（TimeInput 参照） */}
              <TimeInput
                value={draft.start}
                onChange={(v) => setDraft({ ...draft, start: v })}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ads-muted">終了</span>
              {/* 🔴 幅を決めない。中身（数字＋時計マーク）に合わせて、
                  開始・休憩と同じ大きさになる（2026-08-06 変更） */}
              <EndTimeInput
                value={draft.end}
                onChange={(v) => setDraft({ ...draft, end: v })}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ads-muted">休憩</span>
              <TimeInput
                value={draft.brk}
                onChange={(v) => setDraft({ ...draft, brk: v })}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ads-muted">作業場所</span>
              <select
                value={draft.place}
                onChange={(e) => setDraft({ ...draft, place: e.target.value })}
                className={field}
              >
                {PLACES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={apply}
              disabled={busy}
              className="ml-auto bg-ads-accent hover:bg-ads-accent-light disabled:bg-ads-dim text-white text-sm font-bold px-5 py-2.5 rounded-lg flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  反映中…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  営業日すべてに反映する
                </>
              )}
            </button>
          </div>

          <p className="mt-3 text-[11px] text-ads-muted flex flex-wrap gap-x-4 gap-y-1">
            <span>✓ 土日・祝日は自動で休日</span>
            <span>✓ 前月の設定が初期値</span>
            <span>✓ 日をまたぐ日は、終了を 24:00以上の数値で入力（例 26:00）</span>
            <span className="text-amber-700 font-bold">⚠ 既に入力済みの日も上書きされます</span>
          </p>
        </div>
      )}
    </section>
  );
}
