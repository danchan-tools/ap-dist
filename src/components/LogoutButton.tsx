"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="flex items-center gap-1.5 text-xs font-bold text-ads-muted hover:text-slate-900 disabled:text-ads-dim"
    >
      <LogOut className="w-4 h-4" />
      ログアウト
    </button>
  );
}
