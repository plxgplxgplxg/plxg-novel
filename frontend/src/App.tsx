import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Upload, LayoutDashboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { login } from './api';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import ReaderPage from './pages/ReaderPage';
import BookDetailPage from './pages/BookDetailPage';

const queryClient = new QueryClient();

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    login().then(() => setIsAuthenticated(true)).catch(console.error);
  }, []);

  if (!isAuthenticated) return <div>Authenticating...</div>;

  return (
    <QueryClientProvider client={queryClient}>
      <Router basename="/plxg-novel">
        <div className="app-container">
          <header className="header">
            <h1>Plxg Novel</h1>
            <nav className="nav-links">
              <NavLink 
                to="/" 
                className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
                end
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </div>
              </NavLink>
              <NavLink 
                to="/upload" 
                className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Upload size={18} />
                  <span>Upload</span>
                </div>
              </NavLink>
            </nav>
          </header>

          <main>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/books/:bookId" element={<BookDetailPage />} />
              <Route path="/books/:bookId/chapters/:chapterId" element={<ReaderPage />} />
            </Routes>
          </main>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
