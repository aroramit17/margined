import { Outlet, Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Settings, LogOut, ChevronDown, Plus, TrendingUp, Sun, Moon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { applyTheme, getTheme, type Theme } from "@/lib/theme";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function Layout() {
  const { user, signOut } = useAuth();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const currentProject = projects.find((p) => p.id === projectId) ?? projects[0];

  const navLinks = currentProject
    ? [
        { to: `/dashboard/${currentProject.id}`, label: "Dashboard", icon: BarChart3 },
        { to: `/dashboard/${currentProject.id}/pricing`, label: "Pricing Calculator", icon: TrendingUp },
        { to: `/settings/${currentProject.id}`, label: "Settings", icon: Settings },
      ]
    : [];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r flex flex-col bg-card">
        <div className="h-14 flex items-center px-4 border-b">
          <span className="font-semibold text-lg tracking-tight">Margined</span>
        </div>

        {/* Project selector */}
        <div className="px-3 py-3 border-b">
          <button
            onClick={() => setProjectMenuOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
          >
            <span className="truncate font-medium">
              {currentProject?.name ?? "Select project"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
          </button>

          {projectMenuOpen && (
            <div className="mt-1 rounded border bg-card shadow-md overflow-hidden">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    navigate(`/dashboard/${p.id}`);
                    setProjectMenuOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors",
                    p.id === currentProject?.id && "bg-muted font-medium",
                  )}
                >
                  {p.name}
                </button>
              ))}
              <button
                onClick={() => {
                  navigate("/onboarding");
                  setProjectMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground border-t"
              >
                <Plus className="h-3.5 w-3.5" />
                New project
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors",
                "hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 border-t pt-3">
          <div className="text-xs text-muted-foreground truncate mb-2 px-2">
            {user?.email}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted flex-1 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme());

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
