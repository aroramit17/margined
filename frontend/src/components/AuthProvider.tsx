import { createContext, useContext, useLayoutEffect, useRef } from "react";
import { ClerkProvider, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { setTokenGetter } from "@/lib/auth-token";
import { exitDemo } from "@/lib/demo";

export const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
type AuthState = {
  user: { id: string; email: string } | null;
  loading: boolean;
  signOut: () => Promise<unknown>;
};
const AuthContext = createContext<AuthState>({ user: null, loading: false, signOut: async () => {} });
export const useSessionAuth = () => useContext(AuthContext);

function ClerkSession({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useUser();
  const { getToken, isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (!isLoaded) return;
    const id = user?.id ?? null;
    if (previousUser.current !== id) queryClient.clear();
    previousUser.current = id;
    if (isSignedIn) exitDemo();
    return setTokenGetter(() => isSignedIn ? getToken() : Promise.resolve(null));
  }, [getToken, isSignedIn, isLoaded, user?.id, queryClient]);

  return <AuthContext.Provider value={{
    user: user ? { id: user.id, email: user.primaryEmailAddress?.emailAddress ?? "" } : null,
    loading: !isLoaded,
    signOut: () => clerk.signOut({ redirectUrl: "/" }),
  }}>{children}</AuthContext.Provider>;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured) return <>{children}</>;
  return <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    signInUrl="/login" signUpUrl="/signup"
    signInFallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/onboarding"
    appearance={{ variables: { colorPrimary: "#9b5f38", borderRadius: "0.75rem", fontFamily: "Manrope, sans-serif" } }}>
    <ClerkSession>{children}</ClerkSession>
  </ClerkProvider>;
}
