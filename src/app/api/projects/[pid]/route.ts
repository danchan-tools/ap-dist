// ===================================================================
// 案件の改名・表示／非表示（拡張1・08_将来の拡張設計.md §2.7）
//
// 🔴 削除はできない。隠すだけ（§5）。
// ===================================================================

import { NextResponse, type NextRequest } from "next/server";
import { failure } from "@/server/failure";
import { updateProject } from "@/server/queries";
import { parseProjectName, PROJECT_NAME_LIMIT, requireProject } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/projects/[pid]">) {
  const { pid } = await ctx.params;
  const got = await requireProject(pid);
  if ("response" in got) return got.response;
  const { project } = got;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "入力を読み取れませんでした" }, { status: 400 });

  const patch: { name?: string; archived?: boolean } = {};

  if (body.name !== undefined) {
    const name = parseProjectName(body.name);
    if (!name) {
      return NextResponse.json(
        { error: `案件名を ${PROJECT_NAME_LIMIT} 文字以内で入力してください` },
        { status: 400 },
      );
    }
    patch.name = name;
  }

  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "表示・非表示の指定が正しくありません" }, { status: 400 });
    }
    patch.archived = body.archived;
  }

  if (patch.name === undefined && patch.archived === undefined) {
    return NextResponse.json({ error: "変更する内容がありません" }, { status: 400 });
  }

  try {
    const updated = await updateProject(project.id, patch);
    if (!updated) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
    return NextResponse.json({ project: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("projects_name_key")) {
      return NextResponse.json({ error: "同じ名前の案件があります" }, { status: 409 });
    }
    return failure("案件の変更", e, "案件を変更できませんでした");
  }
}
