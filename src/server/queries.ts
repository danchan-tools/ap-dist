// ===================================================================
// SQL（02_基本設計/02_データ設計.md §5・08_将来の拡張設計.md §2）
//
// 設計書に書いてあるSQLを、そのまま関数にしたもの。
// SQLを書くのはこのファイルだけにする。画面側にSQLを散らさない。
//
// 🔴 拡張1（2026-08-07）で、すべての月・日に【案件】が付いた。
//    月と日を読み書きする関数は、必ず projectId で絞ること。
//    絞り忘れても**エラーにならず、案件Aの値が案件Bに漏れる**（08 §2.5 ①）。
// ===================================================================

import { fillOffDays, toDbRow } from "@/lib/apply";
import { monthIndex, type YearMonth } from "@/lib/carryOver";
import { DEFAULT_BASE_WORK_MINUTES, DEFAULT_HI, DEFAULT_LO } from "@/lib/constants";
import type {
  Contract,
  ContractKind,
  DayKind,
  DayMap,
  MonthData,
  Pattern,
  Project,
} from "@/lib/types";
import { query, transaction } from "./db";
import { SchemaError } from "./failure";

type ProjectRow = {
  id: number;
  name: string;
  sort_order: number;
  archived: boolean;
};

type MonthRow = {
  project_id: number;
  year: number;
  month: number;
  pattern_start: string;
  pattern_end: string;
  pattern_break: string;
  pattern_place: string;
  /** 拡張2。'月額' か '時給' */
  contract_kind: ContractKind;
  /** 🔴 拡張2で NULL 可になった（未入力）。0 は DB の制約が弾く */
  contract_lo: number | null;
  contract_hi: number | null;
  base_fee: number;
  under_rate: number;
  over_rate: number;
  /** 拡張2。円／時。0 は「まだ入れていない」 */
  hourly_rate: number;
  base_work_minutes: number;
};

type DayRow = {
  day: number;
  kind: DayKind;
  start_at: string | null;
  end_at: string | null;
  break_at: string | null;
  place: string | null;
  note: string | null;
};

/**
 * 引き継ぎ INSERT でコピーする列。
 *
 * 🔴 列を足したら、ここにも足すこと（08 §2.5 ②）。
 *    足し忘れると、翌月がその列だけ既定値で作られる。
 *    エラーにならないので気づけない：
 *      base_work_minutes を忘れる → 翌月の基準労働時間が 480分（8:00）に戻る
 *      contract_kind    を忘れる → **時給契約が翌月に黙って月額へ戻る**（08 §3.3 ①）
 *      hourly_rate      を忘れる → 翌月の時給が 0 に戻る（C-6 が鳴るので気づけはする）
 */
const MONTH_COLS = [
  "project_id",
  "year",
  "month",
  "pattern_start",
  "pattern_end",
  "pattern_break",
  "pattern_place",
  "contract_kind",
  "contract_lo",
  "contract_hi",
  "base_fee",
  "under_rate",
  "over_rate",
  "hourly_rate",
  "base_work_minutes",
] as const;

const MONTH_COLUMNS = MONTH_COLS.join(", ");

/**
 * 引き継ぎ INSERT の SELECT 側。
 *
 * 🔴 **`MONTH_COLS` から組み立てる**（2026-08-08）。
 *    もとは同じ並びを手で2度書いていた。拡張2で列を2つ足したとき、
 *    `MONTH_COLUMNS`（列の側）だけ直して**こちらを直し忘れ、**
 *    列15個に対して値13個の INSERT になっていた。
 *
 *    Postgres は `INSERT has more target columns than expressions` で落ちるので
 *    静かには壊れないが、**新しい月を作る経路すべてが 500 になる。**
 *    画面には「保存できませんでした」としか出ない。
 *
 *    2度書かなければ、ずれようがない。
 *
 * 📌 先頭3つ（案件・年・月）だけは、コピー元ではなく引数の値を入れる。
 */
const INHERIT_SELECT = ["$1::int", "$2::int", "$3::int", ...MONTH_COLS.slice(3)].join(", ");

/**
 * 前の月が1つも無いときに入れる既定値。**`MONTH_COLS` と同じ順・同じ数。**
 *
 * 🔴 単価の既定値は 0。実額をコードに書かないため
 *    （01_要件定義/03_制約・非機能要件.md §2.1）。初回は ⚙契約条件 から入力する。
 */
