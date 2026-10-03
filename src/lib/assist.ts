// ===================================================================
// F-10 AIアシスタント：提案の検証と差分の組み立て
// （02_基本設計/06_AIアシスタント設計.md §9）
//
// 🔴 AIを信じない。
//    構造化出力は「形」を保証するが、「中身が正しいか」は保証しない。
//    存在しない日（2月31日）・範囲外の時刻（99:99）・勤務なのに時刻が空、
//    は普通に返ってくる。ここで全部ふるいにかける。
//
// 🔴 画面側とサーバー側の【両方】がこのファイルだけを見る。
//    同じ検証を2か所に書かない（CLAUDE.md「計算のルールは src/lib/ に一本化」）。
// ===================================================================

import { calcDay } from "./calc";
import { daysIn, dowOf } from "./calendar";
import { toDbRow } from "./apply";
import { END_TIME_RE, KINDS, PLACES, TIME_RE } from "./constants";
import { holidayOf } from "./holidays";
import { toHMM, toMin } from "./time";
import type { Day, DayKind, DayMap } from "./types";

// -------------------------------------------------------------------
// AIが返す形（§7.2 のスキーマと1対1）
// -------------------------------------------------------------------

/** 返し方は3つだけ。聞く／提案する／断る */
export type AssistKind = "ask" | "propose" | "reject";

/** AIが返す1日分（検証前。中身は信用しない） */
export type RawChange = {
  day: number;
  kind: string;
  startAt: string | null;
  endAt: string | null;
  breakAt: string | null;
  place: string | null;
  note: string | null;
  reason: string;
};

/** AIが返す全体（検証前） */
export type RawReply = {
  kind: AssistKind;
  message: string;
  options: string[];
  changes: RawChange[];
};

/** 会話。ブラウザのメモリにだけ持つ（DBに保存しない。§4.4） */
export type ChatTurn = { role: "user" | "assistant"; text: string };

/** 1回の依頼で送れる会話の長さ（§11）。5往復＝10件 */
export const HISTORY_LIMIT = 10;

/** 入力の長さの上限（§6.1） */
export const TEXT_LIMIT = 300;

// -------------------------------------------------------------------
// 検証したあとの形（画面と保存APIが使う）
// -------------------------------------------------------------------

/** 「終業 18:30 → 21:00」の1行 */
export type FieldDiff = { label: string; before: string; after: string };

export type AssistChange = {
  day: number;
  /** 曜日1文字。サーバー側で計算する（AIに数えさせない。§8.2） */
  dow: string;
  /** その日の完成形。`toDbRow()` を通してある（§4.3） */
  next: Day;
  /** 元の値と比べて、変わる項目だけ */
  diffs: FieldDiff[];
  /** 「8月4日は火曜日です」。なぜその日を選んだのか（§7.2） */
  reason: string;
  /** 🔴 C-2（終了≦開始／休憩が長すぎる）に当たる。反映させない（§9.1-9） */
  blocked: boolean;
  /** blocked のときの理由 */
  blockReason: string;
};

export type AssistReply = {
  kind: AssistKind;
  message: string;
  options: string[];
  changes: AssistChange[];
  /** 検証で捨てた件数。0件になった理由を画面に出すため（§10） */
  dropped: number;
};

// -------------------------------------------------------------------
// 検証（§9.1 の10項目）
// -------------------------------------------------------------------

const KIND_SET = new Set<string>(KINDS);
const PLACE_SET = new Set<string>(PLACES);

function label(v: string | null | undefined): string {
  return v ? v : "―";
}

/** 変わった項目だけを並べる。何も変わらなければ空配列 */
function diffOf(before: Day | undefined, after: Day): FieldDiff[] {
  const b = before ? toDbRow(before) : null;
  const out: FieldDiff[] = [];
  const push = (l: string, x: string | null | undefined, y: string | null | undefined) => {
    if ((x ?? null) !== (y ?? null)) out.push({ label: l, before: label(x), after: label(y) });
  };

  push("区分", b?.kind, after.kind);
  push("始業", b?.startAt, after.startAt);
  push("終業", b?.endAt, after.endAt);
  push("休憩", b?.breakAt, after.breakAt);
  push("場所", b?.place, after.place);
  push("備考", b?.note, after.note);
  return out;
}

