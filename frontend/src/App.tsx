import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { enterDemo } from "@/lib/demo";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import CustomerDetail from "@/pages/CustomerDetail";
import PricingCalculator from "@/pages/PricingCalculator";
import Settings from "@/pages/Settings";
import Security from "@/pages/docs/Security";
import Terms from "@/pages/docs/Terms";
import Privacy from "@/pages/docs/Privacy";
import Changelog from "@/pages/docs/Changelog";
import Layout from "@/components/Layout";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Home() {
  const { user, loading, isDemo } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  // Demo visitors keep the landing page reachable; real sessions skip it.
  return user && !isDemo ? <Navigate to="/dashboard" replace /> : <Landing />;
}

function EnterDemo() {
  enterDemo();
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/demo" element={<EnterDemo />} />
      <Route path="/security" element={<Security />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/changelog" element={<Changelog />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="dashboard/:projectId" element={<Dashboard />} />
        <Route path="dashboard/:projectId/customers/:customerId" element={<CustomerDetail />} />
        <Route path="dashboard/:projectId/pricing" element={<PricingCalculator />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/:projectId" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
