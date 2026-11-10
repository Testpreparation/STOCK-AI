const INSTRUMENT_NAMES = {
  JP: {
    "7203": "トヨタ自動車",
    "6758": "ソニーグループ",
    "7011": "三菱重工業",
    "282A": "グローバルX 半導体・トップ10-日本株式 ETF"
  },
  US: {
    AAPL: "Apple Inc.（アップル）",
    MSFT: "Microsoft Corporation（マイクロソフト）",
    IONQ: "IonQ, Inc.（アイオンキュー）"
  }
};
export function getInstrumentName(symbol, market) {
  if (!symbol || !market) return "";
  return INSTRUMENT_NAMES[String(market).toUpperCase()]?.[String(symbol).toUpperCase()] ?? "";
}
