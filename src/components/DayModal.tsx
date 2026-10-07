"use client";

// ===================================================================
// M-1 日次編集モーダル（F-3）
//
//   区分を選ぶと、時刻欄の有効・無効が切り替わる
//   入力中はその場で勤務・残業を計算して見せる
//   Enter で保存／Esc で閉じる（作業内容の欄だけ Ctrl+Enter）
//   「この日をクリア」は、押しても二段階の確認を挟む（I-2）
// ===================================================================

import { AlertTriangle, Eraser, X } from "lucide-react";
import { useEffect, useState } from "react";
import EndTimeInput from "@/components/EndTimeInput";
import TimeInput from "@/components/TimeInput";
import { DEFAULT_NOTE } from "@/lib/apply";
import { calcDay, isBreakMissing } from "@/lib/calc";
import { dowOf } from "@/lib/calendar";
import { END_TIME_RE, KINDS, PLACES } from "@/lib/constants";
import { toHMM, toMin } from "@/lib/time";
import type { Day, DayKind, Pattern } from "@/lib/types";

export default function DayModal({
  year,
  month,
  day,
  value,
  pattern,
  baseWorkMinutes,
  onClose,
  onSave,
  onClear,
}: {
  year: number;
  month: number;
  day: number;
  /** その日の現在の内容。まだ無ければ undefined */
  value: Day | undefined;
  /** 未設定の日を開いたときの初期値に使う */
  pattern: Pattern;
  baseWorkMinutes: number;
  onClose: () => void;
  onSave: (d: Day) => Promise<string | null>; // エラー文言、成功なら null
  /** その日の記録を消す（I-2）。エラー文言、成功なら null */
  onClear: () => Promise<string | null>;
}) {
  const initial: Day = value ?? {
    kind: "勤務",
    startAt: pattern.start,
    endAt: pattern.end,
    breakAt: pattern.brk,
    place: pattern.place,
    note: "通常業務",
  };

  const [kind, setKind] = useState<DayKind>(initial.kind);
  const [startAt, setStartAt] = useState(initial.startAt ?? "");
  const [endAt, setEndAt] = useState(initial.endAt ?? "");
  const [breakAt, setBreakAt] = useState(initial.breakAt ?? "");
  const [place, setPlace] = useState(initial.place ?? pattern.place);
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /**
   * クリアの確認を出しているか（I-2・2026-08-29）。
   *
   * 🔴 モーダルの上にモーダルを重ねない。
   *    重ねると `Esc` の行き先が2つになり、どちらが閉じるか決めなければならない。
   *    ボタンがその場で「消す／やめる」に変わる形にした。
   */
  const [confirmClear, setConfirmClear] = useState(false);

  /**
   * 終業の欄に入っているか（I-10・2026-10-07）。
   *
   * 打っている途中の「2」「20」も「時:分」の形ではないので、そのままだと
   * 黄色の「終業の形が正しくありません」が一瞬出ていた（B-9 の残り）。
   * 欄に入っている間は形の注意だけを出さず、離れて、まだ形が違えば出す。
   * 見た目は、段木さんが本物の画面で撮った3案から選んだ。
   */
  const [endEditing, setEndEditing] = useState(false);

  const isWork = kind === "勤務";

  /**
   * 区分を変える。
   *
   * 勤務 → 休暇 に変えたとき、コメントが「通常業務」のまま残ると、
   * Excelの備考欄（休暇の理由を書く場所）に「通常業務」と出てしまう。
   * 既定のままなら消し、勤務に戻したら既定に戻す。
   * 自分で書いた文章は消さない。
   */
  function pickKind(k: DayKind) {
    setKind(k);
    if (k !== "勤務" && note === DEFAULT_NOTE) setNote("");
    if (k === "勤務" && note === "") setNote(DEFAULT_NOTE);
  }
  const c = calcDay({ kind, startAt, endAt, breakAt }, baseWorkMinutes);
  // 🔴 休憩の入れ忘れの判定は isBreakMissing だけが持つ（I-5）。表・チェックと同じ答えにする
  const breakMissing = isBreakMissing({ kind, startAt, endAt, breakAt });

  // その日に関する警告だけを、ここに出す
  let warning = "";
  if (isWork && endAt !== "" && !END_TIME_RE.test(endAt)) {
    // 🔴 欄に入っている間は出さない（I-10）。ほかの注意にも進ませない（形が違う間は計算できないため）
    if (!endEditing) warning = "終業の形が正しくありません。00:00〜29:59 の範囲で「時:分」で入力してください（例：18:30 ／ 26:00）。";
  } else if (isWork && c.error) {
    warning =
      (toMin(endAt) ?? 0) <= (toMin(startAt) ?? 0)
        ? "終了が開始より前になっています。打ち間違いではありませんか。"
        : "休憩が勤務の時間を超えています。勤務時間がマイナスになります。";
  } else if (isWork && (!startAt || !endAt)) {
    warning = "勤務の日は、開始と終了の両方が必要です。";
  } else if (breakMissing) {
    warning = "6時間を超える勤務なのに、休憩時間が入力されていません。入れ忘れではありませんか。";
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    const payload: Day = isWork
      ? { kind, startAt, endAt, breakAt: breakAt || null, place, note }
      : { kind, note };
    const err = await onSave(payload);
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  /** 確認したうえで、その日の記録を消す（I-2） */
  async function clear() {
    if (busy) return;
    setBusy(true);
    setError("");
    const err = await onClear();
    if (err) {
      setError(err);
      setBusy(false);
      setConfirmClear(false);
    }
  }

  // Esc で閉じる／Enter で保存。コメント欄の中だけは改行を優先する
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // 🔴 クリアの確認を出しているときは、まず確認だけを取り消す（I-2）。
        //    モーダルを重ねなかったので、Esc の行き先は常に1つに決まる
        if (confirmClear) {
          setConfirmClear(false);
          return;
        }
        onClose();
        return;
      }
      // 確認を出しているあいだは Enter で保存しない。
      // 「消してよいですか？」と聞きながら保存が走るのは、答えになっていない
      if (confirmClear) return;
      if (e.key !== "Enter") return;
      const inTextarea = (e.target as HTMLElement)?.tagName === "TEXTAREA";
      if (inTextarea && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      void save();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const field =
    "w-full bg-white border border-ads-border rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-ads-accent disabled:bg-ads-surface disabled:text-ads-dim";

  return (
    // 🔴 枠の外を押しても閉じない（2026-08-08。M-2 契約条件と同じ扱いにそろえた）。
    //    閉じるのは【保存】【キャンセル】【✕】【Esc】の4つだけ。
    //
    //    時刻を入れている途中で枠の外を押すと、入れた値がすべて消えていた。
    //    ⚠️ 同じ作りのモーダルは、閉じ方も同じにする。
    //       片方だけ消えると「どっちだったか」を毎回確かめることになる。
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-ads-border flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">
            {month}月{day}日({dowOf(year, month, day)}) の勤務
          </span>
          <button onClick={onClose} aria-label="閉じる" className="text-ads-dim hover:text-slate-900">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div>
            <span className="block text-[11px] font-bold text-ads-muted mb-1.5">区分</span>
            <div className="grid grid-cols-4 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => pickKind(k)}
                  className={`rounded-lg py-1.5 text-center text-sm font-bold border ${
                    k === kind
                      ? "border-2 border-ads-accent bg-ads-accent/5 text-ads-accent-light"
                      : "border-ads-border text-ads-muted"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ads-muted">始業</span>
              {/* 🔴 時計マークを終業とそろえるため、ブラウザの絵柄は使わない（TimeInput 参照） */}
              <TimeInput value={startAt} disabled={!isWork} className={field} onChange={setStartAt} />
            </label>
            <label className="flex flex-col gap-1" onFocus={() => setEndEditing(true)} onBlur={() => setEndEditing(false)}>
              <span className="text-[11px] font-bold text-ads-muted">終業</span>
              <EndTimeInput value={endAt} disabled={!isWork} className={field} onChange={setEndAt} />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className={`text-[11px] font-bold ${breakMissing ? "text-amber-600" : "text-ads-muted"}`}
              >
                休憩
              </span>
              <TimeInput value={breakAt} disabled={!isWork} className={field} onChange={setBreakAt} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ads-muted">作業場所</span>
              <select value={place} disabled={!isWork} className={field}
                onChange={(e) => setPlace(e.target.value)}>
                {PLACES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>

          {isWork && (
            <p className="-mt-2 text-[11px] text-ads-muted">
              日をまたぐ日は、終業を <span className="font-bold text-slate-700">24:00以上の数値</span>
              で入力します（例：17:00〜<span className="font-bold text-slate-700">26:00</span> ＝ 翌2時まで）
            </p>
          )}

          {warning && (
            <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {warning}
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-ads-muted">
              {isWork ? "作業内容（報告サイトに入力する内容）" : "備考（休みの理由など）"}
            </span>
            <textarea rows={2} value={note} className={field} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="flex items-center gap-4 text-sm border-t border-ads-border pt-3">
            {!isWork ? (
              <span className="text-xs text-ads-muted">この日は計算の対象外です</span>
            ) : c.error ? (
              <span className="font-bold text-rose-600">計算できません</span>
            ) : (
              <>
                <span className="font-bold text-slate-900">勤務 {toHMM(c.work)}</span>
                <span className={`font-bold ${c.ot ? "text-amber-600" : "text-slate-400"}`}>
                  残業 {toHMM(c.ot)}
                </span>
                {/* 丸まる日だけ、精算に使う値を添える（§7.7） */}
                {c.work !== c.bill && (
                  <span className="text-[11px] text-ads-muted">精算 {toHMM(c.bill)}（15分単位）</span>
                )}
              </>
            )}
          </div>

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>

        {/* I-2 この日をクリア。押しても、すぐには消さない */}
        <div className="px-5 py-2.5 border-t border-ads-border">
          {confirmClear ? (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <span className="text-xs font-bold text-rose-800">
                {month}月{day}日 の入力を消してよいですか？
              </span>
              <button
                onClick={() => void clear()}
                disabled={busy}
                className="ml-auto bg-rose-600 hover:bg-rose-700 disabled:bg-ads-dim text-white text-xs font-bold px-3 py-1.5 rounded"
              >
                {busy ? "消しています…" : "消す"}
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                disabled={busy}
                className="text-xs font-bold text-ads-muted hover:text-slate-900 px-2 py-1.5"
              >
                やめる
              </button>
            </div>
          ) : (
            /* 🔴 枠で囲む（2026-08-29 段木さんの指摘）。
                  枠が無いと、ただの説明文に見えて「押せる」と気づけない。
                  ProjectPicker の ▾ を色でそろえたときと同じ話（2026-08-08） */
            <button
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1.5 border border-ads-border hover:border-rose-300 hover:bg-rose-50 rounded-lg px-3 py-1.5 text-xs font-bold text-ads-muted hover:text-rose-700"
            >
              <Eraser className="w-3.5 h-3.5" />
              この日をクリア
            </button>
          )}
          {/* 消したあとどうなるかを、押す前に見せる */}
          <p className="mt-1.5 text-[10px] text-ads-dim">
            平日は空欄に、土日は「休日」に、祝日は「祝日」に戻ります
          </p>
        </div>

        <div className="px-5 py-3 bg-ads-surface border-t border-ads-border flex items-center gap-3">
          <span className="text-[11px] text-ads-dim">Enter で保存 ／ Esc で閉じる</span>
          <button onClick={onClose}
            className="ml-auto text-sm font-bold text-ads-muted hover:text-slate-900 px-4 py-2">
            キャンセル
          </button>
          <button onClick={save} disabled={busy}
            className="bg-ads-accent hover:bg-ads-accent-light disabled:bg-ads-dim text-white text-sm font-bold px-5 py-2 rounded-lg">
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
