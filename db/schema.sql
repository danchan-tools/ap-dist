-- ===================================================================
-- AutoPunch テーブル定義
--
-- 出典：docs/md/02_基本設計/02_データ設計.md §3
--       docs/md/02_基本設計/08_将来の拡張設計.md §2（複数案件）
-- 使い方：Neon の SQL Editor に貼り付けて、上から1回だけ流す
--
-- ⚠️ このファイルは2回流せない。
--    2回目は、最初の文で relation "projects" already exists のエラーになる。
--    失敗のあとも流し続けられても、データは変わらない（INSERT は表が空のときだけ・I-8）。
--
-- 📌 夜勤（終業を29:59まで）・複数案件・時給契約の形まで、すべてこのファイルに入っている。
--    新しいデータベースには、このファイルだけを流せばよい。
-- ===================================================================

-- -------------------------------------------------------------------
-- projects：案件
--   案件A・案件B を同時に持つための表（拡張1・2026-08-07）
--
--   📌 ここだけ連番（SMALLSERIAL）を使う。
--      ほかは「日付そのもの」が自然な主キーになるので連番を使わないが、
--      案件名は改名されうるので、名前を主キーにすると改名のたびに全行が動く
-- -------------------------------------------------------------------
CREATE TABLE projects (
  id          SMALLSERIAL  PRIMARY KEY,
  name        TEXT         NOT NULL UNIQUE,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  -- 終わった案件は隠すだけ。行は消さない（過去の勤務表が消えるため）
  archived    BOOLEAN      NOT NULL DEFAULT false,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- 空文字の案件名を許すと、プルダウンに何も出ない行ができる
  CONSTRAINT projects_name_not_blank CHECK (btrim(name) <> '')
);

-- 🔴 取引先の実名を書かない（01_要件定義/03_制約・非機能要件.md §2.1）。
--    実名にしたいときは、画面の ⚙設定 から改名する
-- 🆕 案件が1件も無いときだけ入れる（I-8・2026-10-05）。
--    間違えて2回流し、Neon が失敗のあとも続けて流しても、案件A が増えないようにするため
INSERT INTO projects (name, sort_order)
SELECT '案件A', 0
WHERE NOT EXISTS (SELECT 1 FROM projects);

-- -------------------------------------------------------------------
-- months：月ごとの設定
--   基本パターン（P-1）と契約条件（M-2）を月単位で持つ。
--   契約が変われば下限・上限・単価がすべて変わるため、
--   過去の月の金額が後から変わらないように月ごとに保存する（§2）
--
--   🔴 基準労働時間もここに持つ（拡張1・08 §6 #1）。
--      案件Aが8:00・案件Bが7:30 ということが起こるので全期間で1つは持てない。
--      案件ごとにすると、途中で変わったとき過去の月の残業時間まで遡って変わる
--
--   🔴 契約の種類も月ごと（拡張2・08 §4.1）。
--      「先月は月額、今月は時給」を許す。過去の月の金額を後から変えないため
-- -------------------------------------------------------------------
CREATE TYPE contract_kind AS ENUM ('月額', '時給');

