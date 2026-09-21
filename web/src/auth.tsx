import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MeResponse } from "@smartshop/shared";
import { ensureAmplify } from "./amplify";
import { getMe } from "./api";
import { getIdToken, tokenHasAdminGroup } from "./cognitoSession";

type AuthState = {
  ready: boolean;
  user: MeResponse | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      await ensureAmplify();
      const { getCurrentUser } = await import("aws-amplify/auth");
      await getCurrentUser();
      const me = await getMe();
      setUser(me);
      setIsAdmin(tokenHasAdminGroup(await getIdToken()));
    } catch (error) {
      setUser(null);
      setIsAdmin(false);
      throw error;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    let stopHub: (() => void) | undefined;
    void import("aws-amplify/utils").then(({ Hub }) => {
      if (cancelled) {
        return;
      }
      stopHub = Hub.listen("auth", ({ payload }) => {
        if (payload.event === "signedOut") {
          setUser(null);
          setIsAdmin(false);
        }
        if (payload.event === "signedIn") {
          void refresh().catch(() => undefined);
        }
      });
    });
    return () => {
      cancelled = true;
      stopHub?.();
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await ensureAmplify();
    const { signOut: amplifySignOut } = await import("aws-amplify/auth");
    await amplifySignOut();
    setUser(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo(
    () => ({ ready, user, isAdmin, refresh, signOut }),
    [ready, user, isAdmin, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
