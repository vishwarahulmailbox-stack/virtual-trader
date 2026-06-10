import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`,
  ];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
  };

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();

      // v8 chart endpoint
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) {
        return NextResponse.json({
          price: meta.regularMarketPrice,
          prev: meta.previousClose || meta.regularMarketPrice,
          symbol,
        });
      }

      // v7 quote endpoint
      const quote = data?.quoteResponse?.result?.[0];
      if (quote?.regularMarketPrice) {
        return NextResponse.json({
          price: quote.regularMarketPrice,
          prev: quote.regularMarketPreviousClose || quote.regularMarketPrice,
          symbol,
        });
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Could not fetch price" }, { status: 502 });
}
