import { useSessionAuth } from "@/components/AuthProvider";
import { exitDemo, isDemoActive } from "@/lib/demo";

export function useAuth() {
  const auth = useSessionAuth();
  const demo = !auth.user && isDemoActive();
  return {
    user: auth.user ?? (demo ? { id: "demo-user", email: "demo@usecapybara.com" } : null),
    loading: demo ? false : auth.loading,
    isDemo: demo,
    signOut: () => {
      if (!demo) return auth.signOut();
      exitDemo();
      window.location.href = "/";
      return Promise.resolve();
    },
  };
}
