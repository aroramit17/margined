import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({user:null as any, loaded:true, getToken:vi.fn(), signOut:vi.fn()}));
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({children}:any) => children,
  useUser: () => ({isLoaded:state.loaded,user:state.user}),
  useAuth: () => ({isSignedIn:Boolean(state.user),getToken:state.getToken}),
  useClerk: () => ({signOut:state.signOut}),
  SignIn: () => <p>Clerk sign-in</p>, SignUp: () => <p>Clerk sign-up</p>,
}));
import AuthProvider from '../src/components/AuthProvider';
import Login from '../src/pages/Login';
import { getSessionToken } from '../src/lib/auth-token';
import { api } from '../src/lib/api';
import { enterDemo, isDemoActive } from '../src/lib/demo';

function view(path='/login', client=new QueryClient()) {
  return <StrictMode><QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path='/login/*' element={<Login />} />
    <Route path='/signup/*' element={<Login signup />} />
    <Route path='/dashboard' element={<p>Dashboard reached</p>} />
  </Routes></MemoryRouter></AuthProvider></QueryClientProvider></StrictMode>;
}
beforeEach(()=>{state.user=null;state.loaded=true;vi.clearAllMocks();sessionStorage.clear();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows Clerk sign-in for signed-out users',()=>{render(view());expect(screen.getByText('Clerk sign-in')).toBeTruthy();});
it('supports nested signup verification routes',()=>{render(view('/signup/verify-email-address'));expect(screen.getByText('Clerk sign-up')).toBeTruthy();});
it('does not show protected content while Clerk is loading',()=>{state.loaded=false;render(view());expect(screen.getByRole('status').textContent).toContain('Loading');expect(screen.queryByText('Dashboard reached')).toBeNull();});
it('exits demo and retrieves a fresh token for each API call',async()=>{
  enterDemo();state.user={id:'user_a',primaryEmailAddress:{emailAddress:'a@example.com'}};
  state.getToken.mockResolvedValueOnce('session-one').mockResolvedValueOnce('session-two');
  const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>[]});vi.stubGlobal('fetch',fetcher);
  render(view());expect(await screen.findByText('Dashboard reached')).toBeTruthy();expect(isDemoActive()).toBe(false);
  await api.projects.list();await api.projects.list();
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer session-one');
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer session-two');
});
it('clears cached customer data when the signed-in identity changes',()=>{
  const client=new QueryClient();state.user={id:'user_a'};const ui=render(view('/login',client));
  client.setQueryData(['projects'],[{name:'private A'}]);state.user={id:'user_b'};ui.rerender(view('/login',client));
  expect(client.getQueryData(['projects'])).toBeUndefined();
});
it('clears the token getter when the auth provider unmounts',async()=>{
  state.user={id:'user_a'};state.getToken.mockResolvedValue('session-one');const ui=render(view());
  expect(await getSessionToken()).toBe('session-one');ui.unmount();expect(await getSessionToken()).toBeNull();
});
