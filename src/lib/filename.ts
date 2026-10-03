// ===================================================================
// ダウンロードするファイルの名前（04_Excel出力設計 §2.1・拡張1 §2.9）
//
// 📌 `src/server/workbook.ts` ではなく、ここに置いてある。
//    出力画面（S-4）にも同じ名前を出すので、画面から呼べる場所が要る。
//    workbook.ts は exceljs を読み込むため、画面から呼ぶとブラウザに
//    Excel生成の一式が丸ごと入ってしまう。
// ===================================================================

/**
 * Windows のファイル名に使えない文字を落とす。
 *
 * 🔴 案件名をそのままファイル名に入れない。
 *    `\ / : * ? " < > |` が入っていると、ダウンロードに失敗するか
 *    勝手に置き換えられる。ピリオドと空白で終わる名前も Windows が嫌う。
 */
export function safeFileNamePart(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "") // Windows が受け付けない9文字
    .replace(/[.\s]+$/, "") // 末尾のピリオドと空白（Windows が黙って落とす）
    .trim();
  // 記号だけの名前だと空になる。そのときは当たり障りのない名前にする
  return cleaned || "案件";
}

/**
 * 勤務表のファイル名。
 *
 * 案件が増えると、どの案件の勤務表か分からなくなるので名前を入れる。
 * 例：`勤務表_案件A_2026_08.xlsx`
 */
export function workbookFileName(projectName: string, year: number, month: number): string {
  return `勤務表_${safeFileNamePart(projectName)}_${year}_${String(month).padStart(2, "0")}.xlsx`;
}
