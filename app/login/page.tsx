"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { BarChart3, ArrowRight } from "lucide-react";
export default function Login() {
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(google = false) {
    setBusy(true);
    setMessage("");
    try {
      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
        throw Error(
          "Live sign-in is not configured yet. Add the Supabase keys in .env.local using README.md, or explore the demo below.",
        );
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      );
      if (google) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${location.origin}/auth/callback` },
        });
        if (error) throw error;
        return;
      }
      const { data, error } = signup
        ? await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
          })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) location.href = "/?mode=live";
      else setMessage("Check your email to confirm your account.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand" href="/">
          <span className="brand-mark">
            <BarChart3 size={22} />
          </span>
          inferlytic.
        </a>
        <h1>{signup ? "A clearer picture starts here." : "Welcome back."}</h1>
        <p>Know what every AI customer costs you.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              autoComplete={signup ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : signup
                ? "Create your workspace"
                : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => submit(true)}
        >
          Continue with Google
        </button>
        <button className="text-button" onClick={() => setSignup(!signup)}>
          {signup
            ? "Already have an account? Sign in"
            : "New to Inferlytic? Create an account"}
        </button>
        {message && (
          <div role="status" className="auth-message">
            {message}
          </div>
        )}
        <a href="/" className="text-button">
          Explore the demo
          <ArrowRight size={14} />
        </a>
      </section>
    </main>
  );
}
