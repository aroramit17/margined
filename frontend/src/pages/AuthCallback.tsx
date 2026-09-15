import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "@/components/Brand";
import { exitDemo } from "@/lib/demo";
import { exchangeAuthCode } from "@/lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get("code");
    if (params.has("error") || fragment.has("error") || !code) {
      setError("This sign-in link is missing or has expired. Request a new link and open it in the same browser.");
      window.history.replaceState(null, "", "/auth/callback");
      return;
    }

    exchangeAuthCode(code).then(({ data, error }) => {
      if (!active) return;
      window.history.replaceState(null, "", "/auth/callback");
      if (error || !data.session) {
        setError("We couldn’t complete sign-in. Request a new link and open it in the same browser.");
        return;
      }
      exitDemo();
      navigate("/dashboard", { replace: true });
    }).catch(() => {
      if (!active) return;
      window.history.replaceState(null, "", "/auth/callback");
      setError("We couldn’t reach the login service. Please try again.");
    });
    return () => { active = false; };
  }, [navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-sm px-6 text-center space-y-4">
        <Brand large />
        <h1 className="text-xl font-semibold">{error ? "Sign-in needs another try" : "Signing you in…"}</h1>
        {error && <p role="alert" className="text-sm text-muted-foreground">{error}</p>}
        {error && <Link to="/login" className="block text-sm underline underline-offset-2">Back to sign in</Link>}
      </div>
    </main>
  );
}