/**
 * AIの提案をふるいにかける。§9.1 の10項目をこの順で見る。
 *
 * 📌 順番に意味がある。
 *    ⑦（勤務以外は時刻を null に落とす）を先にやってから④⑤（時刻の形）を見る。
 *    逆にすると「休日なのに終業が 99:99」が④で捨てられてしまい、
 *    本来なら直して通せる提案を落としてしまう。
 */
export function validateChanges(
  year: number,
  month: number,
  current: DayMap,
  raw: RawChange[],
  baseWorkMinutes: number,
): { changes: AssistChange[]; dropped: number } {
  const last = daysIn(year, month);
  const seen = new Set<number>();
  const changes: AssistChange[] = [];
  let dropped = 0;

  for (const r of raw) {
    // ① その月に存在する日か
    if (!Number.isInteger(r.day) || r.day < 1 || r.day > last) {
      dropped++;
      continue;
    }
    // ② 同じ日が2件ないか（後の1件を捨てる）
    if (seen.has(r.day)) {
      dropped++;
      continue;
    }
    // ③ 区分が4つのどれかか
    if (typeof r.kind !== "string" || !KIND_SET.has(r.kind)) {
      dropped++;
      continue;
    }

    const kind = r.kind as DayKind;
    const note = typeof r.note === "string" ? r.note.trim() || null : null;

    // ⑦ 勤務以外は時刻と場所を null に落とす（直して通す）
    if (kind !== "勤務") {
      // toDbRow() は kind を string で返す（DBに渡す形）。区分は③で確かめてあるので付け直す
      const next: Day = { ...toDbRow({ kind, note }), kind };
      const diffs = diffOf(current[r.day], next);
      // ⑩ 何も変わらないなら捨てる
      if (diffs.length === 0) {
        dropped++;
        continue;
      }
      seen.add(r.day);
      changes.push({
        day: r.day,
        dow: dowOf(year, month, r.day),
        next,
        diffs,
        reason: typeof r.reason === "string" ? r.reason : "",
        blocked: false,
        blockReason: "",
      });
      continue;
    }

    // ④ 始業・休憩は 00:00〜24:59
    const startAt = typeof r.startAt === "string" ? r.startAt : null;
    const breakAt = typeof r.breakAt === "string" && r.breakAt !== "" ? r.breakAt : null;
    if (startAt !== null && !TIME_RE.test(startAt)) {
      dropped++;
      continue;
    }
    if (breakAt !== null && !TIME_RE.test(breakAt)) {
      dropped++;
      continue;
    }
    // ⑤ 終業は 00:00〜29:59（夜勤の 26:00 を許す）
    const endAt = typeof r.endAt === "string" ? r.endAt : null;
    if (endAt !== null && !END_TIME_RE.test(endAt)) {
      dropped++;
      continue;
    }
    // ⑥ 勤務なら始業・終業が両方そろっているか（DBの days_work_has_times 制約）
    if (!startAt || !endAt) {
      dropped++;
      continue;
    }
    // ⑧ 場所が 在宅／客先／その他 でなければ null にして通す
    const place = typeof r.place === "string" && PLACE_SET.has(r.place) ? r.place : null;

    const next: Day = { ...toDbRow({ kind, startAt, endAt, breakAt, place, note }), kind };
    const diffs = diffOf(current[r.day], next);
    // ⑩ 何も変わらないなら捨てる
    if (diffs.length === 0) {
      dropped++;
      continue;
    }

    // ⑨ C-2 に当たるか。捨てずに「反映できない」印を付けて見せる
    const c = calcDay(next, baseWorkMinutes);
    // 「終了≦開始」と「休憩が長すぎる」を分ける。文字列比較ではなく分で比べる
    const backwards = c.error && (toMin(next.endAt) ?? 0) <= (toMin(next.startAt) ?? 0);
    seen.add(r.day);
    changes.push({
      day: r.day,
      dow: dowOf(year, month, r.day),
      next,
      diffs,
      reason: typeof r.reason === "string" ? r.reason : "",
      blocked: c.error,
      blockReason: c.error
        ? backwards
          ? "終了が開始より前になっています"
          : "休憩が勤務の時間を超えています"
        : "",
    });
  }

  return { changes, dropped };
}