CREATE TABLE months (
  project_id      SMALLINT     NOT NULL,
  year            SMALLINT     NOT NULL,
  month           SMALLINT     NOT NULL,

  -- 基本パターン（P-1 パネルの4項目）
  pattern_start   VARCHAR(5)   NOT NULL DEFAULT '09:30',
  pattern_end     VARCHAR(5)   NOT NULL DEFAULT '18:30',
  pattern_break   VARCHAR(5)   NOT NULL DEFAULT '01:00',
  pattern_place   TEXT         NOT NULL DEFAULT '在宅',

  -- 契約の種類（拡張2・003）。'月額' と '時給' の2つだけ
  contract_kind   contract_kind NOT NULL DEFAULT '月額',

  -- 契約条件（M-2 モーダル）。時間は「分」の整数で持つ
  -- 🔴 下限・上限は【任意】（拡張2・003）。NULL＝未入力。0以下は制約で弾く
  contract_lo     INTEGER,
  contract_hi     INTEGER,
  base_fee        INTEGER      NOT NULL,
  under_rate      INTEGER      NOT NULL,
  over_rate       INTEGER      NOT NULL,

  -- 時給（円／時。拡張2・003）。0 は「まだ入れていない」＝ C-6 が見張る
  -- 🔴 NOT NULL。「未入力」の表し方を NULL と 0 の2つに分裂させないため
  hourly_rate     INTEGER      NOT NULL DEFAULT 0,

  -- 残業時間の計算基準（1日8:00 ＝ 480分）
  base_work_minutes INTEGER    NOT NULL DEFAULT 480,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  PRIMARY KEY (project_id, year, month),
  -- 🔴 RESTRICT。CASCADE にすると、案件を1行消しただけで勤務表が全部消える
  CONSTRAINT months_project_fkey FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE RESTRICT,

  CONSTRAINT months_month_range     CHECK (month BETWEEN 1 AND 12),

  -- 🔴 契約の種類で条件を分ける（拡張2・003）。2本に分けると、どちらに弾かれたのか
  --    エラーメッセージから読み取れなくなるので1本にまとめてある
  CONSTRAINT months_contract_range CHECK (
    CASE contract_kind
      WHEN '月額' THEN
        -- 月額は下限・上限が必須。上限は下限より大きい
        contract_lo IS NOT NULL AND contract_lo > 0
        AND contract_hi IS NOT NULL AND contract_hi > contract_lo
      ELSE
        -- 時給はそれぞれ独立に任意。🔴 入っているなら 0 より大きい
        --    （0 を許すと「空」と「0」の2通りで未入力を表せてしまう）
        (contract_lo IS NULL OR contract_lo > 0)
        AND (contract_hi IS NULL OR contract_hi > 0)
        AND (contract_lo IS NULL OR contract_hi IS NULL OR contract_hi > contract_lo)
    END
  ),
  CONSTRAINT months_hourly_nonnegative CHECK (hourly_rate >= 0),

  -- 0 は「未入力」を表すので許す
  CONSTRAINT months_fee_nonnegative CHECK (base_fee >= 0 AND under_rate >= 0 AND over_rate >= 0),
  -- 0分や負の値を許すと、残業時間が勤務時間そのものになる
  CONSTRAINT months_base_work_positive CHECK (base_work_minutes > 0),

  -- 時刻は 'HH:MM' の形以外を受け付けない
  -- 📌 終業だけ 29:59 まで許す。夜勤（17:00〜26:00）を 26:00 と書くため
  CONSTRAINT months_pattern_time_format CHECK (
    pattern_start ~ '^([01][0-9]|2[0-4]):[0-5][0-9]$' AND
    pattern_end   ~ '^([01][0-9]|2[0-9]):[0-5][0-9]$' AND
    pattern_break ~ '^([01][0-9]|2[0-4]):[0-5][0-9]$'
  )
);

-- -------------------------------------------------------------------
-- days：日ごとの勤務
--   1日1行。月間一覧の表がそのまま行になる
--
--   📌 projects への外部キーは付けない。
--      days → months → projects の2段で保証されるので、直接つなぐと二重になる
-- -------------------------------------------------------------------
CREATE TYPE day_kind AS ENUM ('勤務', '休日', '休暇', '祝日');

CREATE TABLE days (
  project_id  SMALLINT     NOT NULL,
  year        SMALLINT     NOT NULL,
  month       SMALLINT     NOT NULL,
  day         SMALLINT     NOT NULL,

  kind        day_kind     NOT NULL,
  start_at    VARCHAR(5),
  end_at      VARCHAR(5),
  break_at    VARCHAR(5),
  place       TEXT,
  note        TEXT,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

  PRIMARY KEY (project_id, year, month, day),
  CONSTRAINT days_month_fkey FOREIGN KEY (project_id, year, month)
    REFERENCES months (project_id, year, month) ON DELETE CASCADE,
  CONSTRAINT days_day_range CHECK (day BETWEEN 1 AND 31),

  -- 区分が「勤務」のときだけ時刻と場所を持つ（それ以外は必ず空）
  -- ⚠️ 保存前に、勤務以外なら start_at/end_at/break_at/place を NULL に落とすこと
  CONSTRAINT days_work_has_times CHECK (
    (kind =  '勤務' AND start_at IS NOT NULL AND end_at IS NOT NULL)
    OR
    (kind <> '勤務' AND start_at IS NULL AND end_at IS NULL
                    AND break_at IS NULL AND place IS NULL)
  ),

  -- 時刻の形（NULL は許す）。これがないと空文字の行が入る
  -- 📌 終業だけ 29:59 まで許す。夜勤（17:00〜26:00）を 26:00 と書くため。
  --    始業まで広げると「終了＜開始」の打ち間違いを見逃しやすくなるので広げない
  CONSTRAINT days_time_format CHECK (
    (start_at IS NULL OR start_at ~ '^([01][0-9]|2[0-4]):[0-5][0-9]$') AND
    (end_at   IS NULL OR end_at   ~ '^([01][0-9]|2[0-9]):[0-5][0-9]$') AND
    (break_at IS NULL OR break_at ~ '^([01][0-9]|2[0-4]):[0-5][0-9]$')
  )
);

-- -------------------------------------------------------------------
-- 📌 settings テーブルは廃止した（拡張1・2026-08-07）。
--    唯一の中身だった基準労働時間が months へ移り、空の表になったため
--    （08_将来の拡張設計.md §6 #1）。
-- -------------------------------------------------------------------
