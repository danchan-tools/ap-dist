// ===================================================================
// ブラウザ拡張（extension/）をテストで動かすための道具（2026-10-01 追加・B-5）
//
// 🔴 拡張のファイルは、Chrome と同じく「素の JS」として読み込む。
//    モジュールとして import すると、Chrome と違う形で動かすことになる。
//
// 📌 テストを extension/ の中に置かないのは、
//    Chrome が「_ で始まるフォルダ（__tests__）」を含む拡張を読み込まないため。
// ===================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ⚠️ jsdom の中では URL が jsdom のものに差し替わるので、new URL(…, import.meta.url) は使えない
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../extension");

export const readExt = (name: string) => readFileSync(path.join(EXT, name), "utf8");

/** 拡張のファイルを、素の JS として実行する */
export function runScript(name: string) {
  new Function(readExt(name))();
}

/** 拡張が持ち歩く1か月分（AutoPunch の出力画面が渡すものと同じ形） */
export type Day = { day: number; startAt: string; endAt: string; breakAt: string; note: string };
export type Payload = { ym: string; days: Day[] };

/** 報告サイト側（levtech.js）が返すもの */
export type PingResult = { screen: string | null; ym?: string | null; period?: string };
export type ApplyResult =
  | { ok: false; reason: string; pageYm?: string; period?: string }
  | {
      ok: true;
      screen: string;
      filled: number;
      total: number;
      missing: number[];
      notKept: number[];
      notComputed: number[];
      noNote: number[];
    };

type Listener = (msg: unknown, sender: unknown, send: (res: unknown) => void) => boolean | void;

/**
 * 報告サイトのページの中（levtech-screens.js と levtech.js）を、manifest.json と同じ順で読み込む。
 * 小窓から送るのと同じ形で、話しかけられるようにして返す。
 */
export function loadReportSide() {
  let listener: Listener | null = null;
  setChrome({ runtime: { onMessage: { addListener: (fn: Listener) => (listener = fn) } } });

  const scripts = JSON.parse(readExt("manifest.json")).content_scripts.find((cs: { js: string[] }) =>
    cs.js.includes("levtech.js"),
  ).js as string[];
  for (const s of scripts) runScript(s);

  const send = <T>(msg: unknown) =>
    new Promise<T>((resolve) => {
      listener!(msg, {}, (res) => resolve(res as T));
    });

  return {
    ping: () => send<PingResult>({ type: "ping" }),
    apply: (payload: Payload) => send<ApplyResult>({ type: "apply", payload }),
  };
}

export function setChrome(chrome: unknown) {
  (globalThis as unknown as { chrome: unknown }).chrome = chrome;
}

/** levtech-screens.js が置く定義（テストで中身を直接さわるとき用） */
export type Cell = { el: HTMLInputElement; key: string; value: string };
export type Screen = { id: string; label: string; fill: (cells: Cell[]) => void };
export const screens = () =>
  (globalThis as unknown as { AutoPunchScreens: { SCREENS: Screen[] } }).AutoPunchScreens.SCREENS;

/** 1日分（勤務の日）を作る */
export const day = (d: number, startAt = "09:00", endAt = "18:00", breakAt = "01:00", note = "通常業務"): Day => ({
  day: d,
  startAt,
  endAt,
  breakAt,
  note,
});
