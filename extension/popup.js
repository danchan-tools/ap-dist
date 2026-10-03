// ===================================================================
// 拡張機能のボタンを押すと出る小窓
//
// 開いているページによって、できることが変わる。
//   AutoPunch の出力画面 → ［この月を拡張に送る］
//   報告サイトの作業報告書 → ［AutoPunchから反映］
//   それ以外            → 案内だけ
//
// 🔴 ページの見た目には一切触らない（2026-08-07 の方針変更）
//
// 🔴 報告サイトの場所は manifest.json にだけ書く。この小窓は manifest.json を読む。
//    2026-10-01 まで、報告サイトの場所を manifest.json とこのファイルの2か所に書いていた。
//    10月分からの画面で場所が変わり（B-5）、両方を直す必要があった。
//    報告サイトのどの画面かは、ページの中の levtech.js に聞く（levtech-screens.js が見分ける）。
//
// 🔴 AutoPunch の場所は、どこにも書かない（2026-10-02・B-6）。
//    買った人は自分の場所に置くので、場所では見分けられない。
//    小窓を開いたときだけ Chrome が許すそのページへの出入り（activeTab）で、ページの中を読む（autopunch.js）。
// ===================================================================

const STORE_KEY = "autopunch_transfer";

const memo = document.getElementById("memo");
const page = document.getElementById("page");
const go = document.getElementById("go");
const msg = document.getElementById("msg");

const say = (text, cls) => {
  msg.textContent = text;
  msg.className = "msg " + (cls || "");
};

const hint = (text) => {
  msg.textContent = text;
  msg.className = "hint";
};

/** 覚えている中身を上に出す */
function showMemo(payload) {
  if (!payload) {
    memo.innerHTML = '<span class="none">まだ何も覚えていません</span>';
    return;
  }
  memo.innerHTML = `覚えている月　<b>${payload.ym}</b><br>日数　<b>${payload.days.length}日分</b>`;
}

/** 開いている作業報告書を出す（覚えている月と見比べられるように） */
function showPage(info) {
  page.hidden = false;
  page.innerHTML = `開いている作業報告書　<b>${info.ym || "年月が読めません"}</b><br><span class="none">${info.screen}</span>`;
}

function ask(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      // ページを開いたあとに拡張を入れ直すと、つながりが切れている
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res);
    });
  });
}

// ---------- どのページかを manifest.json から見分ける ----------

/** その JS を読み込むページの書き方（"https://platform.levtech.jp/*" など） */
function patternsOf(script) {
  return (chrome.runtime.getManifest().content_scripts || [])
    .filter((cs) => cs.js.includes(script))
    .flatMap((cs) => cs.matches);
}

const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** manifest.json の書き方で URL を当てる。`*` は何文字でもよい */
const matchesAny = (url, patterns) =>
  patterns.some((p) => new RegExp("^" + p.split("*").map(escapeRe).join(".*") + "$").test(url));

// ---------- AutoPunch のページを中身で見分ける ----------

/**
 * 開いているページの中を読む（autopunch.js の関数をページへ送って動かす）。
 * 読めないページ（chrome:// など、Chrome が入らせないページ）では null。
 */
async function readAutoPunch(tab) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: globalThis.AutoPunchPage.read,
    });
    return (res && res.result) || null;
  } catch {
    return null;
  }
}

/** [12, 13] → "10/12・10/13"。4日以上は「10/12・10/13・10/14 ほか2日」 */
function dayList(days, ym) {
  const m = Number(ym.slice(5));
  const shown = days.slice(0, 3).map((d) => `${m}/${d}`).join("・");
  return days.length > 3 ? `${shown} ほか${days.length - 3}日` : shown;
}

// ---------- 報告サイトの作業報告書 ----------

