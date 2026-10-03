// ===================================================================
// バージョン番号のテスト（2026-08-12 追加）
//
// 🔴 このテストの主役は §4・§5・§6。
//    「番号を package.json 1か所だけで持つ」という決めごとを、
//    人の目ではなく機械で守らせる。
//    同じことが2か所にあると、直し忘れる場所が2つできる（8/8 の事故）。
// ===================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNKNOWN_VERSION, formatAppVersion, getAppVersion, isValidVersion } from "../version";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(root + p, "utf8");
const pkgVersion = JSON.parse(read("package.json")).version as string;

afterEach(() => {
  vi.unstubAllEnvs();
});

// -------------------------------------------------------------------
// §1 番号として妥当か
// -------------------------------------------------------------------
describe("isValidVersion", () => {
  it("ふつうの番号を通す", () => {
    for (const v of ["0.9.0", "1.0.0", "1.11.13", "2.10.5", "10.0.0"]) {
      expect(isValidVersion(v), v).toBe(true);
    }
  });

  it("🔴 先頭に 0 を付けた番号を弾く（1.01.03 など）", () => {
    // 世界共通の規格で禁止。npm version が受け付けず、番号を上げられなくなる
    // （2026-08-12 に実機で確認：1.01.03 → npm error ／ 1.1.3 → 1.1.4）
    for (const v of ["1.01.03", "1.01.0", "01.0.0", "1.0.03"]) {
      expect(isValidVersion(v), v).toBe(false);
    }
  });

  it("桁が足りない・多い番号を弾く", () => {
    for (const v of ["1", "1.0", "1.0.0.0", "v1.0.0", "1.0.0-rc.1", ""]) {
      expect(isValidVersion(v), v).toBe(false);
    }
  });
});

// -------------------------------------------------------------------
// §2 取り出す
// -------------------------------------------------------------------
describe("getAppVersion", () => {
  it("焼き込まれた番号を返す", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    expect(getAppVersion()).toBe("1.2.3");
  });

  it("🔴 番号が取れないとき、それらしい番号を作らない", () => {
    // ここで "0.0.0" を返すと、仕組みが壊れているのに
    // 正しい番号が出ているように見えてしまう
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", undefined);
    expect(getAppVersion()).toBe(UNKNOWN_VERSION);
    expect(isValidVersion(getAppVersion())).toBe(false);
  });
});

// -------------------------------------------------------------------
// §3 画面に出す形
// -------------------------------------------------------------------
describe("formatAppVersion", () => {
  it("v を付ける", () => {
    expect(formatAppVersion("0.9.0")).toBe("v0.9.0");
  });

  it("🔴 不明のときは v を付けない（v不明 と出さない）", () => {
    expect(formatAppVersion(UNKNOWN_VERSION)).toBe(UNKNOWN_VERSION);
  });
});

// -------------------------------------------------------------------
// §4 🔴 package.json の番号そのものが妥当か
// -------------------------------------------------------------------
describe("package.json の version", () => {
  it("規格に合っている", () => {
    expect(isValidVersion(pkgVersion), `package.json の version が「${pkgVersion}」`).toBe(true);
  });
});

// -------------------------------------------------------------------
// §5 🔴 番号を2か所に書いていないか
// -------------------------------------------------------------------
describe("番号の置き場所は1つだけ", () => {
  it("next.config.ts が package.json から読んでいる", () => {
    const src = read("next.config.ts");
    expect(src).toMatch(/from\s+["']\.\/package\.json["']/);
  });

  it("🔴 next.config.ts に番号を直接書いていない", () => {
    const src = read("next.config.ts");
    // コメント（説明文）を落としてから探す。説明の中の例示は番号ではない
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("🔴 src/lib/version.ts に番号を直接書いていない", () => {
    const src = read("src/lib/version.ts");
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // 妥当性を判定する正規表現は数字を含まないので、これで拾えるのは書き込みだけ
    expect(code).not.toMatch(/["'`]\d+\.\d+\.\d+["'`]/);
  });

  it("🔴 ブラウザ拡張（extension/manifest.json）の番号が package.json と一致している", () => {
    // Chrome は manifest.json に番号が無いと拡張を読み込まないので、ここだけは2か所目を避けられない。
    // 2026-10-01 に見たら、拡張だけ 0.2.0 のまま残っていた（2026-08-07 から上げていなかった）。
    // 拡張も一緒に配るので、同じ番号にそろえて、ずれたらここで落とす
    const ext = JSON.parse(read("extension/manifest.json")).version as string;
    expect(
      ext,
      `extension/manifest.json が「${ext}」／package.json が「${pkgVersion}」。番号を上げたら manifest.json もそろえること`,
    ).toBe(pkgVersion);
  });
});

// -------------------------------------------------------------------
// §6 🔴 改訂履歴に書き忘れていないか
// -------------------------------------------------------------------
describe("CHANGELOG.md", () => {
  const log = read("CHANGELOG.md");

  it("いちばん上の番号が package.json と一致している", () => {
    const first = log.match(/^##\s+(\d+\.\d+\.\d+)/m)?.[1];
    expect(
      first,
      `CHANGELOG.md のいちばん上が「${first}」／package.json が「${pkgVersion}」。` +
        "番号を上げたら CHANGELOG.md にも1行足すこと",
    ).toBe(pkgVersion);
  });

  it("番号が新しい順に並んでいる", () => {
    const nums = [...log.matchAll(/^##\s+(\d+\.\d+\.\d+)/gm)].map((m) =>
      m[1].split(".").map(Number),
    );
    for (let i = 1; i < nums.length; i++) {
      const [a, b] = [nums[i - 1], nums[i]];
      const newer = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
      expect(newer, `${a.join(".")} が ${b.join(".")} より上にある`).toBe(true);
    }
  });

  it("すべての番号が規格に合っている", () => {
    for (const m of log.matchAll(/^##\s+(\S+)/gm)) {
      expect(isValidVersion(m[1]), `CHANGELOG.md の「${m[1]}」`).toBe(true);
    }
  });
});
