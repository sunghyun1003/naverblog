import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  FileText,
  Home,
  Menu,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BrandMark } from "./BrandMark";

const navigation = [
  { label: "홈", path: "/home", icon: Home, exact: true },
  { label: "트렌드 수집", path: "/trends", icon: Sparkles },
  { label: "콘텐츠", path: "/contents", icon: FileText },
  { label: "발행 일정", path: "/schedule", icon: CalendarDays },
  { label: "성과", path: "/analytics", icon: BarChart3 },
  { label: "설정", path: "/settings", icon: Settings },
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isContentPath = location.pathname.startsWith("/contents");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <button className="mobile-menu-button" type="button" aria-label="메뉴 열기" onClick={() => setMobileOpen(true)}>
            <Menu size={22} />
          </button>
          <BrandMark />
          <span>블로그 운영센터</span>
        </div>
        <div className="topbar__account">
          <button className="notification-button" type="button" aria-label="새 알림 1개">
            <Bell size={21} />
            <span aria-hidden="true" />
          </button>
          <span className="avatar avatar--large">김</span>
          <span className="account-name">김서연</span>
          <ChevronDown size={17} aria-hidden="true" />
        </div>
      </header>

      <div className="app-shell__body">
        {mobileOpen ? <button className="drawer-scrim" aria-label="메뉴 닫기" onClick={() => setMobileOpen(false)} /> : null}
        <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
          <div className="sidebar__mobile-heading">
            <strong>메뉴</strong>
            <button className="icon-button" type="button" aria-label="메뉴 닫기" onClick={() => setMobileOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <nav aria-label="주요 메뉴">
            {navigation.map(({ label, path, icon: Icon, exact }) => {
              const contentSelected = label === "콘텐츠" && isContentPath;
              return (
                <NavLink
                  key={label}
                  to={path}
                  end={exact}
                  className={({ isActive }) =>
                    `sidebar__item ${contentSelected || isActive ? "sidebar__item--active" : ""}`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={22} strokeWidth={2.1} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
