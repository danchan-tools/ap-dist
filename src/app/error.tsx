"use client";

// ===================================================================
// 画面がエラーで開けなかったときに出すページ
//
// 画面（S-3・S-4）はサーバー側でDBを読むので、Neon が落ちていたり
// 環境変数が未設定だと、ページごと開けなくなる。
// そのままだと「Application error」とだけ出て、何が起きたか分からない。
//
// ⚠️ エラーの中身（error.message）は画面に出さない。
//    接続先やSQLが混ざることがあるため。
//
// 🆕 D-7（2026-10-02）：月間一覧と出力画面は、読み込みの失敗を自分で受け止めて番号を出す（LoadFailed）。
//    ここに来るのは、それ以外の想定していない失敗だけなので E-999 を出す。
//    Next.js が付ける digest を問い合わせ番号にする。サーバーのログにも同じ digest が出る。
// ===================================================================

import { AlertTriangle, RotateCw } from "lucide-react";
import { withCode } from "@/lib/errors";
import { formatAppVersion } from "@/lib/version";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6" />
      </span>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{withCode("画面を開けませんでした", "E-999", error.digest)}</h1>
        <p className="mt-2 text-sm text-ads-muted leading-relaxed">少し待ってから、もう一度お試しください。</p>
      </div>
      <button
        onClick={reset}
        className="bg-ads-accent hover:bg-ads-accent-light text-white text-sm font-bold px-5 py-2.5 rounded-lg flex items-center gap-2"
      >
        <RotateCw className="w-4 h-4" />
        開き直す
      </button>
      <p className="text-[11px] text-ads-dim">
        何度も出るときは、この番号と {formatAppVersion()} を書いて問い合わせてください（番号ごとの意味は ERRORS.md）
      </p>
    </main>
  );
}
