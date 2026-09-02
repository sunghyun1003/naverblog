import {
  Bell,
  CalendarDays,
  FileText,
  Home,
  Menu,
  Settings,
  Sparkles,
  X,
  LogOut,
  ListChecks,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { useAuth } from "../features/auth/AuthProvider";

const navigationGroups = [
  {
    label: "운영",
    items: [
      { label: "홈", path: "/home", icon: Home, exact: true },
      { label: "트렌드 수집", path: "/trends", icon: Sparkles },
      { label: "콘텐츠", path: "/contents", icon: FileText },
      { label: "발행 일정", path: "/schedule", icon: CalendarDays },
    ],
  },
  {
    label: "관리",
    items: [{ label: "실행 이력", path: "/history", icon: ListChecks }, { label: "설정", path: "/settings", icon: Settings }],
  },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();

  const isContentPath = location.pathname.startsWith("/contents");

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || event.target.closest(".notification-center")) return;
      setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("click", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

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
          <div className="notification-center">
            <button
              className="notification-button"
              type="button"
              aria-label="알림"
              aria-expanded={notificationsOpen}
              aria-controls="notification-popover"
              onClick={() => setNotificationsOpen((current) => !current)}
            >
            <Bell size={21} />
            <span aria-hidden="true" />
            </button>
            {notificationsOpen ? (
              <div className="notification-popover" id="notification-popover" role="dialog" aria-label="확인할 내용">
                <header><strong>확인할 내용</strong><span>운영 상태를 빠르게 확인하세요.</span></header>
                <Link to="/contents?filter=ready" onClick={() => setNotificationsOpen(false)}>
                  <span className="notification-popover__dot notification-popover__dot--brand" />
                  <span><strong>완성 원고</strong><small>원고와 근거를 확인할 콘텐츠</small></span>
                </Link>
                <Link to="/history?status=failure" onClick={() => setNotificationsOpen(false)}>
                  <span className="notification-popover__dot notification-popover__dot--critical" />
                  <span><strong>실행 이력 확인</strong><small>실패하거나 중단된 자동화 작업</small></span>
                </Link>
                <Link to="/trends" onClick={() => setNotificationsOpen(false)}>
                  <span className="notification-popover__dot notification-popover__dot--positive" />
                  <span><strong>최근 소재 수집</strong><small>최신 수집일과 후보를 확인</small></span>
                </Link>
              </div>
            ) : null}
          </div>
          <span className="avatar avatar--large">C</span>
          <span className="account-name">{user?.name ?? "carrot"}</span>
          <button className="logout-button" type="button" onClick={() => void logout()} aria-label="로그아웃">
            <LogOut size={17} aria-hidden="true" />
            <span>로그아웃</span>
          </button>
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
            {navigationGroups.map((group) => (
              <div className="sidebar__group" key={group.label}>
                <span className="sidebar__group-label">{group.label}</span>
                {group.items.map(({ label, path, icon: Icon, exact }) => {
                  const contentSelected = label === "콘텐츠" && isContentPath;
                  return (
                    <NavLink
                      key={label}
                      to={path}
                      end={exact}
                      className={({ isActive }) =>
                        `sidebar__item ${contentSelected || isActive || (path === "/home" && location.pathname === "/") ? "sidebar__item--active" : ""}`
                      }
                      onClick={() => setMobileOpen(false)}
                    >
                      <Icon size={19} strokeWidth={2} aria-hidden="true" />
                      <span>{label}</span>
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar__footer"><span className="sidebar__footer-dot" />오늘도 차분하게 운영해요</div>
        </aside>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
