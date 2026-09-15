import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(), signInWithPassword: vi.fn(), signInWithOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
const exitDemo = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth }) }));
vi.mock("@/lib/demo", () => ({ exitDemo }));
import Login from "../src/pages/Login";
import AuthCallback from "../src/pages/AuthCallback";

function page(path = "/login") {
  window.history.replaceState(null, "", path);
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/dashboard" element={<p>Dashboard reached</p>} />
    <Route path="/onboarding" element={<p>Onboarding reached</p>} />
  </Routes></MemoryRouter></StrictMode>);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("login", () => {
  it("waits for email confirmation instead of entering protected onboarding", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    page();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText("Check your email");
    expect(screen.queryByText("Onboarding reached")).toBeNull();
    expect(exitDemo).not.toHaveBeenCalled();
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(`${window.location.origin}/auth/callback`);
  });

  it("passes the allowed callback URL when requesting an email link", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    page();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));
    await screen.findByText("Check your email");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "owner@example.com", options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
  });

  it("keeps failed password sign-in out of the dashboard", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    page();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid login credentials");
    expect(screen.queryByText("Dashboard reached")).toBeNull();
  });
});

describe("email callback", () => {
  it("exchanges a one-time code once under StrictMode and exits demo only with a session", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: { user: { id: "owner" } } }, error: null });
    page("/auth/callback?code=success-code");
    await screen.findByText("Dashboard reached");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exitDemo).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });

  it("rejects expired codes without establishing a session", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error("expired") });
    page("/auth/callback?code=expired-code");
    await screen.findByRole("alert");
    expect(exitDemo).not.toHaveBeenCalled();
    expect(screen.queryByText("Dashboard reached")).toBeNull();
  });

  it("does not exchange provider errors or missing codes", async () => {
    page("/auth/callback?error=access_denied&error_description=untrusted");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("expired"));
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(screen.queryByText("untrusted")).toBeNull();
  });
});
