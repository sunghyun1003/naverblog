import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ReviewPage } from "./features/review/ReviewPage";
import { useAuth } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { HomePage } from "./features/operations/HomePage";
import { TrendsPage } from "./features/operations/TrendsPage";
import { SchedulePage } from "./features/operations/SchedulePage";
import { SettingsPage } from "./features/operations/SettingsPage";

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading" role="status">운영센터를 불러오는 중...</div>;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/contents" replace />} />
        <Route
          path="home"
          element={<HomePage />}
        />
        <Route path="contents" element={<DashboardPage />} />
        <Route path="contents/:contentId" element={<ReviewPage />} />
        <Route
          path="trends"
          element={<TrendsPage />}
        />
        <Route
          path="schedule"
          element={<SchedulePage />}
        />
        <Route
          path="analytics"
          element={<PlaceholderPage title="성과" description="게시물별 조회와 유입 성과를 연결할 영역입니다." />}
        />
        <Route
          path="settings"
          element={<SettingsPage />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/contents" replace />} />
    </Routes>
  );
}
