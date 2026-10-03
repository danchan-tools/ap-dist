// ===================================================================
// 画面（月間一覧・出力画面）を開けなかったときに出す（D-7・2026-10-02）
//
// 画面はサーバー側でデータベースを読むので、つながらない・環境変数が無い・表が古いと、ページごと開けない。
// 番号（E-201 など）と問い合わせ番号を出し、同じ番号でログにも1行書く（src/server/failure.ts）。
//
// 📌 ⚙設定が開けないので、バージョンもここに出す（問い合わせに書いてもらう）。
// 🔴 エラーの中身（接続先・SQL）は出さない。
// ===================================================================

import { AlertTriangle } from "lucide-react";
import { ERROR_CODES, withCode, type ErrorCode } from "@/lib/errors";
import { formatAppVersion } from "@/lib/version";

export default function LoadFailed({ code, inquiry }: { code: ErrorCode; inquiry: string }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6" />
      </span>
      <div>
        <h1 className="text-lg font-bold text-slate-900">{withCode("画面を開けませんでした", code, inquiry)}</h1>
        <p className="mt-2 text-sm text-ads-muted leading-relaxed">{ERROR_CODES[code]}</p>
      </div>
      <div className="text-xs text-ads-muted leading-relaxed">
        <div>番号ごとの意味と、やることは ERRORS.md にあります</div>
        <div>少し待ってから、ページを読み込み直してください（F5）</div>
        <div>
          問い合わせるときは、この番号と {formatAppVersion()} を書いてください
        </div>
      </div>
    </main>
  );
}
