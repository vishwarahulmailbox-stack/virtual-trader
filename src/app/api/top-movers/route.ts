import { NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.nseindia.com/",
  "Connection": "keep-alive",
};

// Fallback: hardcoded Nifty 50 list to use with Yahoo if NSE fails
const NIFTY50_YF = [
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

async function fetchFromNSE() {
  // NSE Nifty 50 gainers/losers — official endpoint used by nseindia.com
  const url = "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050";
  
  // NSE requires a session cookie — first hit the homepage, then the API
  const cookieRes = await fetch("https://www.nseindia.com/market-data/live-equity-market", {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  
  const setCookie = cookieRes.headers.get("set-cookie") || "";
  
  const res = await fetch(url, {
    headers: {
      ...HEADERS,
      Cookie: setCookie,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`NSE status ${res.status}`);
  const data = await res.json();
  
  // data.data is array of stocks, skip index entry (symbol = "NIFTY 50")
  const stocks = (data.data ?? []).filter((s: any) => s.symbol && s.symbol !== "NIFTY 50");
  
  const movers = stocks
    .map((s: any) => ({
      symbol: s.symbol + ".NS",
      name: s.meta?.companyName || s.symbol,
      price: s.lastPrice,
      prev: s.previousClose,
      pct: s.pChange,
    }))
    .filter((s: any) => s.price && s.prev)
    .sort((a: any, b: any) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 10);

  if (!movers.length) throw new Error("No movers from NSE");
  return movers;
}

async function fetchFromYahoo() {
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${NIFTY50_YF.join(",")}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${NIFTY50_YF.join(",")}`,
  ];

  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout(12000),
    });
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
        pct: q.regularMarketChangePercent ??
          ((q.regularMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100,
      }))
      .sort((a: any, b: any) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 10);

    if (movers.length) return movers;
  }
  throw new Error("Yahoo also failed");
}

export async function GET() {
  // Try NSE first, fallback to Yahoo
  try {
    const movers = await fetchFromNSE();
    return NextResponse.json({ movers, source: "NSE" });
  } catch (nseErr) {
    console.warn("NSE fetch failed, trying Yahoo:", nseErr);
    try {
      const movers = await fetchFromYahoo();
      return NextResponse.json({ movers, source: "Yahoo" });
    } catch (yfErr) {
      console.error("Both sources failed:", yfErr);
      return NextResponse.json({ error: "Failed to fetch movers" }, { status: 502 });
    }
  }
}
