import Brand from "@/components/Brand";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { exitDemo } from "@/lib/demo";
import { authConfigured, authRedirectUrl, supabase } from "@/lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        exitDemo(); // a real session always wins over an earlier demo visit
        navigate("/dashboard");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: authRedirectUrl() },
        });
        if (error) throw error;
        if (!data.session) {
          setEmailSent(true);
          return;
        }
        exitDemo();
        navigate("/onboarding");
      }
    } catch (err: any) {
      setError(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) throw error;
      setEmailSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-sm w-full px-6 text-center">
          <h2 className="text-xl font-semibold mb-2">Check your email</h2>
          <p className="text-muted-foreground text-sm">
            Check <strong>{email}</strong> for a sign-in or confirmation link.
            Open it in this browser to finish signing in.
          </p>
          <button onClick={() => setEmailSent(false)} className="mt-4 text-sm underline underline-offset-2">Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8 text-center">
          <h1 className="mb-3"><Brand large /></h1>
          <p className="text-sm text-muted-foreground">
            A calmer view of your AI margins.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">Email</label>
            <input
              id="email"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">Password</label>
            <input
              id="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">{error}</p>
          )}
          {!authConfigured && <p role="alert" className="text-sm text-muted-foreground">Login is awaiting Supabase configuration.</p>}

          <button
            type="submit"
            disabled={loading || !authConfigured}
            className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-3">
          <button
            onClick={handleMagicLink}
            disabled={loading || !authConfigured}
            className="w-full border rounded-md px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            Send magic link
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button onClick={() => setMode("signup")} className="underline underline-offset-2">
                Sign up
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button onClick={() => setMode("login")} className="underline underline-offset-2">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
