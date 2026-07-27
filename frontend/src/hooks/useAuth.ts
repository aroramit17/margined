import { useEffect, useState } from "react";
import { IS_DEMO } from "@/lib/demo";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const DEMO_USER = {
  id: "demo-user",
  email: "demo@margined.dev",
} as unknown as User;

export function useAuth() {
  const [user, setUser] = useState<User | null>(IS_DEMO ? DEMO_USER : null);
  const [loading, setLoading] = useState(!IS_DEMO);

  useEffect(() => {
    if (IS_DEMO) return;

    supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = () => {
    if (IS_DEMO) {
      window.location.href = "/";
      return Promise.resolve({ error: null });
    }
    return supabase.auth.signOut();
  };

  return { user, loading, signOut, isDemo: IS_DEMO };
}
