# 実現損益ビューア MVP仕様

## 概要

実現損益CSVを取り込んだSQLiteデータベースをもとに、投資成績の概要、推移、銘柄別成績、取引明細を確認できるローカルWebアプリを作る。

MVPでは「現在の成績を素早く把握する」「損益の推移を見る」「どの銘柄で勝ち負けしているかを見る」「元データを検索・確認する」ことを主目的にする。

画面上部の「データ更新」から実現損益CSVをアップロードし、SQLiteデータベースをフル再取込できる。

## 対象データ

初期データベース:

```text
/home/shingo/data/realized_pl_jp_20260423_183041.sqlite3
```

対象テーブル:

```text
realized_pl
```

主なカラム:

| カラム | 型 | 内容 |
| --- | --- | --- |
| `id` | INTEGER | 行ID |
| `execution_date` | TEXT | 約定日、`YYYY-MM-DD` |
| `settlement_date` | TEXT | 受渡日、`YYYY-MM-DD` |
| `security_code` | TEXT | 銘柄コード |
| `security_name` | TEXT | 銘柄名 |
| `account` | TEXT | 口座 |
| `margin_type` | TEXT | 信用区分 |
| `transaction_type` | TEXT | 取引種別 |
| `quantity_shares` | INTEGER | 数量 |
| `sale_settlement_unit_price_yen` | REAL | 売却/決済単価 |
| `sale_settlement_amount_yen` | INTEGER | 売却/決済額 |
| `average_acquisition_price_yen` | REAL | 平均取得価額 |
| `realized_pl_yen` | INTEGER | 実現損益 |
| `source_file` | TEXT | 取込元CSV |

初期データ概要:

| 項目 | 値 |
| --- | ---: |
| 件数 | 4,941 |
| 約定日範囲 | 2025-01-27 から 2026-04-23 |
| 実現損益合計 | -1,371,900円 |

## MVPの範囲

### 含めるもの

- ダッシュボード
- 日次・月次の実現損益推移
- 累積実現損益推移
- 銘柄別成績ランキング
- 取引一覧
- 共通フィルタ
- SQLiteを読み込むAPI
- CSVアップロードによるSQLiteデータベースのフル再取込

### 含めないもの

- 認証
- 複数ユーザー対応
- 取引データの編集
- 税計算
- 含み損益
- リアルタイム株価連携
- 売買理由やメモ管理

## 画面仕様

### 1. ダッシュボード

最初に表示する画面。全体の成績を一目で確認できるようにする。

表示するサマリーカード:

- 総実現損益
- 期間内実現損益
- 取引件数
- 勝ち件数
- 負け件数
- 勝率
- 平均損益
- 平均利益
- 平均損失
- 最大利益
- 最大損失
- Profit Factor

表示するグラフ:

- 実現損益バーと累積実現損益ラインを重ねた推移チャート
- 日次 / 月次の切り替え
- 当月の実現損益カレンダー

表示するランキング:

- 利益上位5銘柄
- 損失上位5銘柄

ヘッダー操作:

- `データ更新` ボタン
- CSVファイル選択
- CSVドラッグ＆ドロップ
- 取込結果の件数、約定日範囲、実現損益合計の表示

### 2. 推移分析

日付軸で損益の流れを見る画面。

表示する切り替え:

- 日次
- 月次

表示する項目:

- 期間
- 実現損益
- 累積実現損益
- 取引件数
- 勝ち件数
- 負け件数

グラフ:

- 実現損益バーと累積実現損益ラインを重ねたチャート

### 3. 銘柄別成績

銘柄ごとの勝ち負けを確認する画面。

テーブル列:

- 銘柄コード
- 銘柄名
- 実現損益合計
- 取引件数
- 勝ち件数
- 負け件数
- 勝率
- 平均損益
- 最大利益
- 最大損失
- 売却/決済額合計
- 数量合計

機能:

- 実現損益合計でソート
- 取引件数でソート
- 銘柄コード・銘柄名検索
- 利益銘柄のみ / 損失銘柄のみの切り替え

### 4. 取引一覧

元データを確認する画面。

