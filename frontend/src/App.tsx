import type { ReactElement } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookOpen, LayoutDashboard, LogOut, Upload } from 'lucide-react';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import ReaderPage from './pages/ReaderPage';
import BookDetailPage from './pages/BookDetailPage';
import AuthPage from './pages/AuthPage';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router basename="/plxg-novel">
          <Routes>
            <Route path="/login" element={<PublicOnlyRoute><AuthPage mode="login" /></PublicOnlyRoute>} />
            <Route path="/register" element={<PublicOnlyRoute><AuthPage mode="register" /></PublicOnlyRoute>} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/books/:bookId" element={<BookDetailPage />} />
                <Route path="/books/:bookId/chapters/:chapterId" element={<ReaderPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const ProtectedRoute = () => {
  const { isAuthenticated, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return <FullScreenState title="Dang xac thuc" description="Frontend dang kiem tra token va tai khoan hien tai." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

const PublicOnlyRoute = ({ children }: { children: ReactElement }) => {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return <FullScreenState title="Dang tai auth" description="Dang dong bo session hien co." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const AppLayout = () => {
  const { logout, user } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <BookOpen size={18} />
          </div>
          <div>
            <span className="eyebrow">Plxg Novel</span>
            <h1>Translation Library</h1>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            end
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/upload"
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          >
            <Upload size={18} />
            <span>Upload</span>
          </NavLink>
        </nav>

        <div className="account-panel">
          <div>
            <span className="eyebrow">Signed in</span>
            <strong>{user?.email}</strong>
          </div>
          <button type="button" className="btn btn-secondary" onClick={logout}>
            <LogOut size={16} />
            <span>Dang xuat</span>
          </button>
        </div>
      </aside>

      <div className="content-shell">
        <main className="app-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const FullScreenState = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div className="fullscreen-state">
    <div className="fullscreen-card">
      <span className="eyebrow">Authentication</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  </div>
);

export default App;
