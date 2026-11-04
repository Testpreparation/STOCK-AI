STOCK AI 完全版
================

■ 内容
- STOCK-AI.html：画面・CSS・JavaScriptを1つにまとめたフロントエンド
- backend：Python/Flask API、株価データ取得、定量スクリーニング、OpenAI解説、SQLite保存
- 起動する.bat：Windows用セットアップ・起動補助

■ 初回設定（Windows 10/11）
1. ZIPをすべて展開します。
2. backend フォルダ内の .env.example をコピーし、同じ場所に .env という名前で保存します。
3. backend/.env をメモ帳で開き、MARKET_DATA_PROVIDER=twelvedata と MARKET_DATA_API_KEY= にTwelve Dataのキーを設定します。
4. AI解説も使う場合は OPENAI_API_KEY= にOpenAI APIキーを設定します。AIキーは任意です。
5. ルートにある「起動する.bat」をダブルクリックします。初回は必要ライブラリをインストールします。
6. 起動後、ブラウザで http://127.0.0.1:5000/health を開き、status: ok を確認します。
7. STOCK-AI.html をブラウザで開きます。Pythonの黒い画面は閉じずに置いてください。

■ 手動起動（PowerShell）
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py app.py

■ API
GET  /health
GET  /api/status
GET  /api/stocks/quote?symbol=AAPL&market=US
GET  /api/stocks/history?symbol=AAPL&market=US&outputsize=30
GET  /api/recommendations
POST /api/screening/run
GET/POST /api/watchlist
DELETE /api/watchlist/US/AAPL
GET/POST /api/portfolio
DELETE /api/portfolio/<id>

■ 注意
- APIキーはbackend/.envだけに入力し、HTMLやチャットに貼らないでください。
- Twelve Dataの契約・無料枠・取引所対応状況により、日本株や一部銘柄が取得できない場合があります。
- OpenAI APIはChatGPTの月額プランとは別にAPI利用料金が発生する場合があります。
- 市場指数・ニュース・LINE通知はこの版では接続先未実装です。画面に表示されても利用可能とは限りません。
- 現在の画面のウォッチリスト・保有銘柄登録UIはブラウザ内の仮状態を含み、バックエンド保存UIとの完全な同期は未実装です。API側の保存機能は用意しています。
- 目標価格・損切り目安は機械的な参考値であり、投資助言・利益保証ではありません。

■ データ
SQLiteデータベースは backend/database/stock_ai.db に自動作成されます。


【無料分析エンジンについて】
この版はOpenAI APIを呼び出しません。API料金は発生しません。
移動平均・モメンタム・変動率・出来高比率を使った独自の定量スコアと日本語コメントを生成します。
これは生成AIではなくルールベースの分析です。株価取得にはTwelve Data等のデータ提供元の利用条件・無料枠が適用されます。
