"use client";

// ===================================================================
// M-2 契約条件の設定（F-9）
//
// 契約が変われば下限・上限・単価がすべて変わるため、**月ごと**に保存する
// （03_業務ロジック設計 §7.4）。
//
// 🔴 拡張1（2026-08-07）から、基準労働時間も**月ごと**になった。
//    案件Aが8:00・案件Bが7:30 ということが起こるため（08 §6 #1）。
//    それまでは「全期間で共通」だった。
//
// ⚠️ 単価は機密。ここに初期値として実額を書かない。
//    人に見せる前に、ダミーへ戻したか確認する
//    （01_要件定義/03_制約・非機能要件.md §2.2）。
// ===================================================================

import { Calculator, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import TimeInput from "@/components/TimeInput";
import { ymKey } from "@/lib/calendar";
import { carryNote, monthLabel, type YearMonth } from "@/lib/carryOver";
import { DEFAULT_HI, DEFAULT_LO } from "@/lib/constants";
import { autoRates } from "@/lib/money";
import { parseAmount, parseMoneyField } from "@/lib/num";
import { toHHMM, toMin } from "@/lib/time";
import type { Contract, ContractKind } from "@/lib/types";
import { formatAppVersion } from "@/lib/version";

/**
 * 分 → 入力欄の文字（表示用）。140:00 → "140"
 *
 * 🔴 未入力（null）は【空文字】にする（拡張2）。"0" にしない。
 *    0 を出すと、利用者が消し忘れただけの 0 と区別がつかなくなり、
 *    「空」と「0」の2通りで未入力を表すことになる（08 §3.3 ②）。
 */
const toHours = (min: number | null) => (min === null ? "" : String(Math.round(min / 60)));

export default function ContractModal({
  projectName,
  year,
  month,
  contract,
  baseWorkMinutes,
  aiEnabled,
  laterMonths,
  onClose,
  onSave,
}: {
  /** どの案件の契約条件かを、必ず見せる（取り違え防止） */
  projectName: string;
  year: number;
  month: number;
  contract: Contract;
  baseWorkMinutes: number;
  /** F-10 が使えるか（D-3）。使えないときだけ、その旨を1行出す */
  aiEnabled: boolean;
  /**
   * この月より後ろにある、保存済みの月（B-3・2026-09-15）。古い順。
   * 空なら「先の月にも反映する（勤務や設定を入れたことがある月）」の欄を出さない。
   */
  laterMonths: YearMonth[];
  onClose: () => void;
  /** `carryTo` は、この月と同じ設定を書き込む先の月（チェックを付けたものだけ） */
  onSave: (c: Contract, baseWorkMinutes: number, carryTo: YearMonth[]) => Promise<string | null>;
}) {
  const [kind, setKind] = useState<ContractKind>(contract.kind);
  const [lo, setLo] = useState(toHours(contract.lo));
  const [hi, setHi] = useState(toHours(contract.hi));
  const [base, setBase] = useState(String(contract.base));
  const [underRate, setUnderRate] = useState(String(contract.underRate));
  const [overRate, setOverRate] = useState(String(contract.overRate));
  const [hourlyRate, setHourlyRate] = useState(String(contract.hourlyRate));
  const [baseWork, setBaseWork] = useState(toHHMM(baseWorkMinutes));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * 反映する先の月（B-3・2026-09-15）。キーは 'YYYY-MM'。
   *
   * 🔴 最初はすべて付けておく（段木さんの判断）。
   *    反映したいのがふつうで、別の設定にしてある月だけ外す、という使い方にする。
   */
  const [carry, setCarry] = useState<Set<string>>(
    () => new Set(laterMonths.map((m) => ymKey(m.year, m.month))),
  );

  const hourly = kind === "時給";

  /** 反映する月のチェックを付け外しする（B-3） */
  function toggleCarry(key: string) {
    setCarry((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 🔴 数値の読み取りは `src/lib/num.ts` に置いてある（2026-08-08）。
  //    ここに `Number(s) || 0` と書いてあったせいで、「4,285」が 0 になり
  //    **見込み金額が実際より高く出る**不具合があった（詳しくは num.ts）。
  //    画面の中に書くとテストが書けないので、計算と同じく src/lib/ に出した。

  /** 契約時間の欄。空欄は `null`（未入力）。読めない文字は `undefined`（保存を止める） */
  function minutes(s: string): number | null | undefined {
    if (s.trim() === "") return null;
    const n = parseAmount(s);
    return n === null ? undefined : n * 60;
  }

  /** 「単価から自動計算」でだけ使う。読めなければ 0（そのまま「入力してください」で弾かれる） */
  const num = (s: string) => parseAmount(s) ?? 0;

  /**
   * 契約の種類を切り替える（08 §6 #6）。
   *
   * 🔴 月額 → 時給：下限・上限を【空にする】。
   *    残すと、月額時代の 140:00〜180:00 が画面に出ないまま C-4 の判定を続ける。
   *    利用者は「範囲のない契約に変えた」つもりでいるので、事故になる。
   *
   * 🔴 時給 → 月額：既定値を【入れる】。
   *    月額は下限・上限が必須なので、空欄のまま保存させて
   *    DBのエラーで弾くのは不親切。
   */
  function switchKind(next: ContractKind) {
    if (next === kind) return;
    setKind(next);
    setError("");
    if (next === "時給") {
      setLo("");
      setHi("");
    } else {
      setLo(toHours(DEFAULT_LO));
      setHi(toHours(DEFAULT_HI));
    }
  }

  /** 単価から控除・超過を出す。端数は【切り捨て】。四捨五入だと注文書と1円ずれる */
  function fillRates() {
    if (!num(base) || !num(lo) || !num(hi)) {
      setError("先に 単価・下限・上限 を入力してください");
      return;
    }
    const r = autoRates(num(base), num(lo), num(hi));
    setUnderRate(String(r.underRate));
    setOverRate(String(r.overRate));
    setError("");
  }

  async function save() {
    if (busy) return;

    // §7.5 入力チェック。🔴 DBの months_contract_range・APIと同じ条件にそろえてある
    const loMin = minutes(lo);
    const hiMin = minutes(hi);

    // 🔴 「読めない文字」は 0 に落とさず、ここで止める（undefined が読めない印）
    if (loMin === undefined) return setError("下限は数字で入力してください");
    if (hiMin === undefined) return setError("上限は数字で入力してください");

    const baseNum = parseMoneyField(base);
    const underNum = parseMoneyField(underRate);
    const overNum = parseMoneyField(overRate);
    const hourlyNum = parseMoneyField(hourlyRate);
    if (hourly) {
      if (hourlyNum === null) return setError("時給は数字で入力してください");
    } else if (baseNum === null || underNum === null || overNum === null) {
      return setError("単価は数字で入力してください");
    }

    if (!hourly && (loMin === null || hiMin === null)) {
      return setError("月額契約では、下限と上限の両方を入力してください");
    }
    // 🔴 「入っているなら 0 より大きい」。0 を未入力の代わりに使わせない
    if (loMin !== null && loMin <= 0) return setError("下限は 1 以上にしてください");
    if (hiMin !== null && hiMin <= 0) return setError("上限は 1 以上にしてください");
    if (loMin !== null && hiMin !== null && hiMin <= loMin) {
      return setError("上限は下限より大きい値にしてください");
    }

    const bw = toMin(baseWork);
    if (bw == null || bw <= 0) return setError("基準労働時間を正しく入力してください");

    setBusy(true);
    setError("");
    const err = await onSave(
      {
        kind,
        lo: loMin,
        hi: hiMin,
        // 🔴 使わない側の値は 0 に落とす。
        //    残すと、月額に戻したとき古い時給がそのまま効く（⑦と同じ形の事故）
        base: hourly ? 0 : (baseNum ?? 0),
        underRate: hourly ? 0 : (underNum ?? 0),
        overRate: hourly ? 0 : (overNum ?? 0),
        hourlyRate: hourly ? (hourlyNum ?? 0) : 0,
      },
      bw,
      // B-3：チェックが付いている月だけ。並びは laterMonths の古い順のまま
      laterMonths.filter((m) => carry.has(ymKey(m.year, m.month))),
    );
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  // Enter で保存／Esc で閉じる
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Enter") return;
      e.preventDefault();
      void save();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const field =
    "w-full bg-white border border-ads-border rounded-lg px-3 py-2 text-sm text-slate-900 text-right tabular-nums focus:outline-none focus:border-ads-accent";
  const label = "block text-[11px] font-bold text-ads-muted mb-1";
  const badge = (
    <span className="ml-1.5 text-[9px] font-bold bg-ads-accent/10 text-ads-accent-light rounded px-1 py-0.5">
      月ごと
    </span>
  );
  /** 時給契約のとき、下限・上限が任意だと分かるようにする（拡張2） */
  const optional = (
    <span className="ml-1.5 text-[9px] font-bold bg-ads-surface text-ads-muted border border-ads-border rounded px-1 py-0.5">
      任意
    </span>
  );

  return (
    // 🔴 枠の外を押しても閉じない（2026-08-08 段木さんの要望）。
    //    閉じるのは【保存】【キャンセル】【✕】【Esc】の4つだけ。
    //
    //    もとは外を押すと閉じる作りだったが、入力の途中で枠の外をうっかり押すと、
    //    **入れた値がすべて消える。**打ち直しになるうえ、消えたこと自体に
    //    気づかないことがある。
    //
    //    ⚠️ 単価や契約時間は「毎回入れ直すもの」ではないので、
    //       閉じやすさより【消えにくさ】を優先する。
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-ads-border flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-ads-muted" />
            契約条件の設定
            <span className="text-ads-muted font-normal">
              {/* 🔴 どの案件の何月を直しているのかを、必ず見せる */}
              {projectName} ／ {year}年 {month}月
            </span>
          </span>
          <button onClick={onClose} aria-label="閉じる" className="text-ads-dim hover:text-slate-900">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-[11px] font-bold text-slate-900 mb-2">この月の契約条件</p>

            {/*
              🔴 契約の種類（拡張2・08 §3.6）。
                 入力欄を残したまま無効にするのではなく、【出し分ける】。
                 無効にすると「入れたのに効かない」に見える。
            */}
            <div className="flex gap-2 mb-3">
              {(["月額", "時給"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => switchKind(k)}
                  className={`flex-1 text-xs font-bold px-3 py-2 rounded-lg border ${
                    kind === k
                      ? "border-ads-accent bg-ads-accent/10 text-ads-accent-light"
                      : "border-ads-border text-ads-muted hover:bg-ads-hover"
                  }`}
                >
                  {k === "月額" ? "月額契約" : "時給契約"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={label}>
                  稼働時間の下限（時間）{hourly && optional}
                  {badge}
                </span>
                <input
                  value={lo}
                  onChange={(e) => setLo(e.target.value)}
                  inputMode="numeric"
                  placeholder={hourly ? "空欄でよい" : ""}
                  className={field}
                />
              </label>
              <label>
                <span className={label}>
                  稼働時間の上限（時間）{hourly && optional}
                  {badge}
                </span>
                <input
                  value={hi}
                  onChange={(e) => setHi(e.target.value)}
                  inputMode="numeric"
                  placeholder={hourly ? "空欄でよい" : ""}
                  className={field}
                />
              </label>
            </div>

            {hourly ? (
              <>
                <p className="mt-2 text-[10px] text-ads-muted">
                  🔴 下限・上限は<span className="font-bold text-slate-700">どちらも空でかまいません</span>
                  。空にすると範囲の判定をしません。
                  <br />
                  「月150時間は超えたくない」のように、<span className="font-bold text-slate-700">
                    片方だけ
                  </span>
                  入れることもできます。
                </p>

                <label className="block mt-3">
                  <span className={label}>時給（円／時）{badge}</span>
                  <input
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    inputMode="numeric"
                    className={field}
                  />
                </label>
                <p className="mt-1 text-[10px] text-ads-muted">
                  見込み金額は<span className="font-bold text-slate-700">精算時間 × 時給</span>
                  で計算します（1円未満は切り捨て）。
                  入れるまでは金額を出しません（C-6 が知らせます）。
                </p>
              </>
            ) : (
              <>
                <label className="block mt-3">
                  <span className={label}>月額の基本単価（円）{badge}</span>
                  <input
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    inputMode="numeric"
                    className={field}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <label>
                    <span className={label}>控除単価（円／時）{badge}</span>
                    <input
                      value={underRate}
                      onChange={(e) => setUnderRate(e.target.value)}
                      inputMode="numeric"
                      className={field}
                    />
                  </label>
                  <label>
                    <span className={label}>超過単価（円／時）{badge}</span>
                    <input
                      value={overRate}
                      onChange={(e) => setOverRate(e.target.value)}
                      inputMode="numeric"
                      className={field}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={fillRates}
                  className="mt-2 text-[11px] font-bold text-ads-accent-light hover:text-ads-accent flex items-center gap-1"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  単価から控除・超過を自動計算（月額 ÷ 下限／上限・端数は切り捨て）
                </button>
                <p className="mt-1 text-[10px] text-ads-muted">
                  あくまで補助です。契約書に別の単価が書かれていれば、手で上書きしてください。
                </p>
              </>
            )}
          </div>

          <div className="border-t border-ads-border pt-4">
            <label className="block w-40">
              <span className={label}>基準労働時間（1日）{badge}</span>
              {/* 🔴 時計マークをほかの時刻欄とそろえる（TimeInput 参照） */}
              <TimeInput value={baseWork} onChange={setBaseWork} className={`${field} text-left`} />
            </label>
            <p className="mt-1 text-[10px] text-ads-muted">
              残業時間の計算基準です。案件ごと・月ごとに持ちます。新しい月は前の月から引き継ぎます。
            </p>
          </div>

          {/*
            B-3 先の月にも反映する（2026-09-15）。

            🔴 並べるのは、この月より後ろで、勤務や設定を入れたことがある月だけ。前の月は出さない。
               前の月の設定が変わると、提出済みの金額が後から変わる（03_業務ロジック設計 §7.4）。
            🔴 チェックは最初からすべて付いている。別の設定にしてある月だけ外す。
            📌 何も入れていない月は出さない。前の月の設定を借りて表示するので、何もしなくてよい。

            📌 文面は段木さんと決めた（案A）。
               「保存」「ここ」のような言葉は使わない（月ごとの保存ボタンは無く、伝わらなかった）。
               下の1行は、開いた月と並ぶ月から carryNote が作る。年は違う年のときだけ付ける。
          */}
          {laterMonths.length > 0 && (
            <div className="border-t border-ads-border pt-4" data-testid="carry-months">
              <p className="text-[11px] font-bold text-slate-900 mb-2">
                先の月にも反映する
                <span className="font-normal text-ads-muted">（勤務や設定を入れたことがある月）</span>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {laterMonths.map((m) => {
                  const key = ymKey(m.year, m.month);
                  return (
                    <label key={key} className="flex items-center gap-1.5 text-xs text-slate-900">
                      <input
                        type="checkbox"
                        checked={carry.has(key)}
                        onChange={() => toggleCarry(key)}
                        className="accent-ads-accent"
                      />
                      {monthLabel(m, { year, month })}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-ads-muted" data-testid="carry-note">
                {carryNote({ year, month }, laterMonths)}
              </p>
            </div>
          )}

          {/*
            D-3 F-10 の任意化。APIキーが無い環境では月間一覧にAIのボタンを出さないので、
            ここに1行だけ理由を置く。何も出さないと「機能が足りない」と誤解される。
          */}
          {!aiEnabled && (
            <div className="border-t border-ads-border pt-3" data-testid="ai-disabled">
              <p className="text-xs font-bold text-ads-muted">AIアシスタント</p>
              <p className="text-[11px] text-ads-dim mt-0.5">
                未設定です。環境変数 <span className="num">ANTHROPIC_API_KEY</span>{" "}
                を設定すると、月間一覧にAIのボタンが出ます。設定しなくても、ほかの機能はすべて使えます。
              </p>
            </div>
          )}

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>

        <div className="px-5 py-3 bg-ads-surface border-t border-ads-border flex items-center gap-3">
          {/* 🔴 バージョンはここにしか出さない。番号の正は package.json（src/lib/version.ts） */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-ads-dim">Enter で保存 ／ Esc で閉じる</span>
            <span className="text-[11px] text-ads-dim num" data-testid="app-version">
              AutoPunch {formatAppVersion()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-sm font-bold text-ads-muted hover:text-slate-900 px-4 py-2"
          >
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="bg-ads-accent hover:bg-ads-accent-light disabled:bg-ads-dim text-white text-sm font-bold px-5 py-2 rounded-lg"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
