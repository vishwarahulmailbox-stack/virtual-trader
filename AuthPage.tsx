"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-client";

type Mode = "login" | "signup" | "forgot";

export default function AuthPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  const inp: React.CSSProperties = {
    background: "#0f1117",
    border: "1px solid #2d3148",
    borderRadius: 8,
    padding: "11px 14px",
    color: "#e2e8f0",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const handleSubmit = async () => {
    if (!email.trim()) return setMessage({ text: "Please enter your email.", type: "error" });

    setLoading(true);
    setMessage(null);

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      });
      setLoading(false);
      if (error) return setMessage({ text: error.message, type: "error" });
      return setMessage({ text: "Password reset link sent — check your email.", type: "success" });
    }

    if (!password) {
      setLoading(false);
      return setMessage({ text: "Please enter your password.", type: "error" });
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
      });
      setLoading(false);
      if (error) return setMessage({ text: error.message, type: "error" });
      return setMessage({ text: "Account created! Check your email to confirm, then log in.", type: "success" });
    }

    // Login
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMessage({ text: error.message, type: "error" });
    // VirtualTrader's useEffect will detect the session and switch views
  };

  return (
    <div style={{
      fontFamily: "'Inter','Segoe UI',sans-serif",
      background: "#0f1117",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "#1a1d2e",
        border: "1px solid #2d3148",
        borderRadius: 16,
        padding: 32,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, marginBottom: 12,
          }}>📈</div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.4px", color: "#e2e8f0" }}>
            VirtualTrader
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            NSE/BSE Paper Trading · Your account, anywhere
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{
          display: "flex", background: "#0f1117", borderRadius: 8,
          padding: 3, marginBottom: 24, gap: 2,
        }}>
          {(["login", "signup"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); setMessage(null); }}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 6, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 13, textTransform: "capitalize",
                background: mode === m ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "transparent",
                color: mode === m ? "#fff" : "#64748b",
                transition: "all 0.15s",
              }}>
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 5, letterSpacing: "0.5px" }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inp}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {mode !== "forgot" && (
            <div>
              <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 5, letterSpacing: "0.5px" }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Min 6 characters" : "Your password"}
                style={inp}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
          )}

          {message && (
            <div style={{
              background: message.type === "error" ? "#ef444415" : "#10b98115",
              border: `1px solid ${message.type === "error" ? "#ef444440" : "#10b98140"}`,
              borderRadius: 8, padding: "10px 14px",
              color: message.type === "error" ? "#ef4444" : "#10b981",
              fontSize: 13, lineHeight: 1.5,
            }}>
              {message.text}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%", padding: 12, borderRadius: 8, border: "none",
              background: loading ? "#6366f160" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4,
            }}>
            {loading ? "Please wait…" : mode === "login" ? "Log In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
          </button>

          {mode === "login" && (
            <button onClick={() => { setMode("forgot"); setMessage(null); }}
              style={{
                background: "none", border: "none", color: "#6366f1", fontSize: 13,
                cursor: "pointer", padding: 0, textAlign: "center", fontWeight: 500,
              }}>
              Forgot password?
            </button>
          )}

          {mode === "forgot" && (
            <button onClick={() => { setMode("login"); setMessage(null); }}
              style={{
                background: "none", border: "none", color: "#64748b", fontSize: 13,
                cursor: "pointer", padding: 0, textAlign: "center",
              }}>
              ← Back to login
            </button>
          )}
        </div>

        <div style={{ marginTop: 24, borderTop: "1px solid #2d3148", paddingTop: 20, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
            Your portfolio is stored securely in the cloud.<br />
            Access it from any device, anywhere.
          </div>
        </div>
      </div>
    </div>
  );
}
