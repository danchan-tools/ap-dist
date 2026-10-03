// ===================================================================
// 時刻の変換（03_業務ロジック設計 §1）
//
// 内部では【分の整数】で持つ。'09:30' → 570
// 時刻のまま足し引きすると繰り下がりでミスが出るため。
// ===================================================================

/**
 * 'HH:MM' → 分。空・未入力・時:分 の形でないものは null
 *
 * 🔴 B-9（2026-10-02）：形を見ずに `split(":")` していたので、打っている途中の「2」で
 *    分の側が undefined になり、NaN を返していた（`Number.isNaN(undefined)` は false）。
 *    日付の画面の合計が「勤務 NaN:NaN」になったので、先に形を見る。
 */
const HM_RE = /^(\d{1,2}):(\d{2})$/;

export function toMin(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = HM_RE.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 分 → 'HH:MM'（2桁ゼロ埋め）。`<input type="time">` に入れる形 */
export function toHHMM(v: number | null | undefined): string {
  if (v == null) return "";
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/**
 * 分 → 'H:MM'（表示用）。null は「―」
 *
 * 負の分でも壊れないようにしてある（-7分 → "-0:07"）。
 * 本来 C-2 で弾かれるが、表示が壊れて原因が見えなくなるのを防ぐ保険。
 */
export function toHMM(v: number | null | undefined): string {
  if (v == null) return "―";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

/**
 * 打ち終わった終業の値を 'HH:MM' に整える。整えられなければそのまま返す。
 *
 * 終業は `<input type="time">` を使えない（24:00 以降を受け付けないため）ので、
 * 手入力になる。そのぶん打ちやすくする。
 *
 *   "9:30" → "09:30"　　"2600" → "26:00"
 */
export function normalizeEndTime(raw: string): string {
  const s = raw.trim();
  if (!s) return "";

  // "2600" のような4桁・"930" のような3桁を許す
  const digits = /^(\d{3,4})$/.exec(s);
  if (digits) {
    const v = digits[1].padStart(4, "0");
    return `${v.slice(0, 2)}:${v.slice(2)}`;
  }

  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (m) return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}`;

  return s;
}

/** 円の表示。¥600,000 */
export function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}
