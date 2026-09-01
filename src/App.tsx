import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ReviewPage } from "./features/review/ReviewPage";
import { useAuth } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { HomePage } from "./features/operations/HomePage";
import { TrendsPage } from "./features/operations/TrendsPage";
import { SchedulePage } from "./features/operations/SchedulePage";
import { SettingsPage } from "./features/operations/SettingsPage";
import { AutomationHistoryPage } from "./features/operations/AutomationHistoryPage";
import { BrandMark } from "./components/BrandMark";

function KeyedReviewPage() {
  const { contentId } = useParams();
  return <ReviewPage key={contentId ?? "missing-content"} />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="auth-loading" role="status" aria-live="polite">
      <div className="auth-loading__panel">
        <BrandMark />
        <div><strong>블로그 운영센터</strong><span>로그인 상태를 확인하고 있습니다.</span></div>
        <span className="auth-loading__spinner" aria-hidden="true" />
      </div>
    </div>
  );
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route
          path="home"
          element={<HomePage />}
        />
        <Route path="contents" element={<DashboardPage />} />
        <Route path="contents/:contentId" element={<KeyedReviewPage />} />
        <Route
          path="trends"
          element={<TrendsPage />}
        />
        <Route
          path="schedule"
          element={<SchedulePage />}
        />
        <Route path="history" element={<AutomationHistoryPage />} />
        <Route
          path="settings"
          element={<SettingsPage />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
