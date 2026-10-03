// ===================================================================
// 祝日表の生成（src/lib/holidays.ts に貼るもとを作る）
//
//   node scripts/gen-holidays.mjs            … 2024〜2035 を出す
//   node scripts/gen-holidays.mjs 2036 2045  … 範囲を指定して出す
//
// 🔴 なぜスクリプトにしてあるか。**日付を記憶で書かないため。**
//    祝日法のルールから機械的に組み立てて、2026年で答え合わせをしてから貼る。
//    2026年は 2026-08-05 から使っていて、正しいと分かっている年だから。
//
// 🔴 ここが唯一のルール実装。`src/lib/__tests__/holidays.test.ts` も
//    このファイルを読み込んで、貼った表とルールが合っているかを確かめる。
//    ルールを2か所に書くと、直し忘れる場所が2つできる。
//
// ⚠️ 出した表をそのまま信じない。春分・秋分は計算値であって確定値ではない。
//    確定するのは国立天文台が前年2月に官報で公告する暦要項。
//    詳しくは src/lib/holidays.ts の先頭コメント。
// ===================================================================

import { pathToFileURL } from "node:url";

// --- 日付ユーティリティ（UTC 固定。タイムゾーンで1日ずれるのを防ぐ） ---
const DAY = 86400000;
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const dowOf = (y, m, d) => new Date(utc(y, m, d)).getUTCDay(); // 0=日
const keyOf = (ts) => {
  const dt = new Date(ts);
  return `${dt.getUTCMonth() + 1}-${dt.getUTCDate()}`;
};

/** その月の第 n 月曜の「日」（nthMonday(2026,1,2) → 12 ＝ 成人の日） */
function nthMonday(y, m, n) {
  const offset = (1 - dowOf(y, m, 1) + 7) % 7; // 1日から最初の月曜までの日数
  return 1 + offset + (n - 1) * 7;
}

/**
 * 春分日・秋分日（近似式・1900〜2099年）
 *
 * 🔴 これは「計算値」であって「確定値」ではない。
 */
export function shunbun(y) {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}
export function shubun(y) {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

/**
 * その年の「国民の祝日」16日（振替休日・国民の休日は含まない）
 *
 * ⚠️ 2026年時点の祝日法にもとづく。**法改正があればここを直す。**
 *    2016年 山の日 新設／2020年 体育の日→スポーツの日・天皇誕生日 12-23→2-23／
 *    2020・2021年 五輪特例。
 * 🔴 だから 2022年より前には使えない。
 */
function baseHolidays(y) {
  if (y < 2022) throw new Error(`${y}年は五輪特例・法改正の範囲。このルールでは出せない`);
  return new Map([
    [utc(y, 1, 1), "元日"],
    [utc(y, 1, nthMonday(y, 1, 2)), "成人の日"],
    [utc(y, 2, 11), "建国記念の日"],
    [utc(y, 2, 23), "天皇誕生日"],
    [utc(y, 3, shunbun(y)), "春分の日"],
    [utc(y, 4, 29), "昭和の日"],
    [utc(y, 5, 3), "憲法記念日"],
    [utc(y, 5, 4), "みどりの日"],
    [utc(y, 5, 5), "こどもの日"],
    [utc(y, 7, nthMonday(y, 7, 3)), "海の日"],
    [utc(y, 8, 11), "山の日"],
    [utc(y, 9, nthMonday(y, 9, 3)), "敬老の日"],
    [utc(y, 9, shubun(y)), "秋分の日"],
    [utc(y, 10, nthMonday(y, 10, 2)), "スポーツの日"],
    [utc(y, 11, 3), "文化の日"],
    [utc(y, 11, 23), "勤労感謝の日"],
  ]);
}

/**
 * 振替休日・国民の休日まで含めた、その年の休日すべて。
 * 返すのは `{ "5-6": "振替休日", … }` の形（holidays.ts の表と同じ）。
 */
export function allHolidays(y) {
  const base = baseHolidays(y);
  const out = new Map(base);

  // --- 振替休日（2007年〜の形）---
  // 🔴 「翌日」ではなく「その後の、祝日でない最初の日」。
  //    5/4 が日曜のとき 5/5 も祝日なので、振替は 5/6 までずれる。
  for (const ts of base.keys()) {
    if (new Date(ts).getUTCDay() !== 0) continue;
    let t = ts + DAY;
    while (base.has(t)) t += DAY;
    out.set(t, "振替休日");
  }

  // --- 国民の休日（前後を祝日に挟まれた平日）---
  // 🔴 判定に使うのは base のほう。振替休日は「国民の祝日」ではないので挟めない。
  for (const ts of base.keys()) {
    const mid = ts + DAY;
    if (base.has(mid)) continue; // それ自体が祝日
    if (!base.has(mid + DAY)) continue; // 翌日が祝日でない
    if (new Date(mid).getUTCDay() === 0) continue; // 日曜は除く
    if (out.has(mid)) continue; // すでに振替休日
    out.set(mid, "国民の休日");
  }

  return Object.fromEntries(
    [...out.entries()].sort((a, b) => a[0] - b[0]).map(([ts, name]) => [keyOf(ts), name])
  );
}

// ===================================================================
// ここから下は `node scripts/gen-holidays.mjs` で直に走らせたときだけ動く
// ===================================================================
// 🔴 パスの突き合わせは pathToFileURL を通す。
//    このリポジトリは「18_AI-Driven School用フォルダ」の下にあり、
//    import.meta.url では空白と日本語が %20 や %E7%94%A8 に化ける。
//    文字列のまま比べると、いつまでも一致せず**黙って何も出力しない**（2026-08-08）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const from = Number(process.argv[2] ?? 2024);
  const to = Number(process.argv[3] ?? 2035);
  const dowJa = "日月火水木金土";

  for (let y = from; y <= to; y++) {
    const h = allHolidays(y);
    const n = Object.keys(h).length;
    console.log(`  ${y}: {   // ${n}日  春分 3/${shunbun(y)}  秋分 9/${shubun(y)}`);
    for (const [k, name] of Object.entries(h)) {
      const [m, d] = k.split("-").map(Number);
      console.log(`    "${k}": "${name}",`.padEnd(34) + `// ${dowJa[dowOf(y, m, d)]}`);
    }
    console.log("  },");
  }
}