const DEFAULT_MONTH_VALUES = [
  "$1",
  "$2",
  "$3",
  "'09:30'",
  "'18:30'",
  "'01:00'",
  "'在宅'",
  "'月額'",
  String(DEFAULT_LO),
  String(DEFAULT_HI),
  "0",
  "0",
  "0",
  "0",
  "$4",
];

// 🔴 読み込んだ瞬間に数を突き合わせる。
//    列を足して既定値を足し忘れたら、**アプリが起動した時点で落ちる。**
//    DBに触るまで気づけない形にしておくと、9月になって初めて壊れる。
if (DEFAULT_MONTH_VALUES.length !== MONTH_COLS.length) {
  throw new Error(
    `months の列（${MONTH_COLS.length}）と既定値（${DEFAULT_MONTH_VALUES.length}）の数が合っていません`,
  );
}

const PROJECT_COLUMNS = `id, name, sort_order, archived`;

function toPattern(row: MonthRow): Pattern {
  return {
    start: row.pattern_start,
    end: row.pattern_end,
    brk: row.pattern_break,
    place: row.pattern_place,
  };
}

function toContract(row: MonthRow): Contract {
  return {
    kind: row.contract_kind,
    lo: row.contract_lo,
    hi: row.contract_hi,
    base: row.base_fee,
    underRate: row.under_rate,
    overRate: row.over_rate,
    hourlyRate: row.hourly_rate,
  };
}

function toProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, archived: row.archived };
}

// -------------------------------------------------------------------
// 案件（拡張1・08 §2.3）
// -------------------------------------------------------------------

/** 案件を並び順で全部読む（隠したものも含む。プルダウンの下に畳んで出すため） */
export async function loadProjects(): Promise<Project[]> {
  const rows = await query<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY archived, sort_order, id`,
  );
  return rows.map(toProject);
}

export async function findProject(id: number): Promise<Project | null> {
  const rows = await query<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1`, [
    id,
  ]);
  return rows[0] ? toProject(rows[0]) : null;
}

/**
 * 画面を開くときに使う案件を決める。
 *
 * ① URLで指定された案件があれば、それ
 * ② 無ければ、隠していない案件のうち先頭
 * ③ 隠していない案件が1つも無ければ、隠したものも含めた先頭
 *
 * 🔴 案件が1つも無いDBは、拡張1の移行が済んでいない状態。
 *    ここで作らずに、はっきり落とす（黙って作ると原因が見えなくなる）。
 */
export async function resolveProject(wanted: number | null): Promise<Project> {
  const all = await loadProjects();
  if (all.length === 0) {
    // E-204（D-7）。手順書の SQL を流していないと、案件が1件も無い
    throw new SchemaError(
      "案件が1件も登録されていません。db/schema.sql を流したか確認してください",
    );
  }
  if (wanted != null) {
    const found = all.find((p) => p.id === wanted);
    if (found) return found;
  }
  return all.find((p) => !p.archived) ?? all[0];
}

/** 案件を足す。既定値は「隠していない案件の末尾」に置く */
export async function createProject(name: string): Promise<Project> {
  const rows = await query<ProjectRow>(
    `INSERT INTO projects (name, sort_order)
     VALUES ($1, COALESCE((SELECT max(sort_order) + 1 FROM projects), 0))
     RETURNING ${PROJECT_COLUMNS}`,
    [name],
  );
  return toProject(rows[0]);
}

/**
 * 案件の名前・表示／非表示を変える。
 *
 * 📌 消す機能は作らない（08 §5）。過去の勤務表が消えるため、隠すだけにする。
 *    DB側も ON DELETE RESTRICT にしてある。
 */
export async function updateProject(
  id: number,
  patch: { name?: string; archived?: boolean },
): Promise<Project | null> {
  const rows = await query<ProjectRow>(
    `UPDATE projects
        SET name     = COALESCE($2, name),
            archived = COALESCE($3, archived),
            updated_at = now()
      WHERE id = $1
      RETURNING ${PROJECT_COLUMNS}`,
    [id, patch.name ?? null, patch.archived ?? null],
  );
  return rows[0] ? toProject(rows[0]) : null;
}

// -------------------------------------------------------------------
// §5.1 月を開く（前の月の設定を引き継ぐ）
// -------------------------------------------------------------------

