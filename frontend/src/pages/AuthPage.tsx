import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, KeyRound, LibraryBig } from 'lucide-react';
import { fetchDemoAccounts, type DemoAccount } from '../api';
import { useAuth } from '../auth/useAuth';

type AuthMode = 'login' | 'register';

const AUTH_PAGE_COPY: Record<
  AuthMode,
  {
    title: string;
    subtitle: string;
    actionLabel: string;
    alternateLabel: string;
    alternateHref: string;
  }
> = {
  login: {
    title: 'Đăng nhập để tiếp tục đọc và dịch truyện',
    subtitle:
      'Sử dụng tài khoản đã seed sẵn hoặc đăng nhập bằng tài khoản của riêng bạn.',
    actionLabel: 'Đăng nhập',
    alternateLabel: 'Chưa có tài khoản? Đăng ký',
    alternateHref: '/register',
  },
  register: {
    title: 'Tạo tài khoản mới để quản lý thư viện của bạn',
    subtitle:
      'Tài khoản mới sẽ được gán token ngay sau khi đăng ký và sẵn sàng gọi API.',
    actionLabel: 'Đăng ký',
    alternateLabel: 'Đã có tài khoản? Đăng nhập',
    alternateHref: '/login',
  },
};

const AuthPage = ({ mode }: { mode: AuthMode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isReady, login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: demoAccounts = [] } = useQuery<DemoAccount[]>({
    queryKey: ['demo-accounts'],
    queryFn: fetchDemoAccounts,
  });

  const copy = AUTH_PAGE_COPY[mode];
  const redirectTarget = useMemo(() => {
    const next = location.state?.from?.pathname;
    return typeof next === 'string' ? next : '/';
  }, [location.state]);

  if (isReady && isAuthenticated) {
    return <Navigate to={redirectTarget} replace />;
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const action = mode === 'login' ? login : register;
      await action({ email, password });
      navigate(redirectTarget, { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message[0] : message || 'Xác thực thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <div className="app-container">
        <section className="page-hero auth-hero">
          <div>
            <span className="eyebrow">Truy cập thư viện</span>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
          <div className="auth-hero-badge">
            <LibraryBig size={18} />
            <span>Thư viện số cho quy trình dịch bất đồng bộ</span>
          </div>
        </section>

        <div className="auth-layout">
          <section className="card auth-form-card">
            <div className="auth-form-header">
              <span className="eyebrow">
                {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </span>
              <h2>{copy.actionLabel}</h2>
              <p className="auth-form-description">
                Token sẽ được lưu cục bộ và dùng lại cho toàn bộ REST API, upload và SSE.
              </p>
              <Link to={copy.alternateHref} className="auth-switch-link">
                {copy.alternateLabel}
              </Link>
            </div>

            <form onSubmit={submit} className="auth-form">
              <div className="input-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="rinchan@example.com"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="password">Mật khẩu</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password123"
                  minLength={8}
                  required
                />
              </div>

              {error ? <div className="form-error">{error}</div> : null}

              <button type="submit" className="btn" disabled={isSubmitting}>
                {isSubmitting ? 'Đang xử lý...' : copy.actionLabel}
                <ArrowRight size={16} />
              </button>
            </form>
          </section>

          <aside className="card auth-side-card">
            <div className="auth-side-section">
              <div className="auth-side-header">
                <BookOpen size={18} />
                <h3>Tài khoản demo</h3>
              </div>
              <p className="auth-side-copy">
                Dữ liệu được lấy trực tiếp từ API `GET /auth/demo-accounts`. Bấm vào một tài khoản để điền nhanh form.
              </p>

              {demoAccounts.length === 0 ? (
                <div className="demo-empty">Backend chưa bật seed demo accounts.</div>
              ) : (
                <div className="demo-account-list">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      className="demo-account-card"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword(account.password);
                      }}
                    >
                      <strong>{account.email}</strong>
                      <span>{account.password}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="auth-side-section auth-side-section-muted">
              <div className="auth-side-header">
                <KeyRound size={18} />
                <h3>Phiên đăng nhập</h3>
              </div>
              <p className="auth-side-copy">
                Mỗi tài khoản nhìn thấy thư viện riêng, tiến độ riêng và luồng đọc riêng theo đúng phân tách dữ liệu user.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