async function onReport(tab, payload) {
  go.textContent = "AutoPunchから反映";
  go.disabled = true;

  const info = await ask(tab.id, { type: "ping" });
  if (!info) {
    say("ページを再読み込み（F5）してください", "err");
    return;
  }
  if (!info.screen) {
    go.textContent = "作業報告書を開いてください";
    hint("報告サイトの作業報告書（開始・終了を入れる表）で使えます。開いたばかりなら、表が出てからもう一度押してください。");
    return;
  }

  showPage(info);

  if (!payload) {
    say("先に AutoPunch の出力画面で「送る」を押してください", "err");
    return;
  }
  // 🔴 押す前に止める。押したあとも levtech.js がもう一度照合する
  if (!info.ym) {
    say(`この作業報告書の年月が読めません${info.period ? `（対象期間 ${info.period}）` : ""}`, "err");
    return;
  }
  if (info.ym !== payload.ym) {
    say(`この作業報告書は ${info.ym} です（覚えているのは ${payload.ym}）`, "err");
    return;
  }

  go.disabled = false;
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = "反映中…";
    say("");

    const res = await ask(tab.id, { type: "apply", payload });

    if (!res) {
      say("ページを再読み込み（F5）してください", "err");
    } else if (!res.ok) {
      say(failure(res, payload), "err");
    } else {
      const issues = [];
      if (res.missing.length) issues.push(`${dayList(res.missing, payload.ym)} は欄が見つかりません`);
      if (res.notKept.length) issues.push(`${dayList(res.notKept, payload.ym)} は値が残りませんでした`);
      if (res.notComputed.length) issues.push(`${dayList(res.notComputed, payload.ym)} は作業時間が計算されませんでした`);
      if (res.noNote.length) issues.push(`${dayList(res.noNote, payload.ym)} は作業内容が空です（必須）`);

      if (issues.length) {
        say(`⚠️ ${res.filled}日分を反映\n${issues.join("\n")}\n合計を AutoPunch と見比べてください`, "warn");
      } else {
        say(`✓ ${res.filled}日分を反映しました`, "ok");
      }
    }

    go.textContent = "AutoPunchから反映";
    go.disabled = false;
  };
  hint("🔴 保存は押しません。目で確かめてから「保存する」を押してください。");
}

/** 止まった理由を、押した人に分かる言葉にする */
function failure(res, payload) {
  if (res.reason === "月ちがい") return `この作業報告書は ${res.pageYm} です（覚えているのは ${payload.ym}）`;
  if (res.reason === "年月が読めない") {
    return `この作業報告書の年月が読めません${res.period ? `（対象期間 ${res.period}）` : ""}`;
  }
  return "作業報告書の画面で押してください";
}

// ---------- 入口 ----------

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = (tab && tab.url) || "";
  const stored = await chrome.storage.local.get(STORE_KEY);
  const payload = stored[STORE_KEY] || null;

  showMemo(payload);

  // --- 報告サイト ---
  // 先に見る。報告サイトのページの中は levtech.js が受け持つので、AutoPunch 用の関数は送らない
  if (matchesAny(url, patternsOf("levtech.js"))) {
    await onReport(tab, payload);
    return;
  }

  const page = await readAutoPunch(tab);

  // --- AutoPunch の出力画面（どこに置いた AutoPunch でも）---
  if (page && page.exportPage) {
    go.textContent = "この月を拡張に送る";
    go.disabled = false;
    go.onclick = async () => {
      go.disabled = true;
      // 押した瞬間の中身を読み直す（拡張が持つのは［送る］を押した瞬間の写し）
      const now = await readAutoPunch(tab);
      if (!now || !now.payload) {
        say("この画面から値を読めませんでした", "err");
        go.disabled = false;
        return;
      }
      await chrome.storage.local.set({ [STORE_KEY]: now.payload });
      showMemo(now.payload);
      say(`✓ ${now.payload.ym} を ${now.payload.days.length}日分 覚えました`, "ok");
      go.disabled = false;
    };
    hint("このあと報告サイトを開いて、もう一度このボタンから反映します。");
    return;
  }

  // --- AutoPunch の月間一覧（出力画面のひとつ手前）---
  // 「なぜ使えないのか」ではなく「どこを押せばいいか」を出す
  if (page && page.autoPunch) {
    go.textContent = "出力画面で使えます";
    go.disabled = true;
    hint("画面右上の［出力へ］を押してから、もう一度このボタンを押してください。");
    return;
  }

  // --- それ以外 ---
  go.textContent = "使えるページを開いてください";
  go.disabled = true;
  hint("AutoPunch の出力画面、または報告サイトの作業報告書の画面で使えます。");
}

main();
