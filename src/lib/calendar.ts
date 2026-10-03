// ===================================================================
// 暦まわり（月の日数・曜日）
// ===================================================================

/** その月の日数。new Date(y, m, 0) は「m月の0日」＝前月末なので末日が取れる */
export function daysIn(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 曜日1文字（日月火水木金土） */
export function dowOf(year: number, month: number, day: number): string {
  return "日月火水木金土"[new Date(year, month - 1, day).getDay()];
}

/** 土日か */
export function isWeekend(year: number, month: number, day: number): boolean {
  const dow = dowOf(year, month, day);
  return dow === "土" || dow === "日";
}

/** 'YYYY-MM' 形式のキー。URL（/api/projects/1/months/2026-08）にも使う */
export function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 'YYYY-MM' を年と月に分ける。形が違えば null */
export function parseYm(ym: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  // 年0〜99 は Date が1900年代と解釈し、暦の計算が根拠のない値になる
  if (year < 2000 || year > 2100) return null;
  return { year, month };
}

/** 前月・翌月へ移動する（年をまたぐ処理込み） */
export function shiftMonth(year: number, month: number, diff: number) {
  let y = year;
  let m = month + diff;
  while (m > 12) {
    m -= 12;
    y++;
  }
  while (m < 1) {
    m += 12;
    y--;
  }
  return { year: y, month: m };
}
