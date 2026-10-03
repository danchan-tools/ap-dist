// ===================================================================
// AutoPunch で扱うデータの形
//
// 名前は DB の列名（02_基本設計/02_データ設計.md §3）に合わせてある。
//   start_at → startAt     end_at → endAt     break_at → breakAt
// プロトタイプは start / end / brk だったが、DB と揃えたほうが
// 「どっちの名前だったか」を毎回考えずに済む（同 §7 の対応表）。
// ===================================================================

/** 区分。03_業務ロジック設計 §2 の4種類 */
export type DayKind = "勤務" | "休日" | "休暇" | "祝日";

/**
 * 1日分の勤務。
 * ⚠️ kind が「勤務」以外のとき、時刻と場所は必ず null。
 *    DB の days_work_has_times 制約に弾かれるため、保存前に落とすこと。
 */
export type Day = {
  kind: DayKind;
  /** 始業 'HH:MM' */
  startAt?: string | null;
  /** 終業 'HH:MM' */
  endAt?: string | null;
  /** 休憩 'HH:MM' */
  breakAt?: string | null;
  /** 作業場所（在宅／客先／その他） */
  place?: string | null;
  /** 備考。勤務日は作業内容、祝日は祝日名、休暇は理由 */
  note?: string | null;
  /**
   * 🔴 DB に記録が無く、土日・祝日として**自動で補った日**（2026-08-08 追加）。
   *
   * 読み込みのときに `fillOffDays()` が付ける。**DB には保存されない。**
   * これが無いと「まだ何も入力していない月」と
   * 「全日を休暇にした月」の区別がつかなくなる（`isEmptyMonth`）。
   */
  auto?: boolean;
};

/** その月の日。キーは 1〜31。行がない日は「未設定」 */
export type DayMap = Record<number, Day | undefined>;

/** 基本パターン（P-1 パネルの4項目） */
export type Pattern = {
  start: string;
  end: string;
  brk: string;
  place: string;
};

/**
 * 契約の種類（拡張2・08_将来の拡張設計.md §3.2）。
 *
 * 📌 3つ目を足さない。月額と時給の併用（固定費＋従量）も作らない（同 §5）。
 *    出てきてから足す。
 */
export type ContractKind = "月額" | "時給";

/**
 * 契約条件（M-2 モーダル）。**月ごと**に持つ。
 * 契約が変われば全部変わるため（03_業務ロジック設計 §7.4）。
 *
 * 🔴 実額をコードに書かないこと（01_要件定義/03_制約・非機能要件 §2.1）。
 */
export type Contract = {
  /** 月額か時給か（拡張2） */
  kind: ContractKind;
  /**
   * 契約の下限（分）。
   *
   * 🔴 `null` は「未入力」。**0 は使わない**（拡張2・§3.3 ②）。
   *    「空」と「0」の2通りで未入力を表せると、画面・API・計算のそれぞれで
   *    2種類の判定が要り、必ずどこかが片方を見落とす。
   *    DB の `months_contract_range` が 0 を弾くので、ここは null だけ見ればよい。
   *
   * 月額契約では必ず入っている（DBが必須にしている）。
   */
  lo: number | null;
  /** 契約の上限（分）。`null` は未入力。下限と**独立に**任意（拡張2） */
  hi: number | null;
  /** 月額の基本単価（円）。時給契約では使わない */
  base: number;
  /** 控除単価（円／時）。時給契約では使わない */
  underRate: number;
  /** 超過単価（円／時）。時給契約では使わない */
  overRate: number;
  /**
   * 時給（円／時）。時給契約でだけ使う。
   *
   * 🔴 `0` は「まだ入れていない」。`null` にしない（上と逆なので注意）。
   *    月額から時給へ切り替えると**必ず一度この状態を通る**ので、
   *    C-6 が見張る（08 §3.5）。
   */
  hourlyRate: number;
};

/**
 * 案件（projects テーブル）。拡張1・2026-08-07。
 *
 * 🔴 name に取引先の実名を書いたものを、コードや移行SQLに残さない
 *    （01_要件定義/03_制約・非機能要件.md §2.1）。実名は画面から入れる。
 */
export type Project = {
  id: number;
  name: string;
  /** 切り替えの並び順 */
  sortOrder: number;
  /** 終わった案件。プルダウンの下に畳む。**行は消さない** */
  archived: boolean;
};

/** 1か月分。months テーブル1行＋その月の days */
export type MonthData = {
  /** どの案件の月か（拡張1） */
  projectId: number;
  /** 画面とExcelのファイル名に出す案件名 */
  projectName: string;
  year: number;
  month: number;
  pattern: Pattern;
  contract: Contract;
  /**
   * 基準労働時間（分）。既定 480 ＝ 8:00。
   *
   * 🔴 **月ごとに持つ**（拡張1・08_将来の拡張設計.md §6 #1）。
   *    案件Aが8:00・案件Bが7:30 ということが起こるので、全期間で1つは持てない。
   *    案件ごとにすると、途中で変わったとき過去の月の残業時間まで遡って変わる。
   */
  baseWorkMinutes: number;
  days: DayMap;
};