/** その月の設定を「読むだけ」。行が無ければ null。**書き込まない** */
async function findMonthRow(
  projectId: number,
  year: number,
  month: number,
): Promise<MonthRow | null> {
  const found = await query<MonthRow>(
    `SELECT ${MONTH_COLUMNS} FROM months WHERE project_id = $1 AND year = $2 AND month = $3`,
    [projectId, year, month],
  );
  return found[0] ?? null;
}

/**
 * 引き継ぎ元になる「その月より前で最も新しい月」を読む。**書き込まない**。
 *
 * 🔴 project_id で絞ることが必須（08 §2.5 ①）。
 *    絞らないと、案件Bの最初の月に**案件Aの単価で計算した金額**が画面に出る。
 *    DBには残らないので、あとから追いかけられない。
 */
async function findPreviousMonthRow(
  projectId: number,
  year: number,
  month: number,
): Promise<MonthRow | null> {
  const found = await query<MonthRow>(
    `SELECT ${MONTH_COLUMNS} FROM months
      WHERE project_id = $1::int
        AND (year * 12 + month) < ($2::int * 12 + $3::int)
      ORDER BY year DESC, month DESC
      LIMIT 1`,
    [projectId, year, month],
  );
  return found[0] ?? null;
}

async function ensureMonthRow(projectId: number, year: number, month: number): Promise<MonthRow> {
  const found = await findMonthRow(projectId, year, month);
  if (found) return found;

  // 引き継ぎ INSERT：同じ案件の、それより前で最も新しい月の設定をコピーする
  //
  // 🔴 `$1::int` のキャストは省略できない。
  //    付けないと inconsistent types deduced for parameter $1 で落ちる
  //    （SELECT側は smallint、WHERE側は integer と推論されるため）
  const inherited = await query<MonthRow>(
    `INSERT INTO months (${MONTH_COLUMNS})
     SELECT ${INHERIT_SELECT}
     FROM months
     WHERE (project_id, year, month) = (
       SELECT project_id, year, month FROM months
       WHERE project_id = $1::int
         AND (year * 12 + month) < ($2::int * 12 + $3::int)
       ORDER BY year DESC, month DESC
       LIMIT 1
     )
     ON CONFLICT (project_id, year, month) DO NOTHING
     RETURNING ${MONTH_COLUMNS}`,
    [projectId, year, month],
  );
  if (inherited.length > 0) return inherited[0];

  // §5.1-2 前の月が1つもないとき。引き継ぐ元がなかっただけで、異常ではない
  const created = await query<MonthRow>(
    `INSERT INTO months (${MONTH_COLUMNS})
     VALUES (${DEFAULT_MONTH_VALUES.join(", ")})
     ON CONFLICT (project_id, year, month) DO NOTHING
     RETURNING ${MONTH_COLUMNS}`,
    [projectId, year, month, DEFAULT_BASE_WORK_MINUTES],
  );
  if (created.length > 0) return created[0];

  // ⚠️ ここに来るのは、SELECT と INSERT のあいだに
  //    別のリクエストが同じ月を作ったとき（2つのタブで同じ新しい月を開いた等）。
  //    ON CONFLICT で衝突を避けたので、相手が作った行を読み直す
  const raced = await findMonthRow(projectId, year, month);
  if (raced) return raced;
  throw new Error(`${year}年${month}月の設定を用意できませんでした`);
}

/**
 * 月の設定を「読むだけ」で組み立てる。**DBに書き込まない。**
 *
 * 🔴 画面を開くだけ（GET）で行を作ってはいけない。
 *    「▶」で来月・再来月を眺めただけで、その月の契約条件が
 *    **その時点の値で固定されてしまう**（あとで契約が変わっても直らない）。
 *    行を作るのは、保存する操作（一括反映・日次保存・契約条件）のときだけ。
 */
