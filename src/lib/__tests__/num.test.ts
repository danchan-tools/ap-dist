// ===================================================================
// 入力欄の数値の読み取り（2026-08-08）
//
// 🔴 このテストが無かったせいで、次の不具合が本番寸前まで残った。
//    「控除単価に 4,285 と打つと 0 になり、見込み金額が実際より高く出る」
//    画面の中に `Number(s) || 0` と書いてあり、テストが書けない場所だった。
// ===================================================================

import { describe, expect, it } from "vitest";
import { parseAmount, parseMoneyField } from "../num";

describe("parseAmount：入力欄の文字を数値にする", () => {
  it("ふつうの数字はそのまま読む", () => {
    expect(parseAmount("4285")).toBe(4285);
    expect(parseAmount("0")).toBe(0);
  });

  it("🔴 カンマ付きを読む（契約書からの転記でいちばん起きる）", () => {
    expect(parseAmount("4,285")).toBe(4285);
    expect(parseAmount("600,000")).toBe(600000);
    // 全角カンマ・読点（日本語入力のまま打つと出る）
    expect(parseAmount("4，285")).toBe(4285);
    expect(parseAmount("4、285")).toBe(4285);
  });

  it("前後の空白は落とす", () => {
    expect(parseAmount(" 4285 ")).toBe(4285);
  });

  it("空欄は null（呼ぶ側が「未入力」か「0」かを決める）", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
  });

  it("🔴 読めないものは null。0 に落とさない", () => {
    // 0 に落とすと、単価が黙って 0 で保存され、金額が静かに間違う
    for (const bad of ["あ", "abc", "-1", "1.5", "1e5", "0x10", "１２３", "4 285"]) {
      expect(parseAmount(bad)).toBeNull();
    }
  });

  it("🔴 `Number()` に任せていたら通っていたものを、確かに弾く", () => {
    // Number("1e5") === 100000 ／ Number("0x10") === 16 ／ Number(" ") === 0
    expect(Number("1e5")).toBe(100000); // ← 素の Number はこう読む
    expect(parseAmount("1e5")).toBeNull(); // ← こちらは弾く
    expect(Number(" ")).toBe(0);
    expect(parseAmount(" ")).toBeNull();
  });

  it("けた数が大きすぎるものは null（整数として正しく表せない）", () => {
    expect(parseAmount("9".repeat(20))).toBeNull();
  });
});

describe("parseMoneyField：単価の欄", () => {
  it("空欄は 0（＝まだ入れていない）", () => {
    expect(parseMoneyField("")).toBe(0);
  });

  it("カンマ付きを読む", () => {
    expect(parseMoneyField("4,285")).toBe(4285);
  });

  it("読めないものは null（保存を止めるため）", () => {
    expect(parseMoneyField("あ")).toBeNull();
  });
});
