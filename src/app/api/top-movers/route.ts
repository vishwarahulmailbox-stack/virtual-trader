import { NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

const NIFTY50 = [
  "RELIANCE.NS","TCS.NS","HDFCBANK.NS","INFY.NS","ICICIBANK.NS",
  "HINDUNILVR.NS","BHARTIARTL.NS","KOTAKBANK.NS","ITC.NS",
  "LT.NS","AXISBANK.NS","SBIN.NS","ASIANPAINT.NS","MARUTI.NS",
  "BAJFINANCE.NS","TITAN.NS","HCLTECH.NS","SUNPHARMA.NS","WIPRO.NS",
  "ULTRACEMCO.NS","NESTLEIND.NS","POWERGRID.NS","NTPC.NS","ONGC.NS",
  "COALINDIA.NS","TECHM.NS","TATAMOTORS.NS","ADANIENT.NS","BAJAJFINSV.NS",
  "DIVISLAB.NS","DRREDDY.NS","EICHERMOT.NS","GRASIM.NS","HEROMOTOCO.NS",
  "HINDALCO.NS","INDUSINDBK.NS","JSWSTEEL.NS","TATASTEEL.NS","APOLLOHOSP.NS",
  "CIPLA.NS","BPCL.NS","BRITANNIA.NS","ADANIPORTS.NS","TATACONSUM.NS",
  "BAJAJ-AUTO.NS","HDFCLIFE.NS","SBILIFE.NS","M&M.NS","SHREECEM.NS",
];

// Deduplicate using Array.from to avoid downlevelIteration requirement
const UNIQUE_SYMBOLS = Array.from(new Set(NIFTY50));

export async function GET() {
  // Try both Yahoo Finance endpoints in parallel for resilience
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${UNIQUE_SYMBOLS.join(",")}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${UNIQUE_SYMBOLS.join(",")}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const data = await res.json();
      const results = data?.quoteResponse?.result ?? [];
      if (!results.length) continue;

      const movers = results
        .filter((q: any) => q.regularMarketPrice && q.regularMarketPreviousClose)
        .map((q: any) => ({
          symbol: q.symbol,
          name: q.shortName || q.symbol.replace(".NS", ""),
          price: q.regularMarketPrice,
          prev: q.regularMarketPreviousClose,
          // Use Yahoo's own pct value, or compute it — works whether market is open or closed
          pct: q.regularMarketChangePercent ??
            ((q.regularMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100,
          marketState: q.marketState ?? "UNKNOWN",
        }))
        .sort((a: any, b: any) => Math.abs(b.pct) - Math.abs(a.pct))
        .slice(0, 10);

      return NextResponse.json({ movers });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Failed to fetch movers" }, { status: 502 });
}
