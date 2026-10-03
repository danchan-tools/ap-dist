// ===================================================================
// 報告サイト側（作業報告書の入力画面）で動く部分
//
// やること：拡張のボタンから頼まれたら、覚えている1か月分を流し込み、
//           値が残ったか・サイトの計算が動いたか・必須の欄が空でないかを確かめて返す
//
// 🔴 報告サイトの作りに頼るもの（欄の名前・年月の読み方・合図の起こし方）は
//    levtech-screens.js にだけ置く。画面が変わっても、このファイルは触らない。
//
// 🔴 保存ボタンは押さない。最後の確認と保存は人がやる
//    （02_基本設計/07_ブラウザ拡張設計.md §1）
//
// 🔴 画面には何も足さない。
//    2026-08-07：はじめは「保存する」の隣にボタンを差し込んでいたが、
//    サイトは「保存ボタンの箱の中が押された＝保存が始まった」と見なして
//    ぐるぐる（btn-loader）を出し、終わらないので回り続けた。
//    人のサイトの箱に自分のものを入れない、が結論。
// ===================================================================

const STEP_MS = 120; // 1日ごとに空ける間
const SETTLE_MS = 600; // 最後の日を入れてから、サイトの描き直しと計算を待つ
const KEYS = ["startAt", "endAt", "breakAt", "note"]; // AutoPunch から届く4つ。この順で入れる

/** "09:30" → 570。時刻でなければ null */
function toMin(s) {
  const m = /^(\d{1,3}):(\d{2})$/.exec(String(s || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 入れた値が、欄に残っているか（時刻は「9:30」と「09:30」を同じとみなす） */
function kept(el, value) {
  const now = el.value.trim();
  const want = String(value).trim();
  return now === want || (toMin(want) !== null && toMin(now) === toMin(want));
}

/** その日に作業時間が出るはずか（開始・終了があり、休憩を引いても時間が残る） */
function expectsWork(day) {
  const s = toMin(day.startAt);
  const e = toMin(day.endAt);
  return s !== null && e !== null && e - s - (toMin(day.breakAt) || 0) > 0;
}

/** 入れてよい欄か。無い・押せない・読み取り専用の欄には入れない（報告済みの作業報告書に書き込まないため） */
const usable = (el) => !!el && !el.disabled && !el.readOnly;

/** 小窓を開いたときに、いま開いている画面を答える */
function inspect() {
  const screen = globalThis.AutoPunchScreens.detect(document);
  if (!screen) return { screen: null };
  const { ym, text } = screen.period(document);
  return { screen: screen.label, ym, period: text };
}

/**
 * 1日ずつ、間を空けて入れる。
 * 入れ終わったら、サイトが受け取ったかを確かめる。
 */
function apply(payload, done) {
  const screen = globalThis.AutoPunchScreens.detect(document);
  if (!screen) {
    done({ ok: false, reason: "画面ちがい" });
    return;
  }

  // 🔴 年月を照合する。8月分を覚えたまま9月の画面で押す、が起こりうる。
  //    年月が読めないときも止める（読めないまま進むと、別の月の欄に入りうる。設計書 §11.4）
  const { ym, text } = screen.period(document);
  if (!ym) {
    done({ ok: false, reason: "年月が読めない", period: text });
    return;
  }
  if (ym !== payload.ym) {
    done({ ok: false, reason: "月ちがい", pageYm: ym });
    return;
  }

  const find = screen.locate(document, ym);
  const written = []; // 入れた日
  const missing = []; // 欄が見つからない・入れられない欄があった日
  let i = 0;

  function step() {
    if (i >= payload.days.length) {
      setTimeout(check, SETTLE_MS);
      return;
    }

    const day = payload.days[i];
    i += 1;

    const fields = find(day.day) || {};
    // 🔴 値が空の欄には触らない（前に入れた値を消さないため。設計書 §6.0）
    const wanted = KEYS.filter((key) => day[key]);
    const cells = wanted.filter((key) => usable(fields[key])).map((key) => ({ key, el: fields[key], value: day[key] }));

    if (cells.length < wanted.length) missing.push(day.day);
    if (cells.length) {
      screen.fill(cells);
      written.push({ day, fields, cells });
    }

    setTimeout(step, STEP_MS);
  }

  /**
   * 🔴「入れた」ではなく「サイトが受け取った」を数える（設計書 §3）。
   *    画面の仕組みが変わると、欄に値が並んでいても、サイトの計算や保存に届かないことがある。
   *    ① 値が欄に残っているか（描き直しで元に戻されていないか）
   *    ② サイトが作業時間を計算したか
   *    ③ 作業内容が必須の画面で、空のままの日が無いか（拡張は空の値を入れないので、空の日は空のまま残る）
   */
  function check() {
    const timed = written.filter((w) => w.cells.some((c) => c.key !== "note"));

    const notKept = written.filter((w) => w.cells.some((c) => !kept(c.el, c.value))).map((w) => w.day.day);

    const notComputed = timed
      .filter((w) => !missing.includes(w.day.day) && expectsWork(w.day))
      .filter((w) => !(toMin(screen.computed(w.fields)) > 0))
      .map((w) => w.day.day);

    const noNote = screen.noteRequired
      ? timed.filter((w) => w.fields.note && !w.fields.note.value.trim()).map((w) => w.day.day)
      : [];

    done({
      ok: true,
      screen: screen.label,
      filled: timed.length,
      total: payload.days.length,
      missing,
      notKept,
      notComputed,
      noNote,
    });
  }

  step();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === "ping") {
    sendResponse(inspect());
    return false;
  }

  if (msg.type === "apply") {
    apply(msg.payload, sendResponse);
    return true; // 数秒かかるので、返事の口を開けたままにする
  }

  return false;
});
