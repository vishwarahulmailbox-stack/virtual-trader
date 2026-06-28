"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";
import type { User } from "@supabase/supabase-js";
import AuthPage from "@/components/AuthPage";
import VirtualTrader from "@/components/VirtualTrader";

export default function Home() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    // createClient() is called here (inside useEffect) so it only runs
    // in the browser, never during Next.js static pre-rendering at build time.
    const supabase = createClient();

    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    // Listen for auth state changes (login / logout / email confirm)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  // Loading splash
  if (user === undefined) {
    return (
      <div style={{
        fontFamily: "'Inter','Segoe UI',sans-serif",
        background: "#0f1117", minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
        }}>📈</div>
        <div style={{ color: "#64748b", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return <VirtualTrader user={user} onSignOut={handleSignOut} />;
}
