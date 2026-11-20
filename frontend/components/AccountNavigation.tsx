"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, MessageSquare, LogOut, Plus, ArrowUpRight } from "lucide-react";
import { useCurrentAccount } from "./SessionGate";
import { signOut } from "../lib/authSession";
import { portalHome, portalLabel, portalSection, type AccountRole } from "../lib/portalRoutes";
import { useNotifications } from "./NotificationProvider";
import { requestApi } from "../lib/apiClientCore";

export function NotificationBell() {
  const account = useCurrentAccount();
  const { unreadCount } = useNotifications();
  return <Link prefetch={false} href={portalSection(account?.role ?? "CANDIDATE", "notifications")} aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"} title="Thông báo" className="notification-bell">
    <Bell size={20} strokeWidth={1.7} aria-hidden="true" />
    {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
  </Link>;
}

export function MessageNavButton() {
  const account = useCurrentAccount();
  const { unreadMessageCount } = useNotifications();
  const role = account?.role ?? "CANDIDATE";
  if (role === "ADMIN") return null;
  return (
    <Link
      prefetch={false}
      className="notification-bell"
      href={portalSection(role, "messages")}
      aria-label={unreadMessageCount > 0 ? `Tin nhắn, ${unreadMessageCount} chưa đọc` : "Tin nhắn"}
      title="Tin nhắn"
    >
      <MessageSquare size={20} strokeWidth={1.7} aria-hidden="true" />
      {unreadMessageCount > 0 && (
        <span className="notification-count">{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</span>
      )}
    </Link>
  );
}

export function AccountNavigation({
  workspace = false,
  portal = "CANDIDATE",
  name,
  avatarUrl,
}: {
  workspace?: boolean;
  portal?: AccountRole;
  name?: string;
  avatarUrl?: string | null;
}) {
  const account = useCurrentAccount();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<{ fullName?: string; avatarUrl?: string } | null>(null);

  const role = account?.role ?? portal;
  const candidateLinks = [{ label: "Trang chủ", href: "/" }, { label: "Tìm việc làm", href: "/candidate/jobs" }, { label: "Công ty", href: account?.role === "CANDIDATE" ? "/candidate/companies" : "/companies" }];
  const links = workspace ? role === "CANDIDATE" ? candidateLinks : [{ label: role === "ADMIN" ? "Trung tâm quản trị" : "Trang chủ", href: portalHome(role) }]
    : portal === "RECRUITER" ? [{ label: "Trang chủ", href: "/recruiter" }, { label: "Giải pháp tuyển dụng", href: "/recruiter#solutions" }, { label: "Quy trình", href: "/recruiter#how-it-works" }]
      : candidateLinks;

  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl, loadedProfile?.avatarUrl]);

  useEffect(() => {
    if (name !== undefined || !account) return;
    let active = true;

    if (account.role === "RECRUITER") {
      void requestApi<{ fullName?: string; avatarUrl?: string }>("/api/auth/me/recruiter-profile", {
        privateData: true,
        timeoutMs: 5000,
      }).then(res => {
        if (active && res.data) setLoadedProfile(res.data);
      }).catch(() => {});
    } else if (account.role === "ADMIN") {
      void requestApi<{ fullName?: string; avatarUrl?: string }>("/api/admin/profile", {
        privateData: true,
        timeoutMs: 5000,
      }).then(res => {
        if (active && res.data) setLoadedProfile(res.data);
      }).catch(() => {});
    } else if (account.role === "CANDIDATE") {
      void requestApi<{ fullName?: string; avatarUrl?: string }>(`/api/profile/${account.id}`, {
        privateData: true,
        timeoutMs: 5000,
      }).then(res => {
        if (active && res.data) setLoadedProfile(res.data);
      }).catch(() => {});
    }

    const handleRecruiterUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ fullName?: string; avatarUrl?: string }>;
      if (customEvent.detail) setLoadedProfile(customEvent.detail);
    };

    const handleAdminUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ fullName?: string; avatarUrl?: string }>;
      if (customEvent.detail) setLoadedProfile(customEvent.detail);
    };

    const handleCandidateUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ fullName?: string; avatarUrl?: string }>;
      if (customEvent.detail) setLoadedProfile(customEvent.detail);
    };

    window.addEventListener("recruiter-profile-updated", handleRecruiterUpdate);
    window.addEventListener("admin-profile-updated", handleAdminUpdate);
    window.addEventListener("candidate-profile-updated", handleCandidateUpdate);
    return () => {
      active = false;
      window.removeEventListener("recruiter-profile-updated", handleRecruiterUpdate);
      window.removeEventListener("admin-profile-updated", handleAdminUpdate);
      window.removeEventListener("candidate-profile-updated", handleCandidateUpdate);
    };
  }, [name, account?.id, account?.role]);

  async function logout() {
    if (pending) return;
    const destination = role === "ADMIN" ? "/admin/login" : role === "RECRUITER" ? "/recruiter/login" : "/login";
    setPending(true);
    try { await signOut(); router.replace(destination); }
    catch { router.replace(destination + "?logout=unconfirmed"); }
    finally { setPending(false); }
  }

  const rawName = name !== undefined ? name : loadedProfile?.fullName;
  const rawAvatarUrl = avatarUrl !== undefined ? avatarUrl : loadedProfile?.avatarUrl;

  const effectiveName = rawName?.trim();
  const emailUsername = account?.email ? account.email.split("@")[0] : "";
  const displayName = effectiveName
    ? (effectiveName.includes("@") && effectiveName === account?.email ? emailUsername : effectiveName)
    : emailUsername;

  const initial = (displayName || account?.email || "U").trim().slice(0, 1).toUpperCase();
  const effectiveAvatar = !avatarError && rawAvatarUrl?.trim() ? rawAvatarUrl.trim() : null;

  return <>
    <nav className="top-nav" aria-label="Điều hướng chính">
      {account === undefined ? <span className="account-skeleton" aria-hidden="true" /> : links.map(item => <Link prefetch={false} key={item.href} href={item.href} aria-current={pathname === item.href || (/\/(?:companies|jobs)$/.test(item.href) && pathname.startsWith(item.href + "/")) ? "page" : undefined}>{item.label}</Link>)}
    </nav>
    <div className="profile-chip">
      {account === undefined ? <span className="account-skeleton" aria-label="Đang kiểm tra tài khoản" /> : account ? <>
        {role === "RECRUITER" && <Link className="btn btn-primary header-create-job" href="/recruiter/jobs/new"><Plus size={17} aria-hidden="true" />Đăng tin</Link>}
        <NotificationBell />
        <MessageNavButton />
        <Link prefetch={false} className="account-identity" href={role === "CANDIDATE" ? "/candidate/profile" : role === "RECRUITER" ? "/recruiter/profile" : "/admin/profile"} title={displayName ? `${displayName} (${account.email})` : account.email}>
          {effectiveAvatar ? (
            <img
              className="account-avatar"
              src={effectiveAvatar}
              alt="Ảnh đại diện"
              width={36}
              height={36}
              decoding="async"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <span className="account-avatar" aria-hidden="true">{initial}</span>
          )}
          <span className="account-copy"><strong>{displayName}</strong><small>{portalLabel(role)}</small></span>
        </Link>
        <button className="notification-bell logout-button" type="button" disabled={pending} onClick={() => void logout()} aria-label={pending ? "Đang thoát…" : "Đăng xuất"} title="Đăng xuất"><LogOut size={19} aria-hidden="true" /></button>
      </> : <>
        {portal === "CANDIDATE" && <Link prefetch={false} className="recruiter-entry portal-switch" href="/recruiter">Nhà tuyển dụng <ArrowUpRight size={14} aria-hidden="true" /></Link>}
        <Link className="btn btn-ghost" href={portal === "RECRUITER" ? "/recruiter/login" : portal === "ADMIN" ? "/admin/login" : "/login"}>Đăng nhập</Link>
        {portal !== "ADMIN" && <Link className="btn btn-primary" href={portal === "RECRUITER" ? "/recruiter/register" : "/register"}>Đăng ký</Link>}
      </>}
    </div>
  </>;
}
