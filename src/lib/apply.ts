// ===================================================================
// 基本パターンの一括反映（03_業務ロジック設計 §4）
//
//   土曜・日曜 → 区分「休日」（時刻は空）
//   祝日       → 区分「祝日」（備考に祝日名）
//   それ以外   → 区分「勤務」＋ 基本パターンの値
//
// ⚠️ すべて上書きする。すでに直した日も戻る。
//    押す前に確認ダイアログを出すのは画面側の仕事。
// ===================================================================

import { daysIn, isWeekend } from "./calendar";
import { holidayOf } from "./holidays";
import type { Day, DayMap, Pattern } from "./types";

/** 勤務日の作業内容の初期値（§4） */
export const DEFAULT_NOTE = "通常業務";

/**
 * その日が「働かない日」なら区分を返す。平日なら null。
 *
 * 🔴 土日と祝日の判定は、この関数だけが持つ。
 *    一括反映（`expandPattern`）と読み込み時の補完（`fillOffDays`）の
 *    両方がここを呼ぶ。**同じ判定を2か所に書くと、直し忘れる場所が2つできる。**
 *
 * 📌 土日が祝日より先。2028-01-01（元日・土曜）は「休日」になる。
 *    どちらも働かない日なので計算は変わらないが、**表の見た目が変わる。**
 */
export function offDayOf(year: number, month: number, day: number): Day | null {
  if (isWeekend(year, month, day)) return { kind: "休日" };

  const holiday = holidayOf(year, month, day);
  if (holiday) return { kind: "祝日", note: holiday };

  return null;
}

export function expandPattern(year: number, month: number, pattern: Pattern): DayMap {
  const days: DayMap = {};

  for (let d = 1; d <= daysIn(year, month); d++) {
    days[d] = offDayOf(year, month, d) ?? {
      kind: "勤務",
      startAt: pattern.start,
      endAt: pattern.end,
      breakAt: pattern.brk,
      place: pattern.place,
      note: DEFAULT_NOTE,
    };
  }

  return days;
}

/**
 * まだ記録が無い日に、土日・祝日だけを補う（2026-08-08 追加）。
 *
 * **「営業日すべてに反映する」を押していなくても、土日と祝日は入っている**
 * ようにするためのもの。段木さんの要望（毎月の手間を減らす）。
 *
 * 🔴 保存はしない。**読むときに補うだけ。**
 *    「月を開くだけでは書き込まない」という決めごと（2026-08-05）を守るため。
 *    書き込む形にすると、未来の月を覗いただけで契約条件が固定される。
 *
 * 🔴 すでに記録がある日には絶対に触らない。
 *    利用者が土曜を「勤務」に直していたら、それがそのまま残る。
 *
 * 📌 平日は埋めない。**基本パターンを入れるのは利用者の操作**だから（F-2）。
 *    ここで勤務まで埋めると、押していないのに勤務表ができてしまう。
 *
 * ⚠️ 祝日表を持っていない年は、祝日が埋まらない（C-5 が警告する）。
 */
export function fillOffDays(year: number, month: number, days: DayMap): DayMap {
  const out: DayMap = { ...days };

  for (let d = 1; d <= daysIn(year, month); d++) {
    if (out[d]) continue; // 🔴 記録がある日は触らない
    const off = offDayOf(year, month, d);
    // 🔴 `auto` を必ず付ける。これが「利用者が入れた日」との唯一の見分け方
    if (off) out[d] = { ...off, auto: true };
  }

  return out;
}

/**
 * DB へ渡す直前の整形。
 *
 * 🔴 区分が「勤務」以外のときは、時刻と場所をすべて null に落とす。
 *    画面の作業場所は `<select>` なので、無効化しても値が残る。
 *    そのまま送ると days_work_has_times 制約に弾かれる（02_データ設計 §5.3）。
 */
export function toDbRow(day: {
  kind: string;
  startAt?: string | null;
  endAt?: string | null;
  breakAt?: string | null;
  place?: string | null;
  note?: string | null;
}) {
  const isWork = day.kind === "勤務";
  return {
    kind: day.kind,
    startAt: isWork ? (day.startAt || null) : null,
    endAt: isWork ? (day.endAt || null) : null,
    breakAt: isWork ? (day.breakAt || null) : null,
    place: isWork ? (day.place || null) : null,
    note: day.note || null,
  };
}