async function readMonthRow(projectId: number, year: number, month: number): Promise<MonthRow> {
  const found = await findMonthRow(projectId, year, month);
  if (found) return found;

  // まだ無い月は、同じ案件の前の月の条件を「表示のためだけに」引き継ぐ
  const prev = await findPreviousMonthRow(projectId, year, month);
  if (prev) return { ...prev, project_id: projectId, year, month };

  // 前の月も無ければ既定値。単価は 0（実額をコードに書かないため）
  return {
    project_id: projectId,
    year,
    month,
    pattern_start: "09:30",
    pattern_end: "18:30",
    pattern_break: "01:00",
    pattern_place: "在宅",
    // 📌 新しい案件・新しい月は「月額」から始める（拡張2）。
    //    時給契約なら ⚙契約条件 で切り替える。DB の DEFAULT とも揃えてある
    contract_kind: "月額",
    // 🔴 8400／10800 と直に書かない。`constants.ts` の1か所に集める
    contract_lo: DEFAULT_LO,
    contract_hi: DEFAULT_HI,
    base_fee: 0,
    under_rate: 0,
    over_rate: 0,
    hourly_rate: 0,
    base_work_minutes: DEFAULT_BASE_WORK_MINUTES,
  };
}

async function loadDays(projectId: number, year: number, month: number): Promise<DayMap> {
  const rows = await query<DayRow>(
    `SELECT day, kind, start_at, end_at, break_at, place, note
       FROM days WHERE project_id = $1 AND year = $2 AND month = $3 ORDER BY day`,
    [projectId, year, month],
  );

  const days: DayMap = {};
  for (const r of rows) {
    days[r.day] = {
      kind: r.kind,
      startAt: r.start_at,
      endAt: r.end_at,
      breakAt: r.break_at,
      place: r.place,
      note: r.note,
    };
  }

  // 🔴 記録が無い日に、土日・祝日だけを補う（2026-08-08 追加）。
  //
  //    「営業日すべてに反映する」を押していなくても、土日と祝日は入っている状態にする。
  //
  //    🔴 ここでしか補わない。`loadMonth()` は画面・出力画面・Excel・AI・保存API の
  //       **5つすべての入口**なので、1か所直せば全部そろう。
  //       画面側で補うと、Excel との答えが違ってくる。
  //    🔴 保存はしない。**読むときに補うだけ**（`fillOffDays` の注記）。
  return fillOffDays(year, month, days);
}

/**
 * その月の行が `months` にあることを保証する。
 * `days` を触る前に必ず呼ぶ（外部キーがあるため）。
 */
export async function ensureMonth(projectId: number, year: number, month: number): Promise<void> {
  await ensureMonthRow(projectId, year, month);
}

/**
 * 月間一覧（S-3）を開くときに必要なものを、まとめて読む。
 * **読むだけ。DBには書き込まない**（`readMonthRow` の注記を参照）。
 */
export async function loadMonth(
  project: Project,
  year: number,
  month: number,
): Promise<MonthData> {
  const row = await readMonthRow(project.id, year, month);
  return {
    projectId: project.id,
    projectName: project.name,
    year,
    month,
    pattern: toPattern(row),
    contract: toContract(row),
    baseWorkMinutes: row.base_work_minutes,
    days: await loadDays(project.id, year, month),
  };
}

// -------------------------------------------------------------------
// §5.2 営業日すべてに反映する（F-2）
// -------------------------------------------------------------------

/**
 * 基本パターンを保存し、その月の日をまるごと置き換える。
 *
 * 🔴 3つの文を、必ず1つのトランザクションで囲む。
 *    ②で消した直後に落ちると、その月のデータが消えたままになる。
 */
export async function applyPattern(
  projectId: number,
  year: number,
  month: number,
  pattern: Pattern,
  days: DayMap,
): Promise<void> {
  // UNNEST に渡す配列。**長さをすべて揃えること**
  // 食い違うと短いほうが NULL 埋めされ、NOT NULL 違反で落ちる
  const dayNums: number[] = [];
  const kinds: string[] = [];
  const starts: (string | null)[] = [];
  const ends: (string | null)[] = [];
  const breaks: (string | null)[] = [];
  const places: (string | null)[] = [];
  const notes: (string | null)[] = [];

  for (const key of Object.keys(days)) {
    const d = Number(key);
    const day = days[d];
    if (!day) continue;
    const row = toDbRow(day); // 勤務以外は時刻と場所を NULL に落とす
    dayNums.push(d);
    kinds.push(row.kind);
    starts.push(row.startAt);
    ends.push(row.endAt);
    breaks.push(row.breakAt);
    places.push(row.place);
    notes.push(row.note);
  }

  await transaction(async (run) => {
    // ① 基本パターンを保存する
    await run(
      `UPDATE months
          SET pattern_start = $4, pattern_end = $5, pattern_break = $6, pattern_place = $7,
              updated_at = now()
        WHERE project_id = $1 AND year = $2 AND month = $3`,
      [projectId, year, month, pattern.start, pattern.end, pattern.brk, pattern.place],
    );

    // ② その月の日をいったん全部消す
    //    🔴 project_id を落とすと、他の案件の同じ月まで消える
    await run(`DELETE FROM days WHERE project_id = $1 AND year = $2 AND month = $3`, [
      projectId,
      year,
      month,
    ]);

    // ③ 1か月分を一括で入れる
    //    UNNEST は「列ごとに配列を渡すと、横に並べ直して行にしてくれる」書き方
    await run(
      `INSERT INTO days (project_id, year, month, day, kind, start_at, end_at, break_at, place, note)
       SELECT $1::smallint, $2::smallint, $3::smallint, *
         FROM UNNEST(
           $4::smallint[],   -- day
           $5::day_kind[],   -- kind
           $6::varchar[],    -- start_at
           $7::varchar[],    -- end_at
           $8::varchar[],    -- break_at
           $9::text[],       -- place
           $10::text[]       -- note
         )`,
      [projectId, year, month, dayNums, kinds, starts, ends, breaks, places, notes],
    );
  });
}

