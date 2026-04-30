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

## 起動手順

```bash
npm run build
python3 app/server.py --host 0.0.0.0 --port 8000
```

別PCのブラウザで開く:

```text
http://<このマシンのLAN IP>:8000
```

このマシンのLAN IPを確認する:

```bash
hostname -I
```

例:

```text
http://192.168.11.37:8000
```

画面上部の `データ更新` から、最新の実現損益CSVをドラッグ＆ドロップまたはファイル選択でアップロードできます。現在は毎回フル再取込でDBを更新します。

別のDBを使う場合:

```bash
python3 app/server.py --host 0.0.0.0 --port 8000 --db /path/to/realized_pl.sqlite3
```

## 停止手順

サーバーを起動したターミナルで `Ctrl+C` を押します。

バックグラウンドで起動している場合は、プロセスを確認して停止します:

```bash
ps -ef | grep 'app/server.py' | grep -v grep
kill <PID>
```

停止できたか確認する:

```bash
ss -ltnp | grep ':8000'
```

何も表示されなければ停止済みです。

## 起動状態確認手順

このマシン上でポート待受を確認する:

```bash
ss -ltnp | grep ':8000'
```

`0.0.0.0:8000` で待ち受けていれば、同じネットワーク内の別PCからアクセスできます。

APIの応答を確認する:

```bash
curl http://127.0.0.1:8000/api/filters
```

別PCから確認する場合:

```text
http://<このマシンのLAN IP>:8000
```

## フロントエンド開発

通常利用では使いません。画面やCSSを開発するときだけ使います。

Vite開発サーバー:

```bash
npm run dev
```

別PCのブラウザで開く:

```text
http://<このマシンのLAN IP>:5173
```

APIは、Viteを起動しているこのマシン上の Python サーバーにプロキシされます。

そのため開発時は別ターミナルで Python サーバーも起動します:

```bash
python3 app/server.py --host 0.0.0.0 --port 8000
```

初期DB:

```text
/home/shingo/data/realized_pl_jp_20260423_183041.sqlite3
```

## テスト

```bash
python3 -m unittest
```
