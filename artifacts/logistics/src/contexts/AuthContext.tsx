import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type AuthRole = "customer" | "driver" | "admin" | "fusingao_fleet" | "fleet_owner" | "fleet_driver";

export interface AuthUser {
  id: number;
  role: AuthRole;
  name: string;
  phone?: string;
  username?: string;
  fleetId?: number;
  franchisee_id?: number;
  franchisee_name?: string;
  driver_id?: number;
  driver_name?: string;
  fleet_name?: string;
  fleet_code?: string;
}

interface AuthCtxValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  loginTemp: (token: string, user: AuthUser) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthCtxValue | null>(null);

const TOKEN_KEY = "auth-jwt";
const USER_KEY = "auth-user";

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => load<AuthUser>(USER_KEY));

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  // loginTemp: update React state only (does NOT write to localStorage — preserves existing session)
  const loginTemp = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, loginTemp, logout, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
