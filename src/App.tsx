import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { MotionConfig } from 'framer-motion';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { AppShell, BootScreen } from './components/layout/AppShell';
import { EmptyState, GlassButton, SessionCardSkeleton, ToastProvider } from './components/ui';
import { useLoadStatus, useMe } from './lib/hooks';
import { store } from './lib/store';
import { connectRealtime } from './lib/realtime';
import { Home } from './screens/Home';
import { Explore } from './screens/Explore';
import { SessionDetail } from './screens/SessionDetail';
import { Auth } from './screens/Auth';
import { Onboarding } from './screens/Onboarding';

const CreateSession = lazy(() => import('./screens/CreateSession').then((m) => ({ default: m.CreateSession })));
const Profile = lazy(() => import('./screens/Profile').then((m) => ({ default: m.Profile })));
const EditProfile = lazy(() => import('./screens/EditProfile').then((m) => ({ default: m.EditProfile })));
const MySessions = lazy(() => import('./screens/MySessions').then((m) => ({ default: m.MySessions })));
const RateSession = lazy(() => import('./screens/RateSession').then((m) => ({ default: m.RateSession })));
const Messages = lazy(() => import('./screens/Messages').then((m) => ({ default: m.Messages })));
const Chat = lazy(() => import('./screens/Messages').then((m) => ({ default: m.ChatScreen })));
const Notifications = lazy(() => import('./screens/Notifications').then((m) => ({ default: m.Notifications })));
const Players = lazy(() => import('./screens/Players').then((m) => ({ default: m.Players })));
const NotFound = lazy(() => import('./screens/NotFound').then((m) => ({ default: m.NotFound })));

function Fallback() {
  return (
    <div className="mx-auto grid grid-cols-1 max-w-[1100px] gap-4 px-5 pt-[calc(24px+var(--safe-top))] md:grid-cols-2 md:px-8 md:pt-8">
      <SessionCardSkeleton />
      <SessionCardSkeleton className="hidden md:block" />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FaliJedan greška:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="mx-auto grid grid-cols-1 min-h-dvh max-w-md place-items-center px-5">
        <EmptyState
          icon={TriangleAlert}
          title={offline ? 'Nema internet veze' : 'Nešto nije u redu'}
          text={offline ? 'Provjeri konekciju i pokušaj ponovo — sačuvani podaci su na sigurnom.' : 'Došlo je do greške pri učitavanju ekrana. Pokušaj ponovo.'}
          action={
            <GlassButton icon={RefreshCw} onClick={() => window.location.reload()}>
              Pokušaj ponovo
            </GlassButton>
          }
        />
      </div>
    );
  }
}

/** Javne rute (prijava) — prijavljenog korisnika vraćamo u aplikaciju. */
function PublicOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  const status = useLoadStatus();
  const from = (location.state as { from?: string } | null)?.from;
  if (!me && status === 'loading') return <BootScreen />;
  if (me) return <Navigate to={me.onboarded ? from || '/' : '/dobrodosli'} replace />;
  return children;
}

function RequireUser({ children }: { children: ReactNode }) {
  const me = useMe();
  const status = useLoadStatus();
  if (!me && status === 'loading') return <BootScreen />;
  if (!me) return <Navigate to="/prijava" replace />;
  if (me.onboarded) return <Navigate to="/" replace />;
  return children;
}

/** Prvi sync sa serverom + realtime veza za prijavljenog korisnika. */
function DataBoot() {
  const me = useMe();
  useEffect(() => {
    void store.refresh();
  }, []);
  useEffect(() => {
    connectRealtime(me?.id ?? null);
  }, [me?.id]);
  return null;
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <BrowserRouter>
          <DataBoot />
          <ErrorBoundary>
            <Suspense fallback={<Fallback />}>
              <Routes>
                <Route
                  path="/prijava"
                  element={
                    <PublicOnly>
                      <Auth />
                    </PublicOnly>
                  }
                />
                <Route
                  path="/dobrodosli"
                  element={
                    <RequireUser>
                      <Onboarding />
                    </RequireUser>
                  }
                />
                <Route element={<AppShell />}>
                  <Route index element={<Home />} />
                  <Route path="istrazi" element={<Explore />} />
                  <Route path="termin/:id" element={<SessionDetail />} />
                  <Route path="termin/:id/ocijeni" element={<RateSession />} />
                  <Route path="organizuj" element={<CreateSession />} />
                  <Route path="igraci" element={<Players />} />
                  <Route path="moji-termini" element={<MySessions />} />
                  <Route path="poruke" element={<Messages />} />
                  <Route path="poruke/:threadId" element={<Chat />} />
                  <Route path="obavjestenja" element={<Notifications />} />
                  <Route path="profil" element={<Profile />} />
                  <Route path="profil/uredi" element={<EditProfile />} />
                  <Route path="igrac/:id" element={<Profile />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </MotionConfig>
  );
}
