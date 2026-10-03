// ===================================================================
// 報告サイトの「画面ごとの定義」
//
// 🔴 報告サイトの作りに頼っているものは、すべてこのファイルに置く。
//    画面がまた変わったら、ここに定義を1つ足す。
//    levtech.js（流し込む順番と確かめ方）と popup.js（小窓）は触らなくてよい。
//    （02_基本設計/07_ブラウザ拡張設計.md §12）
//
// 定義は2つある。
//   V1  9月分までの画面   2026-08-07 に実画面で確かめた（jQuery）
//   V2  10月分からの画面  2026-10-01 に実画面で確かめた（React）
//
// 🔴 V1 は消さない。9月分までの作業報告書は、9月分までの画面のまま残る
//    （8月分・9月分を直すときも使う）。
//
// 1つの定義が持つもの
//   label            小窓に出す名前
//   isHere(doc)      この画面か。🔴 URL ではなく、拡張が使う欄があるかで見る
//                    （B-5：10月分からの画面は URL が変わり、URL で見ていた拡張が動かなくなった）
//   period(doc)      画面が扱う年月 { ym: "2026-10", text: "2026/10/01 ～ 2026/10/31" }。読めなければ ym は null
//   locate(doc, ym)  日にちを渡すと、その日の欄を返す関数を作る
//   fill(cells)      1日分の欄に値を入れ、サイトの計算を起こす
//   computed(fields) サイトが計算した作業時間（計算が動いたかを確かめるのに使う）
//   noteRequired     作業内容が必須か（空のまま反映した日を、小窓で知らせる）
//
// このファイルは素の JS（モジュールではない）。
// 拡張では levtech.js より先に読み込まれ、globalThis.AutoPunchScreens に入る。
// テスト（tests/extension/）も同じ形で読み込む。
// ===================================================================

