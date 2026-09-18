import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../app/globals.css";
import App from "../app/page";
import { AuthGate } from "../features/auth/AuthGate";
import { AuthProvider } from "../features/auth/AuthProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
);
