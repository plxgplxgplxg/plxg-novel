import type { ReactElement } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Navigate,
  Outlet,
  Link,
  useLocation,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard, LibraryBig, LogOut, Upload } from 'lucide-react';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import ReaderPage from './pages/ReaderPage';
import BookDetailPage from './pages/BookDetailPage';
import AuthPage from './pages/AuthPage';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';

const queryClient = new QueryClient();
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router basename={routerBasename === '/' ? undefined : routerBasename}>
          <Routes>
            <Route path="/login" element={<PublicOnlyRoute><AuthPage mode="login" /></PublicOnlyRoute>} />
            <Route path="/register" element={<PublicOnlyRoute><AuthPage mode="register" /></PublicOnlyRoute>} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/books/:bookId" element={<BookDetailPage />} />
              <Route path="/books/:bookId/chapters/:chapterId" element={<ReaderPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/upload" element={<UploadPage />} />
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
    return <FullScreenState title="Đang xác thực" description="Hệ thống đang kiểm tra phiên đăng nhập hiện tại." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

const PublicOnlyRoute = ({ children }: { children: ReactElement }) => {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return <FullScreenState title="Đang tải phiên" description="Đang đồng bộ token và dữ liệu tài khoản." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const AppLayout = () => {
  const { logout, user, isAuthenticated } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <LibraryBig size={18} />
          </div>
          <div>
            <span className="eyebrow">Plxg Novel</span>
            <h1>Thư viện dịch truyện</h1>
          </div>
        </div>

        <p className="sidebar-copy">
          Theo dõi toàn bộ tiến độ upload, tách chương và dịch nền trong một không gian đọc tĩnh tại.
        </p>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            end
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
          {isAuthenticated ? (
            <NavLink
              to="/upload"
              className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            >
              <Upload size={18} />
              <span>Upload</span>
            </NavLink>
          ) : null}
        </nav>

        <div className="account-panel">
          {isAuthenticated ? (
            <>
              <div>
                <span className="eyebrow">Đăng nhập</span>
                <strong>{user?.email}</strong>
              </div>
              <button type="button" className="btn btn-secondary" onClick={logout}>
                <LogOut size={16} />
                <span>Đăng xuất</span>
              </button>
            </>
          ) : (
            <>
              <div>
                <span className="eyebrow">Khách đọc</span>
                <strong>Đọc công khai</strong>
              </div>
              <Link to="/login" className="btn btn-secondary">
                <span>Đăng nhập để dịch</span>
              </Link>
            </>
          )}
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
