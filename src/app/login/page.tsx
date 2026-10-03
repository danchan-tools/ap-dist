// ===================================================================
// S-1 ログイン（02_基本設計/01_画面遷移・ユーザーフロー.md）
// ===================================================================

import { Clock } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { SESSION_COOKIE, verifySessionValue } from "@/server/auth";

export default async function LoginPage() {
  // すでにログイン済みなら、ログイン画面を見せずに一覧へ送る
  const jar = await cookies();
  if (await verifySessionValue(jar.get(SESSION_COOKIE)?.value)) redirect("/");

  return (
    <main className="flex-1 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-ads-accent flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">AutoPunch</h1>
          <p className="text-sm text-ads-muted mt-2">勤務表を、月初の1回で終わらせる</p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
