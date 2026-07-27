import { createClient } from "@supabase/supabase-js";

// Placeholder fallbacks keep the marketing page renderable on deployments
// that haven't configured Supabase yet; auth calls just fail gracefully.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string) || "https://placeholder.supabase.co";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "public-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type AuthUser = {
  id: string;
  email: string;
};
