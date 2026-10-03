"use client";

// 画面下に1.8秒だけ出る短い通知（プロトタイプの toast と同じ）

import { useEffect } from "react";

export default function Toast({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 1800);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-bold px-4 py-2.5 rounded-lg shadow-lg"
    >
      {message}
    </div>
  );
}
