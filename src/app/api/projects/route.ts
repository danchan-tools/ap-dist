// ===================================================================
// 案件の一覧・追加（拡張1・08_将来の拡張設計.md §2.6）
//
// 🔴 案件を消すAPIは作らない（§5）。
//    過去の勤務表が消えるため、隠す（archived）だけにする。
//    DB側も ON DELETE RESTRICT にしてある。
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { failure } from "@/server/failure";
import { createProject, loadProjects } from "@/server/queries";
import { parseProjectName, PROJECT_NAME_LIMIT } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ projects: await loadProjects() });
  } catch (e) {
    return failure("案件の一覧", e, "案件を読み込めませんでした");
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = parseProjectName(body?.name);
  if (!name) {
    return NextResponse.json(
      { error: `案件名を ${PROJECT_NAME_LIMIT} 文字以内で入力してください` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ project: await createProject(name) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // name に UNIQUE を付けてあるので、同じ名前は DB が弾く（文だけで直し方が分かるので番号は付けない）
    if (message.includes("projects_name_key")) {
      return NextResponse.json({ error: "同じ名前の案件があります" }, { status: 409 });
    }
    return failure("案件の追加", e, "案件を追加できませんでした");
  }
}