// -------------------------------------------------------------------
// §5.3 1日分の保存（F-3）
// -------------------------------------------------------------------

export async function saveDay(
  projectId: number,
  year: number,
  month: number,
  day: number,
  input: {
    kind: string;
    startAt?: string | null;
    endAt?: string | null;
    breakAt?: string | null;
    place?: string | null;
    note?: string | null;
  },
): Promise<void> {
  // ⚠️ 区分が「勤務」以外なら、時刻と場所を NULL に落としてから渡す
  const row = toDbRow(input);
  await query(
    `INSERT INTO days (project_id, year, month, day, kind, start_at, end_at, break_at, place, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (project_id, year, month, day) DO UPDATE SET
       kind = EXCLUDED.kind,
       start_at = EXCLUDED.start_at,
       end_at = EXCLUDED.end_at,
       break_at = EXCLUDED.break_at,
       place = EXCLUDED.place,
       note = EXCLUDED.note,
       updated_at = now()`,
    [projectId, year, month, day, row.kind, row.startAt, row.endAt, row.breakAt, row.place, row.note],
  );
}

/**
 * 1日ぶんの記録を消す（I-2「この日をクリア」・2026-08-29）。
 *
 * 🔴 「空にする」ではなく「行ごと消す」。
 *    `loadDays` は記録が無い日に土日と祝日だけを補うので、消したあとは
 *      平日     → 空欄（未入力）
 *      土日     → 「休日」（自動）
 *      祝日     → 「祝日」＋祝日名（自動）
 *    に戻る。つまり「営業日すべてに反映する」を押す前の状態になる。
 *
 *    区分を「休日」に書き換える形にすると、行が残るので
 *    「自分で休日にした日」と「まだ入れていない日」を見分けられなくなる。
 *
 * 📌 消す行が無くても成功として扱う。
 *    利用者から見れば「その日が空になった」という結果は同じで、
 *    押し直しただけで失敗が出るのは分かりにくい。
 */
export async function deleteDay(
  projectId: number,
  year: number,
  month: number,
  day: number,
): Promise<void> {
  await query(
    `DELETE FROM days WHERE project_id = $1 AND year = $2 AND month = $3 AND day = $4`,
    [projectId, year, month, day],
  );
}

/**
 * 複数の日を、まとめて上書きする（F-10 の「反映する」／06_AIアシスタント設計 §6.2）。
 *
 * 🔴 一括反映（`applyPattern`）と違い、**DELETE しない。**
 *    送っていない日には触らない。AIの提案は月の一部だけを直すものなので、
 *    ここで月をまるごと置き換えたら、直していない日まで消える。
 *
 * 🔴 トランザクションで囲む。
 *    3日ぶんの2日目で失敗して、中途半端に保存されるのを防ぐ。
 */
