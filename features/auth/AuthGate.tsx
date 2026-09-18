import type { ReactNode } from "react";

import { AuthConfigurationScreen, AuthLoadingScreen, AuthScreen } from "./AuthScreen";
import { useAuth } from "./useAuth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") return <AuthLoadingScreen />;
  if (status === "configuration-error") return <AuthConfigurationScreen />;
  if (status === "signed-out") return <AuthScreen />;
  return children;
}
