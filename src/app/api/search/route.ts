import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  try {
    // Yahoo Finance autocomplete / search endpoint
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=IN&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=false&enableCb=false&enableNavLinks=false&enableEnhancedTrivialQuery=true`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();

    const results = (data?.quotes ?? [])
      .filter((q: any) => q.exchange === "NSI" || q.exchange === "BSE" || (q.symbol && q.symbol.endsWith(".NS")) || (q.symbol && q.symbol.endsWith(".BO")))
      .slice(0, 6)
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
