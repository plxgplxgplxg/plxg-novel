import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  fetchCurrentUser,
  login as loginRequest,
  register as registerRequest,
  type AuthCredentials,
  type AuthResponse,
  type AuthUser,
} from '../api';
import { TOKEN_STORAGE_KEY } from '../api/client';
import { AuthContext } from './auth-context';

const readStoredToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);

const writeStoredToken = (token: string) => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

const clearStoredToken = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const token = readStoredToken();

    if (!token) {
      setIsReady(true);
      return;
    }

    fetchCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
      })
      .catch(() => {
        clearStoredToken();
        setUser(null);
      })
      .finally(() => {
        setIsReady(true);
      });
  }, []);

  const applyAuthResponse = (response: AuthResponse) => {
    writeStoredToken(response.accessToken);
    setUser(response.user);
    return response;
  };

  const login = async (credentials: AuthCredentials) => {
    const response = await loginRequest(credentials);
    return applyAuthResponse(response);
  };

  const register = async (credentials: AuthCredentials) => {
    const response = await registerRequest(credentials);
    return applyAuthResponse(response);
  };

  const logout = () => {
    clearStoredToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: Boolean(user),
        isReady,
        user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
