// ===================================================================
// API で毎回やる「案件の取り出し」（拡張1・08_将来の拡張設計.md §2.8）
//
// URL が /api/projects/[pid]/… になったので、
// どのAPIも最初に「その案件が本当にあるか」を確かめることになる。
// 6か所に同じコードを書くと、1か所だけ直し忘れる。
// ===================================================================

import { NextResponse } from "next/server";
import type { Project } from "@/lib/types";
import { failure } from "./failure";
import { findProject } from "./queries";

/**
 * URL の [pid] から案件を取り出す。見つからなければ null。
 *
 * 🔴 `Number(pid)` の結果を素通ししない。
 *    `"1.5"` や `"1e3"` は数値になってしまうので、整数かどうかまで見る。
 */
export async function projectFromParam(pid: string): Promise<Project | null> {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) return null;
  return findProject(id);
}

/**
 * 案件を取り出す。無ければ 404、読み込みに失敗したら番号つきの 500 を返す（D-7）。
 *
 * 🔴 読み込みの失敗を「案件が見つかりません」にしない。
 *    2026-10-01 まで、どの API も `projectFromParam(pid).catch(() => null)` と書いていた。
 *    データベースが止まっていても「案件が見つかりません」と出て、原因を取り違えた。
 *
 * 使い方：`const got = await requireProject(pid); if ("response" in got) return got.response;`
 */
export async function requireProject(pid: string): Promise<{ project: Project } | { response: NextResponse }> {
  try {
    const project = await projectFromParam(pid);
    if (!project) {
      return { response: NextResponse.json({ error: "案件が見つかりません" }, { status: 404 }) };
    }
    return { project };
  } catch (e) {
    return { response: failure("案件の読み込み", e, "案件を読み込めませんでした") };
  }
}

/**
 * 隠した案件（archived）は**読むだけ**にする（§2.8 #5）。
 *
 * 過去の勤務表を見返す用途があるので開けるようにするが、
 * 書き換えは止める。終わった案件を、あとから書き換える理由がない。
 */
export function isReadOnly(project: Project): boolean {
  return project.archived;
}

/** 案件名の長さの上限。プルダウンとExcelのファイル名に出るため */
export const PROJECT_NAME_LIMIT = 40;

/**
 * 案件名として使えるか確かめる。
 *
 * 🔴 前後の空白を落としてから見る。
 *    「 」だけの名前を許すと、プルダウンに何も出ない行ができる
 *    （DBの projects_name_not_blank と同じ条件）。
 *
 * 📌 ここに置いてあるのは、route.ts から export できないため。
 *    Next.js は Route Handler のファイルに決められた名前以外の export があると型検査で落ちる。
 */
export function parseProjectName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  if (!name || name.length > PROJECT_NAME_LIMIT) return null;
  return name;
}