/**
 * AIの返事まるごとを検証する。
 *
 * `kind` ごとの決めごと（§7.2）も、ここで形にそろえる。
 *   ask     … changes は空。options に2〜4件
 *   propose … options は空。changes に1件以上（0件になったら reject 扱い）
 *   reject  … どちらも空
 */
export function validateReply(
  year: number,
  month: number,
  current: DayMap,
  raw: RawReply,
  baseWorkMinutes: number,
): AssistReply {
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const options = Array.isArray(raw.options)
    ? raw.options.filter((o): o is string => typeof o === "string" && o.trim() !== "").slice(0, 4)
    : [];

  if (raw.kind === "ask") {
    return { kind: "ask", message, options, changes: [], dropped: 0 };
  }
  if (raw.kind === "reject") {
    return { kind: "reject", message, options: [], changes: [], dropped: 0 };
  }

  const { changes, dropped } = validateChanges(
    year,
    month,
    current,
    Array.isArray(raw.changes) ? raw.changes : [],
    baseWorkMinutes,
  );

  // 全部ふるい落とされたら「提案」ではなく「できませんでした」として返す（§10）
  if (changes.length === 0) {
    return {
      kind: "reject",
      message: "直せる内容が見つかりませんでした。日付や時刻を書き足して、もう一度お試しください。",
      options: [],
      changes: [],
      dropped,
    };
  }

  return { kind: "propose", message, options: [], changes, dropped };
}

// -------------------------------------------------------------------
// AIに渡すデータを組み立てる（§8.2）
// -------------------------------------------------------------------

/**
 * その月の一覧を「1日1行のテキスト」にする。
 *
 * 🔴 引数に `Contract` 型を取らない。
 *    単価・見込み金額・契約時間を **渡せない形** にしておく
 *    （01_要件定義/03_制約・非機能要件.md §2.3）。
 *    注意書きではなく、関数の形で塞ぐ。
 *
 * 🔴 曜日はここで計算して書く。AIに曜日を数えさせない。
 *    「火曜は21時まで」の火曜がどの日かは、一覧を渡せば計算の必要がなくなる。
 */
export function buildAssistInput(params: {
  year: number;
  month: number;
  days: DayMap;
  baseWorkMinutes: number;
  /** 「今週」を判定するための今日。'YYYY-MM-DD' */
  today: string;
}): string {
  const { year, month, days, baseWorkMinutes, today } = params;
  const last = daysIn(year, month);
  const lines: string[] = [];

  lines.push(`対象：${year}年${month}月（${last}日）／今日：${today}`);
  lines.push(`基準労働時間：${toHMM(baseWorkMinutes)}`);
  lines.push("");

  for (let d = 1; d <= last; d++) {
    const dow = dowOf(year, month, d);
    const day = days[d];
    const head = `${d}(${dow})`;

    if (!day) {
      const holiday = holidayOf(year, month, d);
      lines.push(`${head} 未設定${holiday ? ` ※${holiday}` : ""}`);
      continue;
    }
    if (day.kind === "勤務") {
      const parts = [
        `${day.startAt ?? "―"}-${day.endAt ?? "―"}`,
        `休憩${day.breakAt ?? "―"}`,
        day.place ?? "",
        day.note ?? "",
      ].filter((v) => v !== "");
      lines.push(`${head} 勤務 ${parts.join(" ")}`);
    } else {
      lines.push(`${head} ${day.kind}${day.note ? ` ${day.note}` : ""}`);
    }
  }

  return lines.join("\n");
}

/** 送られてきた会話を、直近5往復・300文字に切りそろえる（§11） */
export function trimHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  const out: ChatTurn[] = [];
  for (const h of history) {
    if (!h || typeof h !== "object") continue;
    const role = (h as { role?: unknown }).role;
    const text = (h as { text?: unknown }).text;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string" || text.trim() === "") continue;
    out.push({ role, text: text.slice(0, TEXT_LIMIT) });
  }
  return out.slice(-HISTORY_LIMIT);
}
