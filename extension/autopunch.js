// ===================================================================
// AutoPunch 側（出力画面 S-4）を読む部分
//
// やること：小窓を開いたときと［この月を拡張に送る］を押したときに、
//           開いているページの中から、その月の分を読む
//
// 🔴 AutoPunch の場所（URL）は、どこにも書かない（2026-10-02・B-6）。
//    2026-10-01 までは、manifest.json に段木さんの場所を書き、そこでだけページに入っていた。
//    買った人は自分の場所に置くので、その出力画面では［送る］が押せなかった。
//    いまは、小窓を開いたときだけ Chrome が許すそのページへの出入り（activeTab）を使い、
//    ページの中に「送るデータの置き場所」があるかで出力画面を見分ける（B-5 と同じく、場所ではなく中身で見る）。
//
// 🔴 このファイルは小窓（popup.html）が読み込み、関数をページの中へ送って動かす。
//    Chrome は関数を文字に直して送るので、関数の外の名前（変数・ほかの関数）を使えない。
//
// 🔴 ページは読むだけ。画面には何も足さない（2026-08-07 の方針変更）。
//    返すのは「出力画面か」「AutoPunch のページか」と、出力画面なら 開始・終了・休憩・作業内容 の4つだけ。
//    単価・見込み金額・契約時間は、そもそもページに出していない（02_基本設計/07_ブラウザ拡張設計.md §6.2）
// ===================================================================

(() => {
  /** 開いているページの中で動く。返すのは { exportPage, payload, autoPunch } */
  function readAutoPunchPage() {
    // 出力画面にだけある、送るデータの置き場所（src/components/ExportView.tsx）
    const el = document.getElementById("autopunch-transfer");
    if (el) {
      let payload = null;
      try {
        payload = JSON.parse(el.dataset.payload || "");
      } catch {
        payload = null;
      }
      return { exportPage: true, payload, autoPunch: true };
    }
    // 月間一覧など、出力画面以外の AutoPunch のページ（ページの題名は src/app/layout.tsx）
    return { exportPage: false, payload: null, autoPunch: document.title === "AutoPunch" };
  }

  globalThis.AutoPunchPage = { read: readAutoPunchPage };
})();
