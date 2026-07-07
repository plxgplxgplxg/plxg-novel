import { createContext } from 'react';
import type {
  AuthCredentials,
  AuthResponse,
  AuthUser,
} from '../api';

export interface AuthContextValue {
  isAuthenticated: boolean;
  isReady: boolean;
  user: AuthUser | null;
  login: (credentials: AuthCredentials) => Promise<AuthResponse>;
  register: (credentials: AuthCredentials) => Promise<AuthResponse>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
