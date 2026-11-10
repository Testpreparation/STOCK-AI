const allFinite = values => values.every(Number.isFinite);

export function sma(values, period) {
  if (!Number.isInteger(period) || period < 1) throw new RangeError("period must be positive");
  return values.map((_, i) => {
    const window = values.slice(i + 1 - period, i + 1);
    return window.length !== period || !allFinite(window) ? null : window.reduce((a, b) => a + b, 0) / period;
  });
}
export function ema(values, period) {
  if (!Number.isInteger(period) || period < 1) throw new RangeError("period must be positive");
  const out = Array(values.length).fill(null), alpha = 2 / (period + 1);
  let previous = null;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) { previous = null; continue; }
    if (previous === null) {
      const window = values.slice(i - period + 1, i + 1);
      if (window.length === period && allFinite(window)) previous = window.reduce((a, b) => a + b, 0) / period;
    } else previous = alpha * values[i] + (1 - alpha) * previous;
    out[i] = previous;
  }
  return out;
}
export function rsi(closes, period = 14) {
  if (!Number.isInteger(period) || period < 2) throw new RangeError("period must be at least 2");
  const out = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (!Number.isFinite(change)) return out;
    gain += Math.max(change, 0); loss += Math.max(-change, 0);
  }
  let avgGain = gain / period, avgLoss = loss / period;
  const value = () => avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (!Number.isFinite(change)) { avgGain = 0; avgLoss = 0; continue; }
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    out[i] = value();
  }
  return out;
}
export function calculateTechnicalIndicators(rows) {
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array");
  const closes = rows.map(row => row.close);
  return { sma20: sma(closes, 20), sma50: sma(closes, 50), ema12: ema(closes, 12), ema26: ema(closes, 26), rsi14: rsi(closes, 14) };
}