export async function saveDays(
  projectId: number,
  year: number,
  month: number,
  rows: {
    day: number;
    kind: string;
    startAt?: string | null;
    endAt?: string | null;
    breakAt?: string | null;
    place?: string | null;
    note?: string | null;
  }[],
): Promise<void> {
  await transaction(async (run) => {
    for (const input of rows) {
      // ⚠️ 区分が「勤務」以外なら、時刻と場所を NULL に落としてから渡す
      const r = toDbRow(input);
      await run(
        `INSERT INTO days (project_id, year, month, day, kind, start_at, end_at, break_at, place, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (project_id, year, month, day) DO UPDATE SET
           kind = EXCLUDED.kind,
           start_at = EXCLUDED.start_at,
           end_at = EXCLUDED.end_at,
           break_at = EXCLUDED.break_at,
           place = EXCLUDED.place,
           note = EXCLUDED.note,
           updated_at = now()`,
        [
          projectId,
          year,
          month,
          input.day,
          r.kind,
          r.startAt,
          r.endAt,
          r.breakAt,
          r.place,
          r.note,
        ],
      );
    }
  });
}

// -------------------------------------------------------------------
// §5.4 契約条件を保存する（F-9）
// -------------------------------------------------------------------

/**
 * この月より後ろにある、保存済みの月（B-3・2026-09-15）。**書き込まない。**
 *
 * ⚙契約条件の「先の月にも反映する（勤務や設定を入れたことがある月）」に並べる。
 *
 * 🔴 project_id で絞る。絞らないと、別の案件の月が反映先の候補に出る（08 §2.5 ① と同じ形）。
 */
export async function loadLaterSavedMonths(
  projectId: number,
  year: number,
  month: number,
): Promise<YearMonth[]> {
  const rows = await query<{ year: number; month: number }>(
    `SELECT year, month FROM months
      WHERE project_id = $1::int
        AND (year * 12 + month) > ($2::int * 12 + $3::int)
      ORDER BY year, month`,
    [projectId, year, month],
  );
  return rows.map((r) => ({ year: r.year, month: r.month }));
}

/**
 * 契約条件と基準労働時間を保存する。**どちらも月ごと**（拡張1）。
 *
 * 📌 拡張1の前は、基準労働時間だけ settings テーブル（全期間で共通）にあり、
 *    2つの文をトランザクションで囲む必要があった。
 *    月ごとになったので**1文で済む**（08 §6 #1「ここは簡単になる」）。
 *
 * 🔴 B-3（2026-09-15）：`carryTo` の月にも、同じ設定を書き込む。
 *    ⚙契約条件の「先の月にも反映する」でチェックした月（勤務や設定を入れたことがある月）。
 *    UPDATE なので、書き込むのは**すでに行がある月だけ**。行の無い月は作らない。
 *    行の無い月は、保存するときに前の月から引き継ぐので、それで足りる。
 *
 * 🔴 この月より前には、SQL の側でも書き込めないようにしてある（最後の砦）。
 *    API でも弾いているが（`parseCarryTargets`）、前の月が変わると提出済みの金額が変わる。
 *
 * 📌 1文の UPDATE なので、途中で落ちて一部の月だけ変わることは無い。
 *
 * @returns 実際に書き込めた先の月（この月は含めない）。古い順
 */
export async function saveContract(
  projectId: number,
  year: number,
  month: number,
  c: Contract,
  baseWorkMinutes: number,
  carryTo: YearMonth[],
): Promise<YearMonth[]> {
  // 書き込む月を「年×12＋月」の数で持つ。先頭は必ずこの月
  const targets = [monthIndex({ year, month }), ...carryTo.map(monthIndex)];

  const rows = await query<{ year: number; month: number }>(
    `UPDATE months
        SET contract_kind = $4,
            contract_lo = $5, contract_hi = $6,
            base_fee = $7, under_rate = $8, over_rate = $9,
            hourly_rate = $10,
            base_work_minutes = $11,
            updated_at = now()
      WHERE project_id = $1
        AND (year * 12 + month) = ANY($12::int[])
        AND (year * 12 + month) >= ($2::int * 12 + $3::int)
      RETURNING year, month`,
    // 🔴 lo・hi は null をそのまま渡す（拡張2）。0 に置き換えないこと。
    //    0 にすると DB の months_contract_range が弾く（そういう制約にしてある）
    [
      projectId,
      year,
      month,
      c.kind,
      c.lo,
      c.hi,
      c.base,
      c.underRate,
      c.overRate,
      c.hourlyRate,
      baseWorkMinutes,
      targets,
    ],
  );

  return rows
    .map((r) => ({ year: r.year, month: r.month }))
    .filter((r) => !(r.year === year && r.month === month))
    .sort((a, b) => monthIndex(a) - monthIndex(b));
}
