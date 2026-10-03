// ===================================================================
// URL の組み立て（拡張1・08_将来の拡張設計.md §2.8）
//
// 拡張1で、画面もAPIも「どの案件か」を持つようになった。
// URL を直に書くと、案件を足し忘れた1か所だけが別の案件を見る。
// **URLを作るのはこのファイルだけ**にする（`src/lib/` に一本化する考え方と同じ）。
// ===================================================================

import { ymKey } from "./calendar";

/**
 * `?project=2` を読む。数字でなければ null（＝既定の案件を開く）。
 *
 * 📌 画面のファイル（page.tsx）に置かない。
 *    Next.js は決められた名前以外の export があると型検査で落ちる。
 */
export function parseProjectParam(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 月間一覧（S-3） */
export function monthHref(projectId: number, year: number, month: number): string {
  return `/?project=${projectId}&ym=${ymKey(year, month)}`;
}

/** 出力・コピー用（S-4） */
export function exportHref(projectId: number, year: number, month: number): string {
  return `/export?project=${projectId}&ym=${ymKey(year, month)}`;
}

/** 月まわりのAPI（apply／contract／days／assist の共通の頭） */
export function monthApi(projectId: number, year: number, month: number): string {
  return `/api/projects/${projectId}/months/${ymKey(year, month)}`;
}

/** Excel のダウンロード。months の下ではないが、案件の下には置く */
export function excelApi(projectId: number, year: number, month: number): string {
  return `/api/projects/${projectId}/excel/${ymKey(year, month)}`;
}

/** 案件そのもののAPI（一覧・追加は `/api/projects`、改名は `/api/projects/[pid]`） */
export const PROJECTS_API = "/api/projects";

export function projectApi(projectId: number): string {
  return `${PROJECTS_API}/${projectId}`;
}
