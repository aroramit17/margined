import { SignIn, SignUp } from "@clerk/react";
import { Navigate, Link } from "react-router-dom";
import Brand from "@/components/Brand";
import { clerkConfigured, useSessionAuth } from "@/components/AuthProvider";

export default function Login({ signup = false }: { signup?: boolean }) {
  const { user, loading } = useSessionAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-12 gap-6">
    <div className="text-center space-y-3"><Link to="/"><Brand large /></Link>
      <p className="text-sm text-muted-foreground">A calmer view of your AI margins.</p></div>
    {!clerkConfigured ? <p role="status">Login is awaiting Clerk configuration.</p> : loading ? <p role="status">Loading secure sign-in…</p> : signup ?
      <SignUp routing="path" path="/signup" signInUrl="/login" forceRedirectUrl="/onboarding" /> :
      <SignIn routing="path" path="/login" signUpUrl="/signup" forceRedirectUrl="/dashboard" />}
  </main>;
}
