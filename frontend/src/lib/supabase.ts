import { createClient } from "@supabase/supabase-js";

// Placeholder fallbacks keep the marketing page renderable on deployments
// that haven't configured Supabase yet; auth calls just fail gracefully.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) || "https://placeholder.supabase.co";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "public-anon-key";

export const authConfigured = supabaseUrl !== "https://placeholder.supabase.co" && supabaseAnonKey !== "public-anon-key";
export const authRedirectUrl = () => `${window.location.origin}/auth/callback`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: "pkce", detectSessionInUrl: false },
});

// React StrictMode can mount the callback twice. Exchange each one-time code once.
let callbackExchange: { code: string; result: ReturnType<typeof supabase.auth.exchangeCodeForSession> } | undefined;
export function exchangeAuthCode(code: string) {
  if (!callbackExchange || callbackExchange.code !== code) {
    callbackExchange = { code, result: supabase.auth.exchangeCodeForSession(code) };
  }
  return callbackExchange.result;
}

export type AuthUser = {
  id: string;
  email: string;
};
