"use client";

// ===================================================================
// 案件の切り替え（拡張1・08_将来の拡張設計.md §2.7・§2.8 #6）
//
// 🔴 画面は増やさない。ヘッダーの年月の左に置くプルダウン1つで、
//    切り替え・追加・改名・隠す/戻す をすべてまかなう。
//    ログイン後に「案件を選ぶ画面」を作る案もあったが、
//    毎回1回よけいに押すことになるので採らなかった（2026-08-07 段木さんの判断）。
//
// ⚠️ 設計書 §2.7 は「案件が1つのときはプルダウンを出さない」としていたが、
//    そのとおりにすると**2つ目の案件を作る場所が画面から消える**。
//    出しっぱなしにして、押したときだけ中身が開く形にした（2026-08-07）。
// ===================================================================

import { Archive, Check, ChevronDown, FolderOpen, Pencil, Plus, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import { send as request } from "@/lib/request";
import { monthHref, PROJECTS_API, projectApi } from "@/lib/urls";

/**
 * 一覧の1行（選ぶ・名前を変える・隠す）。
 *
 * 🔴 ここは必ず `ProjectPicker` の外に置く（2026-08-29・B-1）。
 *
 *    中に置くと、親が描き直されるたびに「別のコンポーネント」として作られ、
 *    React が中身をまるごと作り直す。
 *    そのとき入力欄も破棄されるので、**日本語入力の変換中の状態が消える**。
 *    「トラント」と打とうとすると `ｔｏｒａｎｔｏ` になっていた。
 *
 *    経緯: docs/md/90_不具合と改善/90_不具合と改善の履歴.md の B-1
 *    再発は scripts/check-nested-components.mjs が止める。
 */
function ProjectRow({
  p,
  selected,
  editing,
  draft,
  busy,
  canArchive,
  onSelect,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onToggleArchive,
}: {
  p: Project;
  selected: boolean;
  editing: boolean;
  draft: string;
  busy: boolean;
  canArchive: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleArchive: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // 🔴 変換中の Enter は「変換の確定」なので、名前の保存に使わない。
            //    見ないと「かようび」を確定した瞬間に保存される（B-1 と同じ根）
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
          className="flex-1 min-w-0 bg-white border border-ads-accent rounded px-2 py-1 text-xs text-slate-900"
        />
        <button
          onClick={onCommitRename}
          disabled={busy}
          aria-label="名前を保存"
          className="p-1 text-ads-accent hover:bg-ads-hover rounded"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded ${selected ? "bg-ads-accent/10" : "hover:bg-ads-hover"}`}
    >
      <button
        onClick={onSelect}
        className="flex-1 min-w-0 text-left text-xs font-bold text-slate-900 px-1 py-1 truncate"
      >
        {selected && <Check className="w-3 h-3 inline mr-1 text-ads-accent" />}
        {p.name}
      </button>
      <button
        onClick={onStartRename}
        aria-label={`${p.name} の名前を変える`}
        className="p-1 text-ads-dim hover:text-slate-900 rounded"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      {/* 🔴 消すボタンは作らない。過去の勤務表が消えるため、隠すだけ（§5） */}
      <button
        onClick={onToggleArchive}
        disabled={busy || !canArchive}
        aria-label={p.archived ? `${p.name} を戻す` : `${p.name} を隠す`}
        title={
          !canArchive
            ? "最後の1件は隠せません"
            : p.archived
              ? "一覧に戻す"
              : "終わった案件として隠す"
        }
        className="p-1 text-ads-dim hover:text-slate-900 disabled:text-ads-border rounded"
      >
        {p.archived ? <Undo2 className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function ProjectPicker({
  projects,
  current,
  year,
  month,
}: {
  projects: Project[];
  current: Project;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** 改名中の案件。null なら改名していない */
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // 外を押したら閉じる。
  // 📌 スクロールでは閉じない。中の一覧をスクロールしただけで閉じてしまうため
  //    （2026-08-06 に別のプルダウンで踏んだ落とし穴）
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const live = projects.filter((p) => !p.archived);
  const hidden = projects.filter((p) => p.archived);

  function go(id: number) {
    setOpen(false);
    // 🔴 月はそのまま持ち越す。案件を変えても「見ている月」は変えない
    router.push(monthHref(id, year, month));
    router.refresh();
  }

  async function send(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError("");
    const sent = await request(
      url,
      { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      "うまくいきませんでした",
    );
    setBusy(false);
    if (!sent.ok) {
      setError(sent.message); // 番号つき（D-7）
      return false;
    }
    return true;
  }

  async function add() {
    const name = window.prompt("案件の名前を入力してください");
    if (name == null) return;
    if (!(await send(PROJECTS_API, "POST", { name }))) return;
    setOpen(false);
    router.refresh();
  }

  async function rename(id: number) {
    if (!draft.trim()) return setError("案件名を入力してください");
    if (!(await send(projectApi(id), "PATCH", { name: draft }))) return;
    setEditing(null);
    router.refresh();
  }

  async function setArchived(id: number, archived: boolean) {
    if (!(await send(projectApi(id), "PATCH", { archived }))) return;
    router.refresh();
    // いま開いている案件を隠したときは、残っている案件へ移る
    if (archived && id === current.id) {
      const next = live.find((p) => p.id !== id);
      if (next) go(next.id);
    }
  }

  /** 1行ぶんの受け渡し。中身は ProjectRow（このファイルの先頭）にある */
  function rowProps(p: Project) {
    return {
      p,
      selected: p.id === current.id,
      editing: editing === p.id,
      draft,
      busy,
      canArchive: p.archived || live.length > 1,
      onSelect: () => go(p.id),
      onStartRename: () => {
        setEditing(p.id);
        setDraft(p.name);
        setError("");
      },
      onDraftChange: setDraft,
      onCommitRename: () => void rename(p.id),
      onCancelRename: () => setEditing(null),
      onToggleArchive: () => void setArchived(p.id, !p.archived),
    };
  }

  return (
    <div ref={boxRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 max-w-40 text-sm font-bold text-slate-900 px-2 py-1.5 rounded-lg hover:bg-ads-hover"
      >
        <FolderOpen className="w-4 h-4 text-ads-muted flex-shrink-0" />
        <span className="truncate">{current.name}</span>
        {/* 🔴 ads-dim(#94a3b8) では薄くて「押せる」と気づけない（2026-08-08）。
            MonthPicker の ▾ と同じ役割なので、色もそろえる */}
        <ChevronDown className="w-3.5 h-3.5 text-ads-muted flex-shrink-0" />
      </button>

      {open && (
        // 🔴 fixed ではなく absolute でよい。
        //    ヘッダーは overflow-hidden ではないので、切り取られない
        //
        // ⚠️ ただし z-30 は【ヘッダーの中でしか効かない】（2026-08-07）。
        //    外と比べるときは親（ヘッダー）の数字で比べられるので、
        //    ヘッダー側を StickyTotals より上（z-20）にしてある。
        //    ヘッダーの z を下げると、ここが合計バーの下に潜る。
        <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-ads-border rounded-xl shadow-lg p-1.5 z-30">
          {live.map((p) => (
            <ProjectRow key={p.id} {...rowProps(p)} />
          ))}

          {hidden.length > 0 && (
            <>
              <div className="mt-1 px-2 pt-1.5 border-t border-ads-border text-[10px] font-bold text-ads-dim">
                終わった案件
              </div>
              {hidden.map((p) => (
                <ProjectRow key={p.id} {...rowProps(p)} />
              ))}
            </>
          )}

          {error && <p className="px-2 py-1 text-[11px] font-bold text-rose-600">{error}</p>}

          <button
            onClick={() => void add()}
            disabled={busy}
            className="mt-1 w-full flex items-center gap-1.5 text-xs font-bold text-ads-accent-light hover:bg-ads-hover rounded px-2 py-1.5 border-t border-ads-border pt-2"
          >
            <Plus className="w-3.5 h-3.5" />
            案件を追加する
          </button>
        </div>
      )}
    </div>
  );
}
