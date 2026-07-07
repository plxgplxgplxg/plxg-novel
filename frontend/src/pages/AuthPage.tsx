import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, KeyRound, LibraryBig } from 'lucide-react';
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
    title: 'Dang nhap de tiep tuc doc va dich truyen',
    subtitle:
      'Su dung tai khoan da seed san hoac dang nhap bang tai khoan cua rieng ban.',
    actionLabel: 'Dang nhap',
    alternateLabel: 'Chua co tai khoan? Dang ky',
    alternateHref: '/register',
  },
  register: {
    title: 'Tao tai khoan moi de quan ly thu vien cua ban',
    subtitle:
      'Tai khoan moi se duoc gan token ngay sau khi dang ky va san sang goi API.',
    actionLabel: 'Dang ky',
    alternateLabel: 'Da co tai khoan? Dang nhap',
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
      setError(Array.isArray(message) ? message[0] : message || 'Auth failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-panel auth-panel-feature">
        <div className="auth-feature-badge">
          <LibraryBig size={16} />
          <span>Novel translation workspace</span>
        </div>
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <div className="auth-feature-list">
          <div className="auth-feature-card">
            <BookOpen size={18} />
            <div>
              <strong>Thu vien tach theo tai khoan</strong>
              <span>Moi user chi thay sach va tien do cua minh.</span>
            </div>
          </div>
          <div className="auth-feature-card">
            <KeyRound size={18} />
            <div>
              <strong>JWT that su</strong>
              <span>Frontend lay token, luu session va goi day du REST + SSE.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-panel auth-panel-form">
        <div className="auth-form-header">
          <span className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Create account'}</span>
          <h2>{copy.actionLabel}</h2>
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
            <label htmlFor="password">Password</label>
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
            {isSubmitting ? 'Dang xu ly...' : copy.actionLabel}
          </button>
        </form>

        <div className="demo-accounts">
          <div className="demo-accounts-header">
            <h3>Tai khoan demo</h3>
            <span>Lay tu `/auth/demo-accounts`</span>
          </div>

          {demoAccounts.length === 0 ? (
            <div className="demo-empty">Backend chua bat seed demo accounts.</div>
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
      </section>
    </div>
  );
};

export default AuthPage;
