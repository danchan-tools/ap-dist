// ===================================================================
// 契約条件を、先の月にも反映する（B-3・2026-09-15）
//
// ⚙契約条件で保存するとき、同じ案件の「この月より後ろで、勤務や設定を入れたことがある月」を
// チェックで選び、同じ設定を書き込む（90_不具合と改善の履歴.md B-3）。
//
// 🔴 前の月には書かない。前の月の設定が変わると、提出済みの金額が後から変わる
//    （03_業務ロジック設計 §7.4）。
//    画面は後ろの月しか出さないが、API に届いた値はここで必ず確かめる。
// ===================================================================

import { parseYm, shiftMonth, ymKey } from "./calendar";

export type YearMonth = { year: number; month: number };

/**
 * 年月を1つの数にする。2025年12月 ＝ 24312、2026年1月 ＝ 24313。
 * 年をまたいでも大小がそのまま正しく並ぶ（02_データ設計 §5.1 の SQL と同じ式）。
 */
export function monthIndex(ym: YearMonth): number {
  return ym.year * 12 + ym.month;
}

/**
 * 画面に出す名前。基準と同じ年なら「10月」、年が変われば「2027年1月」。
 *
 * 📌 年は「開いた月と違う年のときだけ」付ける（2026-09-15 段木さんの判断・案A）。
 *    全部に付けると長くなる。画面の上に「2026年9月」と出ているので、年が無い月はその年と読める。
 */
export function monthLabel(ym: YearMonth, base: YearMonth): string {
  return ym.year === base.year ? `${ym.month}月` : `${ym.year}年${ym.month}月`;
}

/**
 * ⚙契約条件の「先の月にも反映する」の下に出す1行（2026-09-15 段木さんの判断・案A）。
 *
 *   例）2026年9月を開き、10月・11月が並ぶとき
 *       「12月から先は11月と同じ設定、8月から前は変わりません。」
 *
 * 📌 「ここ」「この設定」のような言葉を使わず、実際の月名を入れる（段木さんの指摘）。
 *    開いた月と並ぶ月から毎回作るので、どの月で開いても月名が合う。
 *
 * 🔴 「12月から先は11月と同じ設定」と書く。「新しい設定になります」とは書かない。
 *    11月のチェックを外すと、12月から先は11月の古い設定のままになる。
 *    「11月と同じ」なら、チェックを付けても外しても事実と合う。
 *
 * 並ぶ月が無いときは空文字（欄そのものを出さないので、使われない）。
 */
export function carryNote(current: YearMonth, later: YearMonth[]): string {
  if (later.length === 0) return "";
  const last = later.reduce((a, b) => (monthIndex(b) > monthIndex(a) ? b : a));
  const after = shiftMonth(last.year, last.month, 1);
  const before = shiftMonth(current.year, current.month, -1);
  return (
    `${monthLabel(after, current)}から先は${monthLabel(last, current)}と同じ設定、` +
    `${monthLabel(before, current)}から前は変わりません。`
  );
}

/** 反映先として一度に受け付ける月の数（10年分）。これを超える配列は弾く */
export const MAX_CARRY_MONTHS = 120;

export type CarryTargets = { ok: true; months: YearMonth[] } | { ok: false };

/**
 * API に届いた「反映先の月」（'YYYY-MM' の配列）を読む。
 *
 *   ok: true  … 反映先。重複を除き、古い順に並べる。空配列は「この月だけ」
 *   ok: false … 形が違う／この月以前が混ざっている → 400 を返す
 *
 * 🔴 この月と同じ月・前の月が1つでも混ざっていたら、黙って捨てずに【全体を弾く】。
 *    画面は後ろの月しか出さないので、混ざるのは作りの誤り。
 *    捨てて保存を通すと、誤りに誰も気づけない。
 *
 * 📌 送られてこない（undefined・null）ときは「この月だけ」として扱う。
 *    反映の欄が無い古い画面を開いたまま保存しても、いままでどおり動くようにするため。
 */
export function parseCarryTargets(raw: unknown, current: YearMonth): CarryTargets {
  if (raw === undefined || raw === null) return { ok: true, months: [] };
  if (!Array.isArray(raw) || raw.length > MAX_CARRY_MONTHS) return { ok: false };

  const unique = new Map<string, YearMonth>();
  for (const v of raw) {
    if (typeof v !== "string") return { ok: false };
    const ym = parseYm(v);
    if (!ym) return { ok: false };
    if (monthIndex(ym) <= monthIndex(current)) return { ok: false };
    unique.set(ymKey(ym.year, ym.month), ym);
  }

  const months = [...unique.values()].sort((a, b) => monthIndex(a) - monthIndex(b));
  return { ok: true, months };
}
