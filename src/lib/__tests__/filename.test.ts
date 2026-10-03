// ===================================================================
// ダウンロードするファイルの名前（拡張1・08_将来の拡張設計.md §2.9）
//
// 案件名は利用者が自由に入力する。
// そのままファイル名に入れると、Windows が受け付けない文字でダウンロードが壊れる。
//
// 🔴 ここで見張るのは「落とすべき文字を落としているか」だけではない。
//    **落としすぎて名前が消えていないか**も見る。
// ===================================================================

import { describe, expect, it } from "vitest";
import { safeFileNamePart, workbookFileName } from "../filename";

describe("safeFileNamePart（ファイル名に使えない文字を落とす）", () => {
  it("ふつうの案件名は、そのまま通す", () => {
    expect(safeFileNamePart("案件A")).toBe("案件A");
    expect(safeFileNamePart("ABC システム開発")).toBe("ABC システム開発");
  });

  it("Windows が受け付けない9文字を落とす", () => {
    expect(safeFileNamePart('案\\件/A:B*C?D"E<F>G|H')).toBe("案件ABCDEFGH");
  });

  it("末尾のピリオドと空白を落とす（Windows が黙って消すため）", () => {
    expect(safeFileNamePart("案件A. ")).toBe("案件A");
    expect(safeFileNamePart("  案件A  ")).toBe("案件A");
  });

  it("🔴 落としきって空になったら、代わりの名前を返す", () => {
    // 空のまま返すと 勤務表__2026_08.xlsx になり、何の月か読めなくなる
    expect(safeFileNamePart("///")).toBe("案件");
    expect(safeFileNamePart("   ")).toBe("案件");
  });
});

describe("workbookFileName（勤務表のファイル名）", () => {
  it("案件名と年月を入れる", () => {
    expect(workbookFileName("案件A", 2026, 8)).toBe("勤務表_案件A_2026_08.xlsx");
  });

  it("月は必ず2桁にする（並べたときに順番が崩れないため）", () => {
    expect(workbookFileName("案件A", 2026, 12)).toBe("勤務表_案件A_2026_12.xlsx");
    expect(workbookFileName("案件A", 2027, 1)).toBe("勤務表_案件A_2027_01.xlsx");
  });

  it("使えない文字を含む案件名でも、壊れた名前を作らない", () => {
    expect(workbookFileName("A/B", 2026, 8)).toBe("勤務表_AB_2026_08.xlsx");
  });
});
