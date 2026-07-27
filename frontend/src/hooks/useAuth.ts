import { useEffect, useState } from "react";
import { exitDemo, isDemoActive } from "@/lib/demo";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const DEMO_USER = {
  id: "demo-user",
  email: "demo@margined.dev",
} as unknown as User;

export function useAuth() {
  const demo = isDemoActive();
  const [user, setUser] = useState<User | null>(demo ? DEMO_USER : null);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;

    supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, [demo]);

  const signOut = () => {
    if (demo) {
      exitDemo();
      window.location.href = "/";
      return Promise.resolve({ error: null });
    }
    return supabase.auth.signOut();
  };

  return { user, loading, signOut, isDemo: demo };
}
