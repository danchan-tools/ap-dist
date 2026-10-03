// ===================================================================
// F-5 Excel出力（02_基本設計/04_Excel出力設計.md）
//
// 現行の勤怠表Excelを解析して採取した値を、そのまま再現する。
// 列・数式・表示形式・列幅・罫線・塗り・フォントまで実物どおり。
//
// exceljs で必ずハマる4点（§5.2）
//   ① 数式に `=` を付けない。付けると Excel が修復ダイアログを出す
//   ② 行ごとに参照がずれる数式は fillFormula() で範囲指定できる
//   ③ exceljs は計算しない。結果はファイルに入らない
//   ④ だから wb.calcProperties.fullCalcOnLoad = true を入れる
// ===================================================================

import ExcelJS from "exceljs";
import { calcMonth } from "@/lib/calc";
import { daysIn } from "@/lib/calendar";
import { toMin } from "@/lib/time";
import type { MonthData } from "@/lib/types";

/** 現行ファイルと同じ書式（§1.4 の実測値） */
const FMT = {
  day: "d", // 日だけ（4）
  time: "h:mm", // 9:30
  /** 🔴 終業だけ角かっこ付き。夜勤の 26:00 が 2:00 と表示されるのを防ぐ（§7.2） */
  timeOver24: "[h]:mm",
  overtime: 'h:mm;""', // 0 は 0:00、マイナスだけ空欄
  total: "[h]:mm", // 152:00（24時間を超えても繰り上がらない）
};

/**
 * §1.5 の実測値。グレーは2段階ある。
 *
 * 📌 現行Excelは「テーマ色の白＋濃くする度合い（tint）」で指定している。
 *    同じ見た目でも、色を直接指定すると Excel 上の扱いが変わるので、
 *    実物とまったく同じ指定方法にそろえてある（tint の値も実測値）。
 */
// ⚠️ exceljs の型定義には tint / indexed が無い（実際のファイル形式にはある）。
//    そのままだと型エラーになるので、この2つを足した型をここで定義する
type FillColor = Partial<ExcelJS.Color> & { tint?: number; indexed?: number };

const GREY_LIGHT: FillColor = { theme: 0, tint: -0.1499984740745262 }; // 見出し・集計行
const GREY_DARK: FillColor = { theme: 0, tint: -0.249977111117893 }; // 働いていない日
const YELLOW: FillColor = { argb: "FFFFFF00" }; // 合計セル

const THIN_BORDER: ExcelJS.Borders = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
  diagonal: {},
};

function fill(cell: ExcelJS.Cell, color: FillColor) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: color as ExcelJS.Color,
    bgColor: { indexed: 64 } as unknown as ExcelJS.Color, // 実物と同じ
  };
}

/** 'HH:MM' → Excelの小数。1日を1とするので 9:30 は 0.39583… */
function toExcelTime(v: string | null | undefined): number | null {
  const min = toMin(v);
  return min == null ? null : min / 1440;
}

/**
 * 勤務表のブックを作る。
 *
 * ⚠️ 単価・見込み金額は**書かない**（§4.2）。
 *    ファイルは手元に残り、どこに置かれるか分からないため。
 */
