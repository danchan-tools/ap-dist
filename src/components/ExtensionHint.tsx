// ===================================================================
// 出力画面（S-4）の「② 報告サイトに転記する」に出す、ブラウザ拡張（F-7）の案内（2026-10-02・I-6）
//
// 拡張を入れた人が、ボタンの場所と押す順番を画面で分かるようにする。
// 拡張を入れていない人は読み飛ばせるよう、「入れている場合は」と書く。
//
// 🔴 ボタン名は、拡張の小窓（extension/popup.js）の表示と同じにする。
//    違うと、案内どおりに探しても見つからない。ExtensionHint.test.tsx が見張る。
//
// 📌 「A」のボタンは、拡張に絵を付けていないので Chrome が名前の頭文字で出しているもの。
//    拡張に絵を付けたら、ここも直す。
// ===================================================================

/** 拡張の小窓のボタン名（extension/popup.js と同じ） */
export const EXT_SEND_LABEL = "この月を拡張に送る";
export const EXT_APPLY_LABEL = "AutoPunchから反映";

/** 押すボタンの名前を、ボタンらしく囲んで出す */
function KeyLabel({ children }: { children: string }) {
  return (
    <span className="inline-block px-1.5 border border-blue-300 rounded bg-white font-bold leading-6">
      {children}
    </span>
  );
}

export default function ExtensionHint() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-2.5 text-xs text-blue-900 leading-7">
      <div className="font-bold">🧩 拡張を入れている場合は、写さずにまとめて入れられます</div>
      <div>
        ① この画面で、ブラウザ右上の「A」のボタン → <KeyLabel>{EXT_SEND_LABEL}</KeyLabel>
      </div>
      <div>
        ② 報告サイトの作業報告書で、もう一度「A」のボタン → <KeyLabel>{EXT_APPLY_LABEL}</KeyLabel>
      </div>
      <div className="text-ads-muted">
        目で確かめてから、報告サイトの「保存する」を押してください（拡張は保存を押しません）
      </div>
    </div>
  );
}
