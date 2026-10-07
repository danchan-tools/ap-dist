// ===================================================================
// 画面（月間一覧・出力画面）を開けなかったときに出す（D-7・2026-10-02）
//
// 画面はサーバー側でデータベースを読むので、つながらない・環境変数が無い・表が古いと、ページごと開けない。
// 番号（E-201 など）と問い合わせ番号を出し、同じ番号でログにも1行書く（src/server/failure.ts）。
//
// 📌 ⚙設定が開けないので、バージョンもここに出す（問い合わせに書いてもらう）。
// 🔴 エラーの中身（接続先・SQL）は出さない。
// 🆕 I-9（2026-10-07）：番号ごとの「やること」を、見出しつきの枠で出す。
//    E-203・E-204 は待っても直らないので、どの番号でも「少し待ってから F5」は出さない。
//    見た目は、段木さんが本物の画面で撮った3案から選んだ（枠の案）。
// ===================================================================

import { AlertTriangle } from "lucide-react";
import { ERROR_CODES, LOAD_FAILED_ACTIONS, LOAD_FAILED_FALLBACK, withCode, type ErrorCode } from "@/lib/errors";
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
      <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
        <div className="text-xs font-bold text-amber-800">やること</div>
        <div className="mt-1 text-sm text-slate-900 leading-relaxed">{LOAD_FAILED_ACTIONS[code] ?? LOAD_FAILED_FALLBACK}</div>
      </div>
      <div className="text-xs text-ads-muted leading-relaxed">
        <div>番号ごとの意味と、やることは ERRORS.md にあります</div>
        <div>
          問い合わせるときは、この番号と {formatAppVersion()} を書いてください
        </div>
      </div>
    </main>
  );
}
