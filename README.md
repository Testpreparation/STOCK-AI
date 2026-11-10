# STOCK AI

日本株・米国株を対象とした、JavaScript独自データ分析型の投資判断支援アプリです。Pythonは使用せず、自動売買も行いません。

## 方針
- HTML/CSS/JavaScript + Node.js標準機能のみ
- 有料AI・有料API・有料サーバーに依存しない構成を目標にする
- 無料データの取得元・取得時刻・遅延・調整方式を明示
- データ欠損・古いデータ・未調整価格では購入判断を制限
- Firebase Sparkを維持する方針
- APIキーはGitHub Actions secretsのみ。公開HTML・コミットに含めない

## 実装済み
- 株価データ正規化・検証・鮮度判定
- SMA / EMA / RSI
- 年次財務分析、100点評価、3シナリオ価格予測、予測誤差評価
- 統合分析パイプライン
- J-Quants V2 / SEC EDGAR / Alpha Vantageのデータ取得アダプター
- 日次データ取得スクリプトとGitHub Actionsワークフロー
- 予測履歴の端末内保存、将来株価との自動照合、誤差率・方向一致率・レンジ的中率の集計

## データソースの制限
- J-Quants Free: 12週間遅延、約2年分の履歴
- Alpha Vantage Free: 25 requests/day。日足Compactは直近100件。今回の実装は未調整OHLCV
- SEC EDGAR: 企業提出書類の財務データ。リアルタイム株価ではない
- 無料データはリアルタイム・無制限・全銘柄を保証しない

## 予測精度の検証

予測時点の価格・予測値・予測レンジをブラウザーのlocalStorageに保存し、後日公開された株価データの該当営業日と照合します。短期・中期・長期の予測を別々に評価します。履歴は利用中のブラウザー・端末内だけに保存され、別端末とは同期されません。ブラウザーデータを消去すると履歴も消えます。将来データが未到達の予測は「検証待ち」として保持します。

## 設定
`config/market-universe.json` を編集して対象銘柄を指定し、GitHub Actions secretsにAPIキー等を設定してください。詳細は `docs/MARKET_DATA_AUTOMATION.md`。

## テスト
Node.js 20以降で `npm run test:engine`。

## 注意
本アプリは分析支援であり、投資助言・利益保証・自動売買を行いません。
