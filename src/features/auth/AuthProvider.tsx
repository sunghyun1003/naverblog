import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, getSession, login as loginRequest, logout as logoutRequest } from "../../api/client";
import type { ApiUser } from "../../api/types";

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const previewMode = import.meta.env.VITE_PREVIEW_MODE === "true";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (previewMode) {
      if (sessionStorage.getItem("carrot-preview-session") === "active") {
        setUser({ id: "carrot", name: "carrot", roles: ["admin"] });
      }
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    getSession(controller.signal)
      .then((response) => setUser(response.user))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError && error.status === 401) setUser(null);
        else setUser(null);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(username, password) {
      if (previewMode) {
        if (username !== "carrot" || password !== "carrot") throw new ApiError("아이디 또는 비밀번호가 올바르지 않습니다.", 401, "INVALID_CREDENTIALS");
        sessionStorage.setItem("carrot-preview-session", "active");
        setUser({ id: "carrot", name: "carrot", roles: ["admin"] });
        return;
      }
      const response = await loginRequest(username, password);
      setUser(response.user);
    },
    async logout() {
      if (previewMode) sessionStorage.removeItem("carrot-preview-session");
      else await logoutRequest();
      setUser(null);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider 안에서 useAuth를 사용해야 합니다.");
  return value;
}
