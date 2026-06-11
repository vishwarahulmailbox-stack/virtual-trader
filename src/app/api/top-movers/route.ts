import { NextResponse } from "next/server";

// Curated Nifty 50 — one fetch per symbol using the same v8 chart endpoint
// that /api/price uses successfully. Fetch in parallel, pick top movers by % change.
const STOCKS: { symbol: string; name: string }[] = [
  { symbol: "RELIANCE.NS",   name: "Reliance Industries" },
  { symbol: "TCS.NS",        name: "Tata Consultancy Services" },
  { symbol: "HDFCBANK.NS",   name: "HDFC Bank" },
  { symbol: "INFY.NS",       name: "Infosys" },
  { symbol: "ICICIBANK.NS",  name: "ICICI Bank" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel" },
  { symbol: "SBIN.NS",       name: "State Bank of India" },
  { symbol: "KOTAKBANK.NS",  name: "Kotak Mahindra Bank" },
  { symbol: "LT.NS",         name: "Larsen & Toubro" },
  { symbol: "AXISBANK.NS",   name: "Axis Bank" },
  { symbol: "ITC.NS",        name: "ITC" },
  { symbol: "MARUTI.NS",     name: "Maruti Suzuki" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance" },
  { symbol: "TITAN.NS",      name: "Titan Company" },
  { symbol: "HCLTECH.NS",    name: "HCL Technologies" },
  { symbol: "SUNPHARMA.NS",  name: "Sun Pharmaceutical" },
  { symbol: "WIPRO.NS",      name: "Wipro" },
  { symbol: "NTPC.NS",       name: "NTPC" },
  { symbol: "ONGC.NS",       name: "ONGC" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors" },
  { symbol: "TATASTEEL.NS",  name: "Tata Steel" },
  { symbol: "ADANIENT.NS",   name: "Adani Enterprises" },
  { symbol: "POWERGRID.NS",  name: "Power Grid Corp" },
  { symbol: "TECHM.NS",      name: "Tech Mahindra" },
  { symbol: "DRREDDY.NS",    name: "Dr. Reddy's Labs" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever" },
  { symbol: "CIPLA.NS",      name: "Cipla" },
  { symbol: "JSWSTEEL.NS",   name: "JSW Steel" },
  { symbol: "BPCL.NS",       name: "BPCL" },
  { symbol: "COALINDIA.NS",  name: "Coal India" },
];

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

async function fetchOne(stock: { symbol: string; name: string }) {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1d&range=1d`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) continue;
      const price = meta.regularMarketPrice;
      const prev = meta.previousClose || meta.chartPreviousClose || price;
      const pct = prev ? ((price - prev) / prev) * 100 : 0;
      return {
        symbol: stock.symbol,
        name: meta.shortName || stock.name,
        price,
        prev,
        pct,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET() {
  const results = await Promise.all(STOCKS.map(fetchOne));
  const movers = results
    .filter(Boolean)
    .sort((a: any, b: any) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 10);

  if (!movers.length) {
    return NextResponse.json({ error: "Failed to fetch movers" }, { status: 502 });
  }
  return NextResponse.json({ movers });
}