# kaview

実現損益CSVをSQLite化したデータをもとに、成績・推移・銘柄別損益・取引一覧を確認するローカルWebアプリです。フロントエンドは React + Vite、バックエンドは Python 製です。

## セットアップ

```bash
npm install
```

フロントエンドをビルド:

```bash
npm run build
```

## 起動

```bash
python3 app/server.py --host 127.0.0.1 --port 8000
```

ブラウザで開く:

```text
http://127.0.0.1:8000
```

画面上部の `データ更新` から、最新の実現損益CSVをドラッグ＆ドロップまたはファイル選択でアップロードできます。現在は毎回フル再取込でDBを更新します。

同じネットワーク内の別PCからアクセスする場合:

```bash
python3 app/server.py --host 0.0.0.0 --port 8000
```

このマシンの現在のLAN向けURL:

```text
http://192.168.11.37:8000
```

## フロントエンド開発

Vite開発サーバー:

```bash
npm run dev
```

APIは Python サーバーの `http://127.0.0.1:8000` にプロキシされます。

そのため開発時は別ターミナルで Python サーバーも起動します:

```bash
python3 app/server.py --host 127.0.0.1 --port 8000
```

初期DB:

```text
/home/shingo/data/realized_pl_jp_20260423_183041.sqlite3
```

別のDBを使う場合:

```bash
python3 app/server.py --db /path/to/realized_pl.sqlite3
```

## テスト

```bash
python3 -m unittest
```