テーブル列:

- 約定日
- 受渡日
- 銘柄コード
- 銘柄名
- 口座
- 信用区分
- 取引種別
- 数量
- 売却/決済単価
- 売却/決済額
- 平均取得価額
- 実現損益

機能:

- ページング
- ソート
- 銘柄コード・銘柄名検索
- 日付範囲フィルタ
- 口座フィルタ
- 信用区分フィルタ
- 取引種別フィルタ
- 利益のみ / 損失のみ / 全ての切り替え

## 共通フィルタ

全画面で同じ条件を適用できるようにする。

| フィルタ | 内容 |
| --- | --- |
| 期間 | 開始日、終了日 |
| 銘柄 | 銘柄コードまたは銘柄名の部分一致 |
| 口座 | `account` の値 |
| 信用区分 | `margin_type` の値 |
| 取引種別 | `transaction_type` の値 |
| 損益区分 | 全て、利益のみ、損失のみ、ゼロのみ |

初期表示は当月の開始日から当日までとする。

## 指標定義

| 指標 | 定義 |
| --- | --- |
| 取引件数 | 対象行数 |
| 総実現損益 | `SUM(realized_pl_yen)` |
| 勝ち件数 | `realized_pl_yen > 0` の件数 |
| 負け件数 | `realized_pl_yen < 0` の件数 |
| ゼロ件数 | `realized_pl_yen = 0` の件数 |
| 勝率 | 勝ち件数 ÷ `realized_pl_yen != 0` の件数 |
| 利益合計 | `realized_pl_yen > 0` の合計 |
| 損失合計 | `realized_pl_yen < 0` の合計 |
| 平均損益 | `AVG(realized_pl_yen)` |
| 平均利益 | `realized_pl_yen > 0` の平均 |
| 平均損失 | `realized_pl_yen < 0` の平均 |
| 最大利益 | `MAX(realized_pl_yen)` |
| 最大損失 | `MIN(realized_pl_yen)` |
| Profit Factor | 利益合計 ÷ 損失合計の絶対値 |
| 累積実現損益 | 約定日順の `realized_pl_yen` 累積和 |

Profit Factorは損失合計が0の場合、APIでは `null` を返す。

## API仕様

BackendはSQLiteを読み、FrontendにJSONを返す。

CSVアップロード時は受け取ったCSVから一時SQLiteデータベースを作成し、成功後に既存DBを置き換える。現在は差分取込ではなくフル再取込とする。

### `GET /api/filters`

フィルタ候補を返す。

レスポンス例:

```json
{
  "date_range": {
    "min": "2025-01-27",
    "max": "2026-04-23"
  },
  "accounts": ["NISA成長投資枠", "特定"],
  "margin_types": ["-", "制度"],
  "transaction_types": ["売付", "売埋"]
}
```

### `GET /api/summary`

サマリー指標を返す。

クエリ:

- `from`
- `to`
- `q`
- `account`
- `margin_type`
- `transaction_type`
- `pl_type`

レスポンス例:

```json
{
  "trade_count": 4941,
  "total_realized_pl_yen": -1371900,
  "win_count": 2888,
  "loss_count": 2052,
  "flat_count": 1,
  "win_rate": 0.5845,
  "gross_profit_yen": 1234567,
  "gross_loss_yen": -2606467,
  "average_pl_yen": -277.65,
  "average_win_yen": 1234.56,
  "average_loss_yen": -2345.67,
  "max_win_yen": 100000,
  "max_loss_yen": -100000,
  "profit_factor": 0.47
}
```

### `GET /api/pl/timeseries`

日次または月次の損益推移を返す。

クエリ:

- `group_by`: `day` または `month`
- 共通フィルタ

レスポンス例:

```json
{
  "group_by": "month",
  "items": [
    {
      "period": "2025-01",
      "trade_count": 10,
      "realized_pl_yen": 123000,
      "cumulative_realized_pl_yen": 123000,
      "win_count": 7,
      "loss_count": 3
    }
  ]
}
```

### `GET /api/pl/by-security`

銘柄別の集計を返す。

クエリ:

- 共通フィルタ
- `sort`: `realized_pl_yen`, `trade_count`, `win_rate`
- `order`: `asc`, `desc`
- `limit`
- `offset`

レスポンス例:

```json
{
  "items": [
    {
      "security_code": "9984",
      "security_name": "ソフトバンクグループ",
      "trade_count": 42,
      "total_realized_pl_yen": -120000,
      "win_count": 20,
      "loss_count": 22,
      "win_rate": 0.4762,
      "average_pl_yen": -2857.14,
      "max_win_yen": 25000,
      "max_loss_yen": -40000,
      "total_sale_settlement_amount_yen": 12345678,
      "total_quantity_shares": 4200
    }
  ],
  "total": 1
}
```

### `GET /api/trades`

取引一覧を返す。

クエリ:

- 共通フィルタ
- `sort`
- `order`
- `limit`
- `offset`

レスポンス例:

```json
{
  "items": [
    {
      "id": 1,
      "execution_date": "2025-01-27",
      "settlement_date": "2025-01-29",
      "security_code": "4689",
      "security_name": "ＬＩＮＥヤフー",
      "account": "NISA成長投資枠",
      "margin_type": "-",
      "transaction_type": "売付",
      "quantity_shares": 200,
      "sale_settlement_unit_price_yen": 448.5,
      "sale_settlement_amount_yen": 89700,
      "average_acquisition_price_yen": 427.0,
      "realized_pl_yen": 4300
    }
  ],
  "total": 4941
}
```

### `POST /api/import`

実現損益CSVをアップロードし、SQLiteデータベースをフル再取込する。

リクエスト:

- `Content-Type`: `multipart/form-data`
- フィールド名: `file`
- 文字コード: `cp932`

取込対象CSVヘッダー:

```text
約定日,受渡日,銘柄コード,銘柄名,口座,信用区分,取引,数量[株],売却/決済単価[円],売却/決済額[円],平均取得価額[円],実現損益[円]
```

レスポンス例:

```json
{
  "source_file": "realized_pl.csv",
  "row_count": 4941,
  "execution_date_min": "2025-01-27",
  "execution_date_max": "2026-04-23",
  "total_realized_pl_yen": -1371900
}
```

エラー例:

```json
{
  "error": "CSVファイルが見つかりません"
}
```

## UI方針

- 数値は円表記でカンマ区切りにする。
- 実現損益がプラスの場合は青系、マイナスの場合は赤系で表示する。
- テーブルは密度高めにし、投資成績を素早く比較できるようにする。
- ダッシュボードでは、カードとグラフを同じフィルタ条件で連動させる。
- 画面上部に共通フィルタを固定的に配置する。
- スマートフォン対応はMVPでは最低限とし、PCでの閲覧を主対象にする。

## 技術構成

推奨構成:

- Backend: Python標準ライブラリ `http.server`
- Database: SQLite
- Frontend: React + Vite
- Chart: Reactコンポーネント内のSVG
- Table: HTML table
- Styling: 通常CSS

ローカル実行を主目的にし、まずは単一マシン上で動く構成にする。

## 初期実装順

1. Python HTTPサーバーを追加する。
2. SQLite接続と共通フィルタ処理を実装する。
3. `/api/filters` と `/api/summary` を実装する。
4. `/api/pl/timeseries` を実装する。
5. `/api/pl/by-security` を実装する。
6. `/api/trades` を実装する。
7. React + Viteを追加する。
8. 共通フィルタUIを実装する。
9. ダッシュボードを実装する。
10. 推移分析、銘柄別成績、取引一覧を追加する。
11. CSVアップロードとフル再取込を追加する。

## 完了条件

- ローカルブラウザでWebアプリを開ける。
- DB内の4,941件をもとに集計できる。
- ダッシュボードで主要指標とグラフを確認できる。
- 銘柄別の利益・損失ランキングを確認できる。
- 取引一覧で検索・フィルタ・ソートができる。
- フィルタを変更すると、サマリー、グラフ、テーブルが同じ条件で更新される。
- CSVをアップロードするとSQLiteデータベースが再作成され、画面の集計が更新される。