export async function buildWorkbook(data: MonthData): Promise<ArrayBuffer> {
  // 🔴 基準労働時間は【その案件のその月】の値（拡張1）。
  //    全期間で共通の設定ではなくなった
  const { year, month, days, contract, baseWorkMinutes } = data;
  const wb = new ExcelJS.Workbook();

  // ④ 開いたときに再計算させる。これがないと数式のセルが空に見えることがある
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet(`${year}_${String(month).padStart(2, "0")}`);

  // 全体のフォント（§1.1）
  const FONT: Partial<ExcelJS.Font> = { name: "Yu Gothic", size: 11 };

  // 列幅（§1.6 の実測値。D・E は既定のまま）
  // 小数まで実物と同じ値にしてある
  ws.getColumn("A").width = 5.83203125;
  ws.getColumn("B").width = 5.25;
  ws.getColumn("C").width = 13;
  ws.getColumn("F").width = 9;
  ws.getColumn("G").width = 9;
  ws.getColumn("H").width = 15.08203125;
  ws.getColumn("I").width = 21.33203125;

  // 📌 exceljs は「幅 9 ＝ 既定値」とみなし、F・G の列定義を書き出さない。
  //    書式を1つ持たせると書き出されるようになる。
  //    どのみち全体を Yu Gothic にするので、実害のない指定でそろえている。
  ws.getColumn("F").style = { font: FONT };
  ws.getColumn("G").style = { font: FONT };

  // --- ヘッダー（1〜2行・§3.1） ---
  ws.getCell("A1").value = "年";
  ws.getCell("B1").value = "月";
  ws.getCell("C1").value = "通常勤務時間";
  ws.getCell("A2").value = year;
  ws.getCell("B2").value = month;
  ws.getCell("C2").value = baseWorkMinutes / 1440;
  ws.getCell("C2").numFmt = FMT.time;
  for (const ref of ["A1", "B1", "C1"]) fill(ws.getCell(ref), GREY_LIGHT);

  // --- 表の見出し（4行・§3.2） ---
  const HEAD = ["日付", "曜日", "始業", "終業", "休憩時間", "勤務時間", "残業時間", "作業場所", "備考"];
  HEAD.forEach((h, i) => {
    const cell = ws.getRow(4).getCell(i + 1);
    cell.value = h;
    fill(cell, GREY_LIGHT);
  });

  // --- データ（5〜35行・必ず31行・§3.3） ---
  //
  // 📌 行番号と日付は「行番号 = 4 + 日」で対応づける。
  //    days を上から順に流し込むと、欠けている日で行がずれる。
  //
  // ② 日付と曜日は全行で同じ形なので、範囲でまとめて入れる（共有数式）
  ws.fillFormula("A5:A35", "DATE($A$2,$B$2,ROW()-4)");
  ws.fillFormula("B5:B35", 'TEXT(A5,"aaa")');

  const last = daysIn(year, month);
  for (let d = 1; d <= 31; d++) {
    const n = 4 + d; // 行番号

    // 📌 表示形式は【値の有無にかかわらず】31行すべてに付ける。
    //    実物もそうなっている。付けておかないと、あとから手で時刻を打ったときに
    //    その日だけ書式が当たらず、見た目が崩れる
    ws.getCell(`A${n}`).numFmt = FMT.day;
    ws.getCell(`C${n}`).numFmt = FMT.time;
    ws.getCell(`D${n}`).numFmt = FMT.timeOver24; // 26:00 を 2:00 にしない
    ws.getCell(`E${n}`).numFmt = FMT.time;
    // 勤務時間も [h]:mm にする。始業0:00〜終業29:59 のような入力だと
    // 24時間を超え、h:mm では巻き戻って表示されるため
    ws.getCell(`F${n}`).numFmt = FMT.timeOver24;
    ws.getCell(`G${n}`).numFmt = FMT.overtime;

    const day = d <= last ? days[d] : undefined;
    if (!day) continue;

    if (day.kind === "勤務") {
      ws.getCell(`C${n}`).value = toExcelTime(day.startAt);
      ws.getCell(`D${n}`).value = toExcelTime(day.endAt);
      ws.getCell(`E${n}`).value = toExcelTime(day.breakAt);

      // ① 数式に `=` は付けない
      ws.getCell(`F${n}`).value = { formula: `D${n}-C${n}-E${n}` };
      // 現行は F−C2 だが、マイナスを 0 にする方針に合わせる（§3.3）
      ws.getCell(`G${n}`).value = { formula: `MAX(0,F${n}-$C$2)` };

      ws.getCell(`H${n}`).value = day.place ?? null;
      ws.getCell(`I${n}`).value = day.note ?? null;
    } else {
      // 休日・休暇・祝日は C〜H を空にし、備考だけ入れる
      ws.getCell(`I${n}`).value = day.note ?? null;

      // 📌 働いていない日は、土日も含めて A〜H を濃いグレーで塗る
      //    （✅ 2026-08-05 変更・利用者の指摘）。
      //    現行Excelは「備考を書いた行」だけを塗り、土日は塗っていなかったが、
      //    土日が白いままだと働いた日との区別がつきにくいため。
      //    備考の列（I）は塗らない。ここは現行と同じ。
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
        fill(ws.getCell(`${col}${n}`), GREY_DARK);
      }
    }
  }

  // --- 集計（36〜38行・§3.4） ---
  ws.getCell("A36").value = "合計";
  ws.getCell("F36").value = { formula: "SUM(F5:F35)" };
  ws.getCell("F36").numFmt = FMT.total;
  fill(ws.getCell("F36"), YELLOW);
  ws.getCell("F36").font = { ...FONT, bold: true, color: { argb: "FFFF0000" } };

  // 🔴 下限が未入力（時給契約）なら、37・38行を【空欄にする】（拡張2・08 §3.7）。
  //    ラベルも数式も入れない。
  //
  //    F37 だけ空にして F38 の数式を残すと、`F36-F37` が 0 扱いで通ってしまい、
  //    **「合計と同じ時間だけ超過している」ように見える。**
  //    空にするのはセルの値だけでなく、数式もろとも。
  //
  //    📌 時給契約の提出先がまだ無く、「別の現行」が存在しないので、
  //       様式そのものは変えない（AC-6）。決まったら行を足す形へ移せる。
  if (contract.lo !== null) {
    ws.getCell("A37").value = "下限時間";
    ws.getCell("F37").value = contract.lo / 1440;
    ws.getCell("F37").numFmt = FMT.total;
    ws.getCell("F37").font = { ...FONT, bold: true };

    ws.getCell("A38").value = "差分";
    // 下回ったとき先頭に「-」を付けたい。時間のマイナスは表示形式で素直に出せないため
    // ABS で絶対値にしてから、IF で書式コードを切り替えて文字にしている
    ws.getCell("F38").value = { formula: 'TEXT(ABS(F36-F37), IF(F36>F37, "[hh]:mm", "-[hh]:mm"))' };
    ws.getCell("F38").font = { ...FONT, bold: true };
    // TEXT() の戻りは文字列なので、放っておくと左寄せになる
    ws.getCell("F38").alignment = { horizontal: "right" };
  }

  // A〜E の36〜38行は、ラベルの有無にかかわらず薄いグレー（§1.5）
  for (let n = 36; n <= 38; n++) {
    for (const col of ["A", "B", "C", "D", "E"]) fill(ws.getCell(`${col}${n}`), GREY_LIGHT);
  }

  // --- フォントと罫線を、使っている範囲すべてに当てる（§1.5） ---
  for (let n = 1; n <= 38; n++) {
    if (n === 3) continue; // 3行目は空行
    for (let c = 1; c <= 9; c++) {
      const cell = ws.getRow(n).getCell(c);
      // 1〜2行目は A〜C だけが対象
      if (n <= 2 && c > 3) continue;
      cell.border = THIN_BORDER;
      if (!cell.font?.bold) cell.font = FONT;
    }
  }

  // exceljs は独自の Buffer 型を返す。中身はバイト列なので、そのまま返せる形へ写す
  const written = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const out = new ArrayBuffer(written.byteLength);
  new Uint8Array(out).set(written);
  return out;
}

/** 出力前に画面へ出す件数・合計（S-4 のカード） */
export function workbookStats(data: MonthData) {
  return calcMonth(data.year, data.month, data.days, data.baseWorkMinutes);
}