(() => {
  // ---------- 共通の道具 ----------

  /**
   * 値を入れるだけ（合図は起こさない）。
   * ブラウザが元から持っている入れ口を使う。
   * ページの中で欄の入れ口が差し替えられていても（React がやる）、そこを通らない。
   */
  function setValue(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  }

  // 文字を集めるときに中を見ない箱。
  // <script> には画面に出ない文字が入っている。
  // <textarea> と <option> の中身は、人が入れた値や選択肢なので拾わない。
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "OPTION"]);

  /**
   * 画面に出ている文字を集める（入力欄の値は、もともと文字に含まれない）。
   * 🔴 文字のかけらは、間に何も挟まずにつなぐ。
   *    React は「10/01（木）」を「10」「/」「01」「（」「木」「）」のように細切れで描くことがある。
   *    改行を挟むと、日付として読めなくなる。
   */
  function textOf(root) {
    if (!root) return "";
    const walker = (root.ownerDocument || root).createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      // 図（SVG）の中の <style> は tagName が小文字なので、大文字にそろえてから見る
      acceptNode: (n) =>
        n.parentElement && SKIP.has(n.parentElement.tagName.toUpperCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    let text = "";
    for (let n = walker.nextNode(); n; n = walker.nextNode()) text += n.nodeValue;
    return text;
  }

  const DATE = /(\d{1,2})\/(\d{1,2})/; // 「10/01（木）」の 10/01
  const toYm = (y, m) => `${y}-${String(Number(m)).padStart(2, "0")}`;

  // ---------- V1：9月分までの画面（2026-08-07 に確かめた） ----------
  //
  // 欄の名前に日付が入っている：data[DailyReport][20260804][start_time]
  // 作業時間は隠れた欄（work_time）で、change を起こすとサイトが埋める（設計書 §4.2・§4.4）
  const V1_FIELD = "data[DailyReport]";

  const V1 = {
    id: "v1",
    label: "9月分までの画面",

    isHere: (doc) => !!doc.querySelector(`input[name^="${V1_FIELD}["][name$="[start_time]"]`),

    // 年月は、欄の名前の日付から読む
    period(doc) {
      const el = doc.querySelector(`input[name^="${V1_FIELD}["][name$="[target_date]"]`);
      const m = el && el.name.match(/\[(\d{4})(\d{2})\d{2}\]/);
      return m ? { ym: toYm(m[1], m[2]), text: `${m[1]}/${m[2]}` } : { ym: null, text: "" };
    },

    // 日にちは、そのまま欄の名前になる（20261001 → data[DailyReport][20261001][…]）
    locate(doc, ym) {
      const prefix = ym.replace("-", "");
      return (day) => {
        const f = (key) => doc.querySelector(`input[name="${V1_FIELD}[${prefix}${String(day).padStart(2, "0")}][${key}]"]`);
        return {
          startAt: f("start_time"),
          endAt: f("end_time"),
          breakAt: f("relax_time"),
          note: f("work_content"),
          workTime: f("work_time"),
        };
      };
    },

    /**
     * 値をすべて入れてから、最後の時刻の欄で change と blur を1回だけ起こす。
     * 🔴 2026-08-07 に実画面で確かめた形。変えない。
     *    欄が待っているのは change / focusout / input / blur / keydown / keypress（keyup は待っていない）。
     *    4つの欄それぞれで起こすと、同じ行を4回計算させる。
     */
    fill(cells) {
      let last = null;
      for (const { el, key, value } of cells) {
        setValue(el, value);
        if (key !== "note") last = el; // 計算に効くのは時刻の3つ
      }
      if (last) {
        last.dispatchEvent(new Event("change", { bubbles: true }));
        last.dispatchEvent(new FocusEvent("blur"));
      }
    },

    computed: (fields) => (fields.workTime ? fields.workTime.value : ""),

    noteRequired: false, // 9月分までは任意だった
  };

  // ---------- V2：10月分からの画面（2026-10-01 に確かめた） ----------
  //
  // 欄の名前は、上から数えた行の番号：rows.0.startTime（日付が入っていない）
  //   → 行に書かれた日付（「10/01（木）」）で日にちを引く。行の番号を日にちと決めつけない
  //     （対象期間が月の途中から始まると、rows.0 は1日ではなくなる）
  // 年月は、画面上部の「対象期間 2026/10/01 ～ 2026/10/31」から読む
  const V2_START = 'input[name^="rows."][name$=".startTime"]';

  /** 欄から外側へたどり、その欄の行を探す（日付の文字を含む、いちばん内側の箱） */
  function rowOf(input) {
    for (let el = input.parentElement; el; el = el.parentElement) {
      // 開始の欄を2つ以上含んだら、行を通り越して表まで来ている
      if (el.querySelectorAll(V2_START).length > 1) return null;
      if (DATE.test(textOf(el))) return el;
    }
    return null;
  }

  const V2 = {
    id: "v2",
    label: "10月分からの画面",

    isHere: (doc) => !!doc.querySelector(V2_START),

    period(doc) {
      // 「対象期間」と日付のあいだに、記号やアイコンの文字（「：」「ⓘ」など）が挟まっても読めるようにする
      const m = textOf(doc.body).match(/対象期間[^0-9]{0,30}?(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[～〜~－-]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      if (!m) return { ym: null, text: "" };
      const from = toYm(m[1], m[2]);
      const text = `${m[1]}/${m[2]}/${m[3]} ～ ${m[4]}/${m[5]}/${m[6]}`;
      // 🔴 月をまたぐ対象期間は扱わない。AutoPunch は暦の1か月ごとに持っている
      return { ym: from === toYm(m[4], m[5]) ? from : null, text };
    },

    locate(doc, ym) {
      const month = Number(ym.slice(5));
      const byDay = new Map();
      for (const start of doc.querySelectorAll(V2_START)) {
        const i = (start.name.match(/^rows\.(\d+)\.startTime$/) || [])[1];
        const row = i !== undefined ? rowOf(start) : null;
        const d = row && textOf(row).match(DATE);
        // 行の日付が読めない行・別の月の行は使わない（黙って隣の日に入れないため）
        if (!d || Number(d[1]) !== month) continue;
        const f = (key) => doc.querySelector(`input[name="rows.${i}.${key}"]`);
        byDay.set(Number(d[2]), {
          startAt: f("startTime"),
          endAt: f("endTime"),
          breakAt: f("breakTime"),
          note: f("comment"),
          row,
        });
      }
      return (day) => byDay.get(day) || null;
    },

    /**
     * 欄ごとに、人が打ったときと同じ順で合図を起こす。
     *   focusin → 値 → input → change → focusout → blur
     * 🔴 2026-10-01 に実画面で確かめた形（作業時間 08:00・作業時間合計 16時間）。
     *    React は input の合図を受けて、サイトの手元の値を変える。
     *    合図の無い欄は、次に画面を描き直したときに元の値へ戻される
     *    （同じ仕組みで組んだテスト用の画面では、9月分までの入れ方だと開始・終了・作業内容が空に戻った）。
     */
    fill(cells) {
      for (const { el, value } of cells) {
        el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        setValue(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        el.dispatchEvent(new FocusEvent("blur"));
      }
    },

    // 行に出ている作業時間（「08:00」）。日付の「10/01」はコロンが無いので混ざらない
    computed: (fields) => (textOf(fields.row).match(/\d{1,3}:\d{2}/) || [""])[0],

    // 報告サイトのお知らせ（2026-09-19）：10月分から「作業内容」が必須になる
    noteRequired: true,
  };

  const SCREENS = [V2, V1];

  globalThis.AutoPunchScreens = {
    SCREENS,
    // 同じページに両方の欄がそろうことはないので、並び順に意味はない
    detect: (doc) => SCREENS.find((s) => s.isHere(doc)) || null,
  };
})();
