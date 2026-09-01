import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AuthProvider } from "./features/auth/AuthProvider";
import "./styles/globals.css";
import "./styles/components.css";
import "./styles/app-shell.css";
import "./styles/dashboard.css";
import "./styles/review.css";
import "./styles/auth.css";
import "./styles/operations.css";
import "./styles/product-theme.css";

// Firebase Hosting proxies clean paths to Cloud Run. Keep hash routing only
// for the GitHub Pages preview, which cannot serve BrowserRouter fallbacks.
const Router = import.meta.env.VITE_USE_HASH_ROUTER === "true" ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <Router>
          <App />
        </Router>
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
