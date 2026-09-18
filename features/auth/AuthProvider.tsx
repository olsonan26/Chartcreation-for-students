import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AuthStatus = "loading" | "signed-out" | "authenticated" | "configuration-error";

export type AuthUser = {
  id: string;
  email?: string | null;
  [key: string]: unknown;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
};

export type AuthContextValue = {
  status: AuthStatus;
  session: AuthSession | null;
  user: AuthUser | null;
  error: string;
  notice: string;
  submitting: boolean;
  signIn(email: string, password: string): Promise<boolean>;
  signUp(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
  clearMessages(): void;
};

type SupabaseAuthPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: AuthUser | null;
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

class AuthRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, "");
const SUPABASE_KEY = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
)?.trim();
const AUTH_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);
const SESSION_STORAGE_KEY = "aionis.supabase.auth-session.v1";

export const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(error: unknown, action: "sign-in" | "sign-up"): string {
  if (error instanceof AuthRequestError) {
    const normalized = error.message.toLowerCase();
    if (error.status === 429) return "Too many attempts. Wait a moment and try again.";
    if (normalized.includes("invalid login credentials") || normalized.includes("invalid_credentials")) {
      return "The email or password is incorrect.";
    }
    if (normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed")) {
      return "Confirm your email address before signing in.";
    }
    if (normalized.includes("already registered") || normalized.includes("user_already_exists")) {
      return "An account with this email already exists. Try signing in.";
    }
  }
  if (action === "sign-up") {
    return "The account could not be created. Check the email and password, then retry.";
  }
  return "Sign-in failed. Check your connection and try again.";
}

async function authRequest(
  path: string,
  init: RequestInit,
  accessToken?: string,
): Promise<SupabaseAuthPayload> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new AuthRequestError(500, "Supabase authentication is not configured.");
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({} as SupabaseAuthPayload)) as SupabaseAuthPayload;

  if (!response.ok) {
    const message = payload.error_description || payload.msg || payload.message || payload.error || `Authentication request failed (${response.status}).`;
    throw new AuthRequestError(response.status, message);
  }

  return payload;
}

function normalizeSession(payload: SupabaseAuthPayload): AuthSession | null {
  if (!payload.access_token || !payload.refresh_token || !payload.user) return null;
  const expiresAt = payload.expires_at
    ?? Math.floor(Date.now() / 1000) + Math.max(60, payload.expires_in ?? 3600);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    user: payload.user,
  };
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.accessToken !== "string"
      || typeof parsed.refreshToken !== "string"
      || typeof parsed.expiresAt !== "number"
      || !parsed.user
      || typeof parsed.user.id !== "string"
    ) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed as AuthSession;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session: AuthSession | null) {
  if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>(AUTH_CONFIGURED ? "loading" : "configuration-error");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const clearMessages = useCallback(() => {
    setError("");
    setNotice("");
  }, []);

  const applySession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    writeStoredSession(nextSession);
    setStatus(nextSession ? "authenticated" : "signed-out");
  }, []);

  const refreshSession = useCallback(async (refreshToken: string) => {
    try {
      const payload = await authRequest("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const nextSession = normalizeSession(payload);
      if (!nextSession) throw new AuthRequestError(401, "The session could not be refreshed.");
      applySession(nextSession);
      return nextSession;
    } catch {
      applySession(null);
      return null;
    }
  }, [applySession]);

  useEffect(() => {
    if (!AUTH_CONFIGURED) {
      setStatus("configuration-error");
      return;
    }

    const stored = readStoredSession();
    if (!stored) {
      setStatus("signed-out");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (stored.expiresAt > now + 60) {
      setSession(stored);
      setStatus("authenticated");
      return;
    }

    void refreshSession(stored.refreshToken);
  }, [refreshSession]);

  useEffect(() => {
    if (!session) return;
    const refreshAt = session.expiresAt * 1000 - Date.now() - 60_000;
    const timeout = window.setTimeout(
      () => void refreshSession(session.refreshToken),
      Math.max(5_000, refreshAt),
    );
    return () => window.clearTimeout(timeout);
  }, [refreshSession, session]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!AUTH_CONFIGURED) return false;
    clearMessages();
    setSubmitting(true);
    try {
      const payload = await authRequest("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const nextSession = normalizeSession(payload);
      if (!nextSession) throw new AuthRequestError(401, "No session was returned.");
      applySession(nextSession);
      return true;
    } catch (authError) {
      setError(friendlyAuthError(authError, "sign-in"));
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [applySession, clearMessages]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!AUTH_CONFIGURED) return false;
    clearMessages();
    setSubmitting(true);
    try {
      const payload = await authRequest("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const nextSession = normalizeSession(payload);
      if (nextSession) {
        applySession(nextSession);
      } else {
        setNotice("Account created. Check your email to confirm it, then sign in.");
      }
      return true;
    } catch (authError) {
      setError(friendlyAuthError(authError, "sign-up"));
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [applySession, clearMessages]);

  const signOut = useCallback(async () => {
    clearMessages();
    const current = session;
    applySession(null);
    if (!current) return;
    try {
      await authRequest("/auth/v1/logout", { method: "POST" }, current.accessToken);
    } catch {
      // Local sign-out is authoritative for this client even if the network is unavailable.
    }
  }, [applySession, clearMessages, session]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    user: session?.user ?? null,
    error,
    notice,
    submitting,
    signIn,
    signUp,
    signOut,
    clearMessages,
  }), [clearMessages, error, notice, session, signIn, signOut, signUp, status, submitting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
