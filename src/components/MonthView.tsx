"use client";

// ===================================================================
// S-3 月間一覧（メイン画面）
//
// 計算は【すべてブラウザ側】で行う（01_要件定義/03_制約・非機能要件.md §6）。
// 保存のときだけサーバーに送る。
// こうすると「値を変えた瞬間に合計が変わる」体験になり、これが価値そのものになる。
// ===================================================================

import { ChevronLeft, ChevronRight, Clock, FileOutput, Lock, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import AssistButton from "@/components/AssistButton";
import AssistChat from "@/components/AssistChat";
import AssistWindow from "@/components/AssistWindow";
import CheckList from "@/components/CheckList";
import ContractModal from "@/components/ContractModal";
import DayModal from "@/components/DayModal";
import LogoutButton from "@/components/LogoutButton";
import MonthTable from "@/components/MonthTable";
import MoneyCard from "@/components/MoneyCard";
import MonthPicker from "@/components/MonthPicker";
import PatternPanel from "@/components/PatternPanel";
import ProjectPicker from "@/components/ProjectPicker";
import StickyTotals from "@/components/StickyTotals";
import SummaryCards from "@/components/SummaryCards";
import Toast from "@/components/Toast";
import { calcMonth, isEmptyMonth } from "@/lib/calc";
import { parseYm, shiftMonth, ymKey } from "@/lib/calendar";
import { monthLabel, type YearMonth } from "@/lib/carryOver";
import { hasBlockingError, runChecks } from "@/lib/checks";
import type { Contract, Day, MonthData, Pattern, Project } from "@/lib/types";
import { send } from "@/lib/request";
import { exportHref, monthApi, monthHref } from "@/lib/urls";

export default function MonthView({
  data,
  projects,
  laterMonths,
  aiEnabled,
}: {
  data: MonthData;
  /** 切り替え用。並び順つき（隠したものも含む） */
  projects: Project[];
  /** この月より後ろにある保存済みの月（B-3）。⚙契約条件の「先の月にも反映する」に並べる */
  laterMonths: YearMonth[];
  /**
   * F-10 を出してよいか（D-3）。`ANTHROPIC_API_KEY` が入っているかをサーバーで見た結果。
   *
   * 🔴 キーそのものは渡ってこない。渡すのは【入っているかどうか】だけ。
   */
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<number | null>(null); // 編集中の日
  const [settingsOpen, setSettingsOpen] = useState(false); // M-2 契約条件
  const [assistOpen, setAssistOpen] = useState(false); // W-1 AIアシスタント
  // 会話を作り直すための番号。増やすと AssistChat が新品になる（F-2 を押したとき）
  const [assistSeq, setAssistSeq] = useState(0);
  // サマリー4枚の位置。これが画面の上に消えたら、合計の1行バーを出す
  const summaryRef = useRef<HTMLDivElement>(null);

  const { projectId, projectName, year, month, days, contract, pattern, baseWorkMinutes } = data;
  // 🔴 基準労働時間は【この案件のこの月】の値（拡張1）。全期間で共通ではない
  const total = calcMonth(year, month, days, baseWorkMinutes);
  const noData = isEmptyMonth(days);

  // いま開いている案件。一覧に無いことは resolveProject が保証している
  const project = projects.find((p) => p.id === projectId) ?? {
    id: projectId,
    name: projectName,
    sortOrder: 0,
    archived: false,
  };

  // 値が変わるたびに、すべての観点を判定し直す（§6）
  // 📌 数は月によって変わる。月額は C-1〜C-5、時給契約は C-6 が加わる（拡張2）
  const checks = runChecks({
    year,
    month,
    days,
    contract,
    baseWorkMinutes,
  });
  const blocked = hasBlockingError(checks); // 🔴 があると出力できない
  const errorDays = new Set(checks.filter((c) => c.level === "error" && c.day).map((c) => c.day!));
  const warnDays = new Set(checks.filter((c) => c.level === "warn" && c.day).map((c) => c.day!));

  function goMonth(diff: number) {
    const next = shiftMonth(year, month, diff);
    // 🔴 月を動かしても案件は変えない
    startTransition(() => router.push(monthHref(projectId, next.year, next.month)));
  }

  async function applyPattern(p: Pattern) {
    const sent = await send(
      `${monthApi(projectId, year, month)}/apply`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pattern: p }) },
      "保存できませんでした",
    );
    if (!sent.ok) {
      setToast(sent.message); // 番号つき（D-7）
      return;
    }
    router.refresh(); // サーバー側で読み直して、表を最新にする
    // 一括反映は月をまるごと置き換える。AIとの会話は最初の状態に戻す（06 §2.5）
    setAssistSeq((n) => n + 1);
    setToast("営業日すべてに反映しました");
  }

  /** M-1 で保存する。うまくいけば null、だめならエラー文言を返す */
  async function saveDay(day: number, value: Day): Promise<string | null> {
    const sent = await send(
      `${monthApi(projectId, year, month)}/days/${day}`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) },
      "保存できませんでした",
    );
    if (!sent.ok) return sent.message;
    setEditing(null);
    router.refresh();
    setToast("保存しました");
    return null;
  }

  /**
   * M-1 で「この日をクリア」する（I-2・2026-08-29）。
   *
   * 🔴 空にするのではなく、その日の記録を消す。
   *    消したあとは `loadDays` が土日と祝日だけを補うので、
   *    平日は空欄・土日は「休日」・祝日は「祝日」＋祝日名に戻る。
   *    つまり「営業日すべてに反映する」を押す前の状態になる。
   */
  async function clearDay(day: number): Promise<string | null> {
    const sent = await send(`${monthApi(projectId, year, month)}/days/${day}`, { method: "DELETE" }, "消せませんでした");
    if (!sent.ok) return sent.message;
    setEditing(null);
    router.refresh();
    setToast(`${month}月${day}日 をクリアしました`);
    return null;
  }

  /**
   * M-2 で契約条件と基準労働時間を保存する（どちらも月ごと）。
   *
   * 🔴 B-3（2026-09-15）：`carryTo` の月にも同じ設定を書き込む。
   *    「〇月にも反映しました」は、頼んだ月ではなく API が実際に書き込んだ月で出す。
   */
  async function saveContract(c: Contract, bw: number, carryTo: YearMonth[]): Promise<string | null> {
    const sent = await send(`${monthApi(projectId, year, month)}/contract`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // 稼働時間は【時間】で送る。名前に単位を入れて、分との取り違えを防ぐ
      //
      // 🔴 未入力（null）を 0 に化けさせない（拡張2・08 §3.6）。
      //    `Math.round(null / 60)` は **0** になる。JavaScript が null を 0 として計算するため。
      //    0 で送ると DB の制約が弾き、「保存できませんでした」としか出ない。
      //    §3.3 ② の3層（API・型・計算）に対して、**ここが4層目**。
      body: JSON.stringify({
        kind: c.kind,
        loHours: c.lo === null ? null : Math.round(c.lo / 60),
        hiHours: c.hi === null ? null : Math.round(c.hi / 60),
        base: c.base,
        underRate: c.underRate,
        overRate: c.overRate,
        hourlyRate: c.hourlyRate,
        baseWorkMinutes: bw,
        carryTo: carryTo.map((m) => ymKey(m.year, m.month)),
      }),
    }, "保存できませんでした");
    if (!sent.ok) return sent.message;
    const done = (await sent.res.json().catch(() => ({}))) as { carried?: unknown };
    const carried = Array.isArray(done.carried)
      ? done.carried.flatMap((k) => {
          const ym = typeof k === "string" ? parseYm(k) : null;
          return ym ? [monthLabel(ym, { year, month })] : [];
        })
      : [];
    setSettingsOpen(false);
    router.refresh();
    setToast(
      carried.length > 0
        ? `${month}月の契約条件を保存しました（${carried.join("・")}にも反映）`
        : `${month}月の契約条件を保存しました`,
    );
    return null;
  }

  return (
    <>
      {/*
        🔴 z-20 にする理由（2026-08-07）。StickyTotals（z-10）より【上】に置く。

        z-index が付いた要素は、その中に「順位の世界」を1つ作る。
        中の子がいくら大きい数字でも、外と比べるときは【親の数字】で比べられる。

        ヘッダーが z-10 のままだと、中にある ProjectPicker のプルダウン（z-30）が
        ヘッダーの世界に閉じ込められ、同じ z-10 で DOM が【後ろ】の StickyTotals に負ける。
        → 案件を切り替えようとすると、プルダウンが合計バーの下に潜って読めなくなる。

        ⚠️ 数字を上げる先は StickyTotals ではなくヘッダー。
           合計バーはヘッダーの【下】に出るものなので、順位も下でよい。
      */}
      <header className="bg-white border-b border-ads-border px-5 h-14 flex items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Clock className="w-5 h-5 text-ads-accent" />
          <span className="font-black text-slate-900">AutoPunch</span>
        </div>

        <div className="flex items-center gap-1">
          {/* 🔴 案件の切り替えは、年月の【左】に置く（08 §2.7） */}
          <ProjectPicker projects={projects} current={project} year={year} month={month} />
          <button
            onClick={() => goMonth(-1)}
            aria-label="前の月"
            className="p-1.5 rounded-lg text-ads-muted hover:bg-ads-hover hover:text-slate-900"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {/* 🔴 押すと年月を選べる（2026-08-08）。‹ › だけだと遠い月へ行けない */}
          <MonthPicker projectId={projectId} year={year} month={month} />
          <button
            onClick={() => goMonth(1)}
            aria-label="次の月"
            className="p-1.5 rounded-lg text-ads-muted hover:bg-ads-hover hover:text-slate-900"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* 🔴 必須 があるあいだは出力させない（F-4）。矛盾したまま提出しないため */}
          {blocked ? (
            <span
              title="修正が必要な項目があるため出力できません"
              className="flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-200 px-4 py-2 rounded-lg cursor-not-allowed"
            >
              <Lock className="w-4 h-4" />
              出力へ
            </span>
          ) : (
            <Link
              href={exportHref(projectId, year, month)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-ads-accent hover:bg-ads-accent-light px-4 py-2 rounded-lg"
            >
              <FileOutput className="w-4 h-4" />
              出力へ
            </Link>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-ads-muted hover:text-slate-900"
          >
            <Settings2 className="w-4 h-4" />
            設定
          </button>
          <LogoutButton />
        </div>
      </header>

      {/* サマリーが画面から消えているあいだだけ、ヘッダーの下に合計を1行で残す */}
      <StickyTotals
        anchorRef={summaryRef}
        total={total}
        contract={contract}
        noData={noData}
      />

      <main
        className={`flex-1 px-5 py-5 flex flex-col gap-4 max-w-6xl w-full mx-auto ${pending ? "opacity-60" : ""}`}
      >
        <div ref={summaryRef}>
          <SummaryCards total={total} contract={contract} noData={noData} />
        </div>

        <MoneyCard
          total={total}
          contract={contract}
          noData={noData}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <PatternPanel pattern={pattern} hasDays={!noData} onApply={applyPattern} />

        <CheckList checks={checks} onPickDay={setEditing} />

        <MonthTable
          year={year}
          month={month}
          days={days}
          baseWorkMinutes={baseWorkMinutes}
          errorDays={errorDays}
          warnDays={warnDays}
          onPickDay={setEditing}
        />
      </main>

      {editing !== null && (
        <DayModal
          key={editing}
          year={year}
          month={month}
          day={editing}
          value={days[editing]}
          pattern={pattern}
          baseWorkMinutes={baseWorkMinutes}
          onClose={() => setEditing(null)}
          onSave={(v) => saveDay(editing, v)}
          onClear={() => clearDay(editing)}
        />
      )}

      {/*
        F-10 AIアシスタント。月間一覧（S-3）にだけ置く（06 §2.2）。
        ウィンドウを開いているあいだは W-0 を隠す。
      */}
      {aiEnabled && !assistOpen && <AssistButton onOpen={() => setAssistOpen(true)} />}
      {aiEnabled && assistOpen && (
        <AssistWindow year={year} month={month} onClose={() => setAssistOpen(false)}>
          {/*
            🔴 key に【案件と年月】を入れてある。
               どちらかを切り替えると中身が作り直され、会話が消える（06 §2.5）。
               8月の話のまま9月を直すと事故になるため。
               🔴 案件も同じ理由で入れる（拡張1・08 §2.5 ③）。
                  忘れると、案件Aの話をしていたAIが案件Bの日を書き換える提案を出す。
          */}
          <AssistChat
            key={`${projectId}-${ymKey(year, month)}-${assistSeq}`}
            projectId={projectId}
            ym={ymKey(year, month)}
            year={year}
            month={month}
            days={days}
            contract={contract}
            baseWorkMinutes={baseWorkMinutes}
            onApplied={(count) => {
              router.refresh();
              setToast(`${count}件を反映しました`);
            }}
          />
        </AssistWindow>
      )}

      {settingsOpen && (
        <ContractModal
          projectName={projectName}
          year={year}
          month={month}
          contract={contract}
          baseWorkMinutes={baseWorkMinutes}
          aiEnabled={aiEnabled}
          laterMonths={laterMonths}
          onClose={() => setSettingsOpen(false)}
          onSave={saveContract}
        />
      )}

      <Toast message={toast} onDone={() => setToast("")} />
    </>
  );
}
