import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { PlaceholderPage } from "./components/PlaceholderPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ReviewPage } from "./features/review/ReviewPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/contents" replace />} />
        <Route
          path="home"
          element={<PlaceholderPage title="홈" description="팀의 오늘 할 일과 운영 현황을 한눈에 보는 영역입니다." />}
        />
        <Route path="contents" element={<DashboardPage />} />
        <Route path="contents/:contentId" element={<ReviewPage />} />
        <Route
          path="trends"
          element={<PlaceholderPage title="트렌드 수집" description="네이버·커뮤니티·YouTube 수집기를 연결할 영역입니다." />}
        />
        <Route
          path="schedule"
          element={<PlaceholderPage title="발행 일정" description="승인된 콘텐츠의 예약과 발행 일정을 관리할 영역입니다." />}
        />
        <Route
          path="analytics"
          element={<PlaceholderPage title="성과" description="게시물별 조회와 유입 성과를 연결할 영역입니다." />}
        />
        <Route
          path="settings"
          element={<PlaceholderPage title="설정" description="팀원, 권한, 출처, 자동화 연결을 관리할 영역입니다." />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/contents" replace />} />
    </Routes>
  );
}
