"use client";

// ===================================================================
// S-1 ログインの入力部分（mockups/01_ログイン.html をそのまま起こしたもの）
//
//   Enter で送信
//   押している間は「確認中…」
//   失敗したら入力欄の下に赤字
// ===================================================================

import { Eye, EyeOff, Loader2, Lock, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { failureText } from "@/lib/request";
import { withCode } from "@/lib/errors";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return; // 画面が切り替わるので busy は戻さない
      }
      setError(await failureText(res, "ログインできませんでした")); // 番号つき（D-7）
    } catch {
      setError(withCode("通信できませんでした。ネットワークを確認してください", "E-901"));
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white border border-ads-border rounded-2xl p-6 shadow-sm"
    >
      <label htmlFor="password" className="block text-xs font-bold text-ads-muted mb-2">
        パスワード
      </label>

      <div className="relative">
        <input
          id="password"
          type={visible ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="w-full bg-ads-surface border border-ads-border rounded-lg pl-10 pr-10 py-3 text-sm text-slate-900 focus:outline-none focus:border-ads-accent"
        />
        <Lock className="w-4 h-4 text-ads-dim absolute left-3.5 top-1/2 -translate-y-1/2" />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "パスワードを隠す" : "パスワードを表示する"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ads-dim hover:text-slate-600"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-ads-accent hover:bg-ads-accent-light disabled:bg-ads-dim text-white text-sm font-bold py-3 rounded-lg mt-4 flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            確認中…
          </>
        ) : (
          <>
            <LogIn className="w-4 h-4" />
            ログイン
          </>
        )}
      </button>

      <div className="mt-5 pt-5 border-t border-ads-border flex items-start gap-2">
        <span className="text-ads-dim flex-shrink-0 mt-0.5">ℹ</span>
        <p className="text-[11px] text-ads-muted leading-relaxed">
          使うのは自分1人なので、IDは作りません。
          <span className="font-bold text-slate-700">パスワード1つだけの鍵</span>です。
        </p>
      </div>
    </form>
  );
}
