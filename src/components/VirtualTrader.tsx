"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

const INITIAL_CAPITAL = 100000;
const STORAGE_KEY = "vt-state";

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(val);

const formatPct = (val: number) => (val >= 0 ? "+" : "") + val.toFixed(2) + "%";

// ── localStorage helpers ──
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function saveState(capital: number, portfolio: Record<string, any>, trades: any[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ capital, portfolio, trades }));
  } catch (_) {}
}

function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

// ── Price fetch via our own Next.js API route (server-side, no CORS) ──
async function fetchPrice(symbol: string): Promise<{ price: number; prev: number } | null> {
  try {
    const res = await fetch(`/api/price?symbol=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.price) return { price: data.price, prev: data.prev };
  } catch (_) {}
  return null;
}

// ── P&L tooltip ──
const PnLTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, color: val >= 0 ? "#10b981" : "#ef4444" }}>
        Cumulative P&L: {formatCurrency(val)}
      </div>
    </div>
  );
};

export default function VirtualTrader() {
  const [tab, setTab] = useState("trade");
  const [capital, setCapital] = useState(INITIAL_CAPITAL);
  const [portfolio, setPortfolio] = useState<Record<string, any>>({});
  const [trades, setTrades] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, { price: number; prev: number }>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    symbol: "", name: "", qty: "1", action: "BUY",
    stopLoss: "", target: "", strategyTag: "", strategyNote: "",
  });
  const [searchResult, setSearchResult] = useState<{ price: number; prev: number } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [expandedTradeId, setExpandedTradeId] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [topMovers, setTopMovers] = useState<any[]>([]);
  const [moversLoading, setMoversLoading] = useState(true);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadState();
    if (saved) {
      setCapital(saved.capital ?? INITIAL_CAPITAL);
      setPortfolio(saved.portfolio ?? {});
      setTrades(saved.trades ?? []);
    }
    setHydrated(true);
  }, []);

  // Fetch top movers on mount + every 5 min
  useEffect(() => {
    if (!hydrated) return;
    fetchTopMovers();
    const id = setInterval(fetchTopMovers, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [hydrated]);

  // Debounced save
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveState(capital, portfolio, trades), 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [capital, portfolio, trades, hydrated]);

  const showToast = (msg: string, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSymbolInput = (val: string) => {
    setForm((f) => ({ ...f, symbol: val.toUpperCase() }));
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (val.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        if (data.results?.length) {
          setSuggestions(data.results);
          setShowSuggestions(true);
        } else {
          setShowSuggestions(false);
        }
      } catch { setShowSuggestions(false); }
    }, 250);
  };

  const selectSuggestion = async (stock: { symbol: string; name: string }) => {
    setShowSuggestions(false);
    setForm((f) => ({ ...f, symbol: stock.symbol, name: stock.name }));
    setSearchLoading(true);
    setSearchResult(null);
    const r = await fetchPrice(stock.symbol);
    if (r) {
      setSearchResult(r);
      setForm((f) => ({
        ...f,
        stopLoss: (r.price * 0.98).toFixed(2),
        target: (r.price * 1.05).toFixed(2),
      }));
    } else showToast("Could not fetch price.", "error");
    setSearchLoading(false);
  };

  const fetchTopMovers = async () => {
    setMoversLoading(true);
    try {
      const res = await fetch("/api/top-movers");
      const data = await res.json();
      if (data.movers?.length) setTopMovers(data.movers);
    } catch (_) {}
    setMoversLoading(false);
  };

  const handleReset = () => {
    clearState();
    setCapital(INITIAL_CAPITAL);
    setPortfolio({});
    setTrades([]);
    setPrices({});
    setShowResetConfirm(false);
    showToast("Portfolio reset to ₹1,00,000.", "warn");
  };

  const refreshPrices = useCallback(async () => {
    const symbols = Array.from(new Set([
      ...Object.keys(portfolio),
      ...(form.symbol && searchResult ? [form.symbol] : []),
    ]));
    if (!symbols.length) return;
    const updates: Record<string, any> = {};
    await Promise.all(
      symbols.map(async (sym) => {
        setLoading((l) => ({ ...l, [sym]: true }));
        const r = await fetchPrice(sym);
        if (r) updates[sym] = r;
        setLoading((l) => ({ ...l, [sym]: false }));
      })
    );
    setPrices((p) => ({ ...p, ...updates }));
  }, [portfolio, form.symbol, searchResult]);

  useEffect(() => {
    if (!hydrated) return;
    refreshPrices();
    const id = setInterval(refreshPrices, 60000);
    return () => clearInterval(id);
  }, [refreshPrices, hydrated]);

  useEffect(() => {
    Object.entries(portfolio).forEach(([sym, pos]: any) => {
      const cur = prices[sym]?.price;
      if (!cur) return;
      if (pos.stopLoss && cur <= pos.stopLoss)
        showToast(`⚠️ Stop Loss triggered for ${sym} at ${formatCurrency(cur)}`, "warn");
      if (pos.target && cur >= pos.target)
        showToast(`🎯 Target hit for ${sym} at ${formatCurrency(cur)}`, "success");
    });
  }, [prices]);

  const handleSearch = async () => {
    if (!form.symbol) return;
    setSearchLoading(true);
    setSearchResult(null);
    const sym = form.symbol.toUpperCase().endsWith(".NS")
      ? form.symbol.toUpperCase()
      : form.symbol.toUpperCase() + ".NS";
    const r = await fetchPrice(sym);
    if (r) {
      setSearchResult(r);
      setForm((f) => ({
        ...f,
        symbol: sym,
        stopLoss: (r.price * 0.98).toFixed(2),
        target: (r.price * 1.05).toFixed(2),
      }));
    } else showToast("Could not fetch price. Check symbol.", "error");
    setSearchLoading(false);
  };

  const handleQuickSelect = async (stock: { symbol: string; name: string }) => {
    setForm((f) => ({ ...f, symbol: stock.symbol, name: stock.name }));
    setSearchLoading(true);
    setSearchResult(null);
    const r = await fetchPrice(stock.symbol);
    if (r) {
      setSearchResult(r);
      setForm((f) => ({
        ...f,
        stopLoss: (r.price * 0.98).toFixed(2),
        target: (r.price * 1.05).toFixed(2),
      }));
    }
    setSearchLoading(false);
  };

  const executeTrade = () => {
    const { symbol, name, qty, action, stopLoss, target, strategyTag, strategyNote } = form;
    const q = parseInt(qty);
    if (!symbol || !q || q <= 0 || !searchResult)
      return showToast("Fill all fields and search stock first.", "error");

    const price = searchResult.price;
    const total = price * q;

    if (action === "BUY") {
      if (total > capital) return showToast("Insufficient capital.", "error");
      setCapital((c) => c - total);
      setPortfolio((p) => {
        const existing = p[symbol];
        if (existing) {
          const newQty = existing.qty + q;
          const newAvg = (existing.avgPrice * existing.qty + price * q) / newQty;
          return { ...p, [symbol]: { ...existing, qty: newQty, avgPrice: newAvg, stopLoss: stopLoss ? parseFloat(stopLoss) : existing.stopLoss, target: target ? parseFloat(target) : existing.target } };
        }
        return { ...p, [symbol]: { name: name || symbol, qty: q, avgPrice: price, stopLoss: stopLoss ? parseFloat(stopLoss) : null, target: target ? parseFloat(target) : null } };
      });
      setTrades((t) => [{ id: Date.now(), date: new Date().toLocaleString("en-IN"), symbol, name: name || symbol, action, qty: q, price, total, stopLoss: stopLoss || null, target: target || null, strategyTag: strategyTag || null, strategyNote: strategyNote || null }, ...t]);
      showToast(`Bought ${q} shares of ${symbol} @ ${formatCurrency(price)}`);
    } else {
      const pos = portfolio[symbol];
      if (!pos || pos.qty < q) return showToast("Not enough shares to sell.", "error");
      const pnl = (price - pos.avgPrice) * q;
      setCapital((c) => c + total);
      setPortfolio((p) => {
        const remaining = pos.qty - q;
        if (remaining === 0) { const { [symbol]: _, ...rest } = p; return rest; }
        return { ...p, [symbol]: { ...pos, qty: remaining } };
      });
      setTrades((t) => [{ id: Date.now(), date: new Date().toLocaleString("en-IN"), symbol, name: name || symbol, action, qty: q, price, total, pnl, strategyTag: strategyTag || null, strategyNote: strategyNote || null }, ...t]);
      showToast(`Sold ${q} shares @ ${formatCurrency(price)} | P&L: ${formatCurrency(pnl)}`);
    }
    setForm({ symbol: "", name: "", qty: "1", action: "BUY", stopLoss: "", target: "", strategyTag: "", strategyNote: "" });
    setSearchResult(null);
  };

  const handleExitFromPortfolio = (sym: string, pos: any) => {
    const ltp = prices[sym]?.price || pos.avgPrice;
    setForm({
      symbol: sym,
      name: pos.name,
      qty: String(pos.qty),
      action: "SELL",
      stopLoss: "",
      target: "",
      strategyTag: "",
      strategyNote: "",
    });
    setSearchResult({ price: ltp, prev: prices[sym]?.prev || ltp });
    setTab("trade");
  };

  const pnlChartData = (() => {
    const sells = [...trades].filter((t) => t.action === "SELL").reverse();
    let cum = 0;
    return sells.map((t, i) => { cum += t.pnl || 0; return { label: `T${i + 1} ${t.symbol.replace(".NS", "")}`, pnl: parseFloat(cum.toFixed(2)) }; });
  })();

  const portfolioValue = Object.entries(portfolio).reduce((sum, [sym, pos]: any) => sum + (prices[sym]?.price || pos.avgPrice) * pos.qty, 0);
  const invested = Object.values(portfolio).reduce((s: number, p: any) => s + p.avgPrice * p.qty, 0);
  const unrealizedPnL = portfolioValue - invested;
  const realizedPnL = trades.filter((t) => t.action === "SELL").reduce((s, t) => s + (t.pnl || 0), 0);
  const totalValue = capital + portfolioValue;
  const totalReturn = ((totalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  const wins = trades.filter((t) => t.action === "SELL" && t.pnl > 0).length;
  const losses = trades.filter((t) => t.action === "SELL" && t.pnl < 0).length;
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : "--";

  const inp = (extra: any = {}) => ({
    background: "#0f1117", border: "1px solid #2d3148", borderRadius: 8,
    padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none",
    width: "100%", boxSizing: "border-box" as const, ...extra,
  });

  if (!hydrated) {
    return (
      <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", background: "#0f1117", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📈</div>
        <div style={{ color: "#64748b", fontSize: 14 }}>Loading your portfolio…</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", background: "#0f1117", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>

      {/* Header */}
      <div style={{ background: "#1a1d2e", borderBottom: "1px solid #2d3148", padding: isMobile ? "12px 16px" : "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📈</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>VirtualTrader</div>
            <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
              NSE/BSE Paper Trading
              <span style={{ background: "#10b98120", color: "#10b981", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>💾 Auto-saved</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Portfolio Value</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: totalReturn >= 0 ? "#10b981" : "#ef4444" }}>{formatCurrency(totalValue)}</div>
          </div>
          <div style={{ background: totalReturn >= 0 ? "#10b98120" : "#ef444420", color: totalReturn >= 0 ? "#10b981" : "#ef4444", borderRadius: 6, padding: "4px 10px", fontSize: 13, fontWeight: 600 }}>{formatPct(totalReturn)}</div>
          <button onClick={() => setShowResetConfirm(true)} style={{ background: "#ef444415", color: "#ef4444", border: "1px solid #ef444430", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>↺ Reset</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#1a1d2e", borderBottom: "1px solid #2d3148", padding: isMobile ? "0 8px" : "0 24px", display: "flex" }}>
        {["trade", "portfolio", "history"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", color: tab === t ? "#6366f1" : "#64748b", fontWeight: 600, fontSize: 13, padding: "12px 16px", cursor: "pointer", borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent", textTransform: "capitalize" }}>
            {t === "trade" ? "🔄 Trade" : t === "portfolio" ? "💼 Portfolio" : "📋 History"}
          </button>
        ))}
      </div>

      <div style={{ padding: isMobile ? "12px" : "24px", maxWidth: 960, margin: "0 auto" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: isMobile ? 8 : 12, marginBottom: isMobile ? 16 : 24 }}>
          {[
            { label: "Available Cash", value: formatCurrency(capital), color: "#e2e8f0" },
            { label: "Unrealized P&L", value: formatCurrency(unrealizedPnL), color: unrealizedPnL >= 0 ? "#10b981" : "#ef4444" },
            { label: "Realized P&L", value: formatCurrency(realizedPnL), color: realizedPnL >= 0 ? "#10b981" : "#ef4444" },
            { label: "Win Rate", value: winRate === "--" ? "--" : winRate + "%", color: "#a78bfa" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── TRADE TAB ── */}
        {tab === "trade" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 20 }}>
            <div style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#a78bfa" }}>Place Order</div>
              <div style={{ display: "flex", background: "#0f1117", borderRadius: 8, padding: 3 }}>
                {["BUY", "SELL"].map((a) => (
                  <button key={a} onClick={() => setForm((f) => ({ ...f, action: a }))} style={{ flex: 1, padding: 8, borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: form.action === a ? (a === "BUY" ? "#10b981" : "#ef4444") : "transparent", color: form.action === a ? "#fff" : "#64748b" }}>{a}</button>
                ))}
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>STOCK SYMBOL (NSE)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      value={form.symbol}
                      onChange={(e) => handleSymbolInput(e.target.value)}
                      onFocus={() => form.symbol.length >= 1 && setShowSuggestions(suggestions.length > 0)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      placeholder="e.g. RELIANCE or search name"
                      style={{ ...inp(), width: "100%" }}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    {showSuggestions && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1d2e", border: "1px solid #6366f1", borderRadius: 8, zIndex: 100, overflow: "hidden", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                        {suggestions.map((s) => (
                          <div
                            key={s.symbol}
                            onMouseDown={() => selectSuggestion(s)}
                            style={{ padding: "9px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #2d3148" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#6366f115")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <div>
                              <span style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>{s.symbol.replace(".NS", "")}</span>
                              <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>{s.name}</span>
                            </div>
                            {prices[s.symbol] && (
                              <span style={{ fontSize: 12, fontWeight: 600, color: prices[s.symbol].price >= prices[s.symbol].prev ? "#10b981" : "#ef4444" }}>
                                {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(prices[s.symbol].price)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={handleSearch} disabled={searchLoading} title="Search price" style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 13px", cursor: searchLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40, opacity: searchLoading ? 0.7 : 1 }}>
                    {searchLoading
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.8s linear infinite" }}><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}
                  </button>
                </div>
              </div>
              {searchResult && (
                <div style={{ background: "#0f1117", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{formatCurrency(searchResult.price)}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{form.symbol}</div>
                  </div>
                  <div style={{ color: searchResult.price >= searchResult.prev ? "#10b981" : "#ef4444", fontWeight: 600, fontSize: 13 }}>
                    {formatPct(((searchResult.price - searchResult.prev) / searchResult.prev) * 100)}
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>QUANTITY</label>
                <input type="number" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} placeholder="Number of shares" style={inp()} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#ef4444", display: "block", marginBottom: 4 }}>STOP LOSS ₹ <span style={{ color: "#475569", fontWeight: 400 }}>(−2%)</span></label>
                  <input type="number" value={form.stopLoss} onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))} placeholder="Auto-calculated" style={inp()} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#10b981", display: "block", marginBottom: 4 }}>TARGET ₹ <span style={{ color: "#475569", fontWeight: 400 }}>(+5%)</span></label>
                  <input type="number" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} placeholder="Auto-calculated" style={inp()} />
                </div>
              </div>
              <div style={{ borderTop: "1px solid #2d3148", paddingTop: 12 }}>
                <label style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, display: "block", marginBottom: 6 }}>WHY THIS TRADE?</label>
                <textarea value={form.strategyNote} onChange={(e) => setForm((f) => ({ ...f, strategyNote: e.target.value }))} placeholder="e.g. EMA crossover on 15min, volume spike, above key resistance at 2450..." rows={3} style={{ ...inp(), resize: "vertical", lineHeight: 1.5 }} />
              </div>
              {searchResult && form.qty && (
                <div style={{ background: "#0f1117", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#94a3b8" }}>
                  Order Value: <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{formatCurrency(searchResult.price * parseInt(form.qty || "0"))}</span>
                </div>
              )}
              <button onClick={executeTrade} style={{ width: "100%", padding: 11, borderRadius: 8, border: "none", background: form.action === "BUY" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                {form.action === "BUY" ? "Buy" : "Sell"} Now
              </button>
            </div>

            {/* Top Movers — dynamic from Yahoo Finance */}
            <div style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#a78bfa" }}>🔥 Top Movers</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>Biggest % moves today · Nifty 50</div>
                </div>
                <button onClick={fetchTopMovers} disabled={moversLoading} style={{ background: "#6366f120", color: "#6366f1", border: "1px solid #6366f140", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, opacity: moversLoading ? 0.6 : 1 }}>
                  {moversLoading ? "..." : "↻ Refresh"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {moversLoading && topMovers.length === 0 ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ background: "#0f1117", borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ width: 60, height: 10, background: "#2d3148", borderRadius: 4 }} />
                        <div style={{ width: 100, height: 9, background: "#2d3148", borderRadius: 4 }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                        <div style={{ width: 70, height: 10, background: "#2d3148", borderRadius: 4 }} />
                        <div style={{ width: 45, height: 9, background: "#2d3148", borderRadius: 4 }} />
                      </div>
                    </div>
                  ))
                ) : topMovers.length === 0 ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#475569", fontSize: 12 }}>Could not load movers. Market may be closed.</div>
                ) : (
                  topMovers.map((s) => {
                    const isGainer = s.pct > 0;
                    const isLoser = s.pct < 0;
                    return (
                      <button key={s.symbol} onClick={() => handleQuickSelect(s)}
                        style={{ background: form.symbol === s.symbol ? "#6366f120" : "#0f1117", border: `1px solid ${form.symbol === s.symbol ? "#6366f1" : "#2d3148"}`, borderRadius: 8, padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>{s.symbol.replace(".NS", "").replace(".BO", "")}</span>
                            <span style={{ fontSize: 9, background: isGainer ? "#10b98120" : isLoser ? "#ef444420" : "#2d3148", color: isGainer ? "#10b981" : isLoser ? "#ef4444" : "#64748b", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>
                              {isGainer ? "▲" : isLoser ? "▼" : "—"}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.name}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>{formatCurrency(s.price)}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isGainer ? "#10b981" : isLoser ? "#ef4444" : "#64748b" }}>
                            {s.pct >= 0 ? "+" : ""}{s.pct.toFixed(2)}%
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PORTFOLIO TAB ── */}
        {tab === "portfolio" && (
          <div style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #2d3148", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#a78bfa" }}>Holdings</div>
              <button onClick={refreshPrices} style={{ background: "#6366f120", color: "#6366f1", border: "1px solid #6366f140", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>↻ Refresh</button>
            </div>
            {Object.keys(portfolio).length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#475569" }}>No holdings yet.</div>
            ) : isMobile ? (
              // Mobile card view
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {Object.entries(portfolio).map(([sym, pos]: any, i) => {
                  const ltp = prices[sym]?.price || pos.avgPrice;
                  const inv = pos.avgPrice * pos.qty;
                  const cur = ltp * pos.qty;
                  const pnl = cur - inv;
                  return (
                    <div key={sym} style={{ padding: "14px 16px", borderTop: i === 0 ? "none" : "1px solid #2d3148" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "#e2e8f0" }}>{sym.replace(".NS", "").replace(".BO", "")}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{pos.name}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: pnl >= 0 ? "#10b981" : "#ef4444" }}>{formatCurrency(pnl)}</div>
                          <div style={{ fontSize: 11, color: pnl >= 0 ? "#10b981" : "#ef4444" }}>{formatPct((pnl / inv) * 100)}</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        {[
                          { label: "Qty", value: pos.qty },
                          { label: "Avg", value: formatCurrency(pos.avgPrice) },
                          { label: "LTP", value: loading[sym] ? "..." : formatCurrency(ltp) },
                          { label: "Invested", value: formatCurrency(inv) },
                          { label: "Current", value: formatCurrency(cur) },
                          { label: "SL / TGT", value: `${pos.stopLoss ? formatCurrency(pos.stopLoss) : "—"} / ${pos.target ? formatCurrency(pos.target) : "—"}` },
                        ].map((d) => (
                          <div key={d.label} style={{ background: "#0f1117", borderRadius: 6, padding: "7px 10px" }}>
                            <div style={{ fontSize: 9, color: "#64748b", marginBottom: 2, fontWeight: 600 }}>{d.label}</div>
                            <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>{d.value}</div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleExitFromPortfolio(sym, pos)}
                        style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                        Exit Position
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Desktop table view
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0f1117" }}>
                    {["Symbol", "Qty", "Avg Price", "LTP", "Invested", "Current", "P&L", "Stop Loss", "Target", "Exit"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, color: "#64748b", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(portfolio).map(([sym, pos]: any, i) => {
                    const ltp = prices[sym]?.price || pos.avgPrice;
                    const inv = pos.avgPrice * pos.qty;
                    const cur = ltp * pos.qty;
                    const pnl = cur - inv;
                    return (
                      <tr key={sym} style={{ borderTop: "1px solid #2d3148", background: i % 2 === 0 ? "transparent" : "#ffffff05" }}>
                        <td style={{ padding: "12px 16px" }}><div style={{ fontWeight: 700, fontSize: 13 }}>{sym.replace(".NS", "")}</div><div style={{ fontSize: 11, color: "#64748b" }}>{pos.name}</div></td>
                        <td style={{ padding: "12px 16px", fontSize: 13 }}>{pos.qty}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13 }}>{formatCurrency(pos.avgPrice)}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>{loading[sym] ? "..." : formatCurrency(ltp)}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13 }}>{formatCurrency(inv)}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13 }}>{formatCurrency(cur)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: pnl >= 0 ? "#10b981" : "#ef4444" }}>{formatCurrency(pnl)}</div>
                          <div style={{ fontSize: 11, color: pnl >= 0 ? "#10b981" : "#ef4444" }}>{formatPct((pnl / inv) * 100)}</div>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#ef4444" }}>{pos.stopLoss ? formatCurrency(pos.stopLoss) : "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#10b981" }}>{pos.target ? formatCurrency(pos.target) : "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <button
                            onClick={() => handleExitFromPortfolio(sym, pos)}
                            style={{ background: "#ef444415", color: "#ef4444", border: "1px solid #ef444430", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                            Exit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: isMobile ? 6 : 12 }}>
              {[
                { label: "Closed Trades", value: trades.filter((t) => t.action === "SELL").length, color: "#e2e8f0" },
                { label: "Wins", value: wins, color: "#10b981" },
                { label: "Losses", value: losses, color: "#ef4444" },
              ].map((s) => (
                <div key={s.label} style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontWeight: 800, fontSize: 24, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 12, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#a78bfa", marginBottom: 4 }}>Cumulative P&L Over Trades</div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 16 }}>Realized P&L accumulation across closed positions</div>
              {pnlChartData.length < 2 ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: "#475569", fontSize: 13 }}>Close at least 2 trades to see your P&L curve.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={pnlChartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#2d3148" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`} />
                    <Tooltip content={<PnLTooltip />} />
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="pnl" stroke={pnlChartData[pnlChartData.length - 1]?.pnl >= 0 ? "#10b981" : "#ef4444"} strokeWidth={2.5}
                      dot={(props: any) => { const { cx, cy, payload } = props; const color = payload.pnl >= 0 ? "#10b981" : "#ef4444"; return <circle key={`d-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke="#1a1d2e" strokeWidth={2} />; }}
                      activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <div style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #2d3148", fontWeight: 700, fontSize: 14, color: "#a78bfa" }}>Trade Log</div>
              {trades.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#475569" }}>No trades yet.</div>
              ) : trades.map((t, i) => {
                const isExpanded = expandedTradeId === t.id;
                return (
                  <div key={t.id} style={{ borderTop: i === 0 ? "none" : "1px solid #2d3148" }}>
                    <div onClick={() => setExpandedTradeId(isExpanded ? null : t.id)} style={{ cursor: "pointer", background: isExpanded ? "#6366f108" : "transparent", padding: isMobile ? "12px 14px" : 0, display: isMobile ? "flex" : "grid", gridTemplateColumns: isMobile ? undefined : "1.4fr 1.2fr 0.7fr 0.8fr 1fr 1fr 1fr 0.4fr", flexDirection: isMobile ? "column" : undefined, gap: isMobile ? 6 : undefined }}>
                      {isMobile ? (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0" }}>{t.symbol.replace(".NS", "").replace(".BO","")}</span>
                                <span style={{ background: t.action === "BUY" ? "#10b98120" : "#ef444420", color: t.action === "BUY" ? "#10b981" : "#ef4444", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>{t.action}</span>
                              </div>
                              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{t.date}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: t.pnl === undefined ? "#e2e8f0" : t.pnl >= 0 ? "#10b981" : "#ef4444" }}>
                                {t.pnl !== undefined ? formatCurrency(t.pnl) : formatCurrency(t.total)}
                              </div>
                              <div style={{ fontSize: 11, color: "#64748b" }}>{t.qty} × {formatCurrency(t.price)}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: "#475569", textAlign: "right" }}>{isExpanded ? "▲ collapse" : (t.strategyNote) ? "📝 tap for notes" : "▼ expand"}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>{t.date}</div>
                          <div style={{ padding: "12px 16px" }}><div style={{ fontWeight: 700, fontSize: 13 }}>{t.symbol.replace(".NS", "")}</div><div style={{ fontSize: 11, color: "#64748b" }}>{t.name}</div></div>
                          <div style={{ padding: "12px 16px" }}><span style={{ background: t.action === "BUY" ? "#10b98120" : "#ef444420", color: t.action === "BUY" ? "#10b981" : "#ef4444", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>{t.action}</span></div>
                          <div style={{ padding: "12px 16px", fontSize: 13 }}>{t.qty}</div>
                          <div style={{ padding: "12px 16px", fontSize: 13 }}>{formatCurrency(t.price)}</div>
                          <div style={{ padding: "12px 16px", fontSize: 13 }}>{formatCurrency(t.total)}</div>
                          <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: t.pnl === undefined ? "#64748b" : t.pnl >= 0 ? "#10b981" : "#ef4444" }}>{t.pnl !== undefined ? formatCurrency(t.pnl) : "—"}</div>
                          <div style={{ padding: "12px 16px", fontSize: 12, color: "#475569" }}>{isExpanded ? "▲" : (t.strategyTag || t.strategyNote) ? "📝" : "▼"}</div>
                        </>
                      )}
                    </div>
                    {isExpanded && (
                      <div style={{ background: "#0f1117", borderTop: "1px solid #2d3148", padding: "14px 20px", display: "flex", gap: 24 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>STRATEGY TYPE</div>
                          {t.strategyTag ? <span style={{ background: "#6366f120", color: "#a78bfa", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>{t.strategyTag}</span> : <span style={{ color: "#475569", fontSize: 12 }}>Not tagged</span>}
                        </div>
                        <div style={{ flex: 3 }}>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>TRADE RATIONALE</div>
                          {t.strategyNote ? <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>{t.strategyNote}</div> : <span style={{ color: "#475569", fontSize: 12 }}>No notes recorded.</span>}
                        </div>
                        {(t.stopLoss || t.target) && (
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>LEVELS</div>
                            {t.stopLoss && <div style={{ fontSize: 12, color: "#ef4444" }}>SL: {formatCurrency(t.stopLoss)}</div>}
                            {t.target && <div style={{ fontSize: 12, color: "#10b981" }}>TGT: {formatCurrency(t.target)}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Reset Modal */}
      {showResetConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#1a1d2e", border: "1px solid #2d3148", borderRadius: 16, padding: 28, maxWidth: 360, width: "90%", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Reset Portfolio?</div>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>This will clear all trades and reset capital to <strong style={{ color: "#e2e8f0" }}>₹1,00,000</strong>. Cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #2d3148", background: "transparent", color: "#94a3b8", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={handleReset} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Yes, Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.type === "error" ? "#ef4444" : toast.type === "warn" ? "#f59e0b" : "#10b981", color: "#fff", borderRadius: 10, padding: "12px 18px", fontWeight: 600, fontSize: 13, maxWidth: 320, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 999 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
