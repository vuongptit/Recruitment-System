"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  UsersRound,
  BriefcaseBusiness,
  Building2,
  ShieldCheck,
  Flag,
  ClipboardList,
  Settings,
  UserCog,
} from "lucide-react";
import { useCurrentAccount } from "./SessionGate";
import { WorkspaceShell, type WorkspaceLink } from "./WorkspaceShell";
import { requestApi } from "../lib/apiClientCore";

const links: WorkspaceLink[] = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Quản lý người dùng", icon: UsersRound },
  { href: "/admin/companies", label: "Quản lý công ty", icon: Building2 },
  { href: "/admin/company-verifications", label: "Duyệt công ty", icon: ShieldCheck },
  { href: "/admin/jobs", label: "Duyệt tin tuyển dụng", icon: BriefcaseBusiness },
  { href: "/admin/reports", label: "Báo cáo vi phạm", icon: Flag },
  { href: "/admin/audit", label: "Nhật ký hoạt động", icon: ClipboardList },
  { href: "/admin/settings", label: "Cấu hình hệ thống", icon: Settings },
  { href: "/admin/profile", label: "Thông tin cá nhân", icon: UserCog },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const account = useCurrentAccount();
  const [profile, setProfile] = useState<{ fullName?: string; avatarUrl?: string } | null>(null);

  useEffect(() => {
    if (account?.role !== "ADMIN") return;
    let active = true;

    const loadProfile = async () => {
      try {
        const res = await requestApi<{ fullName?: string; avatarUrl?: string }>("/api/admin/profile", {
          privateData: true,
          timeoutMs: 5000,
        });
        if (active && res.data) {
          setProfile(res.data);
        }
      } catch {
        // Fallback to null
      }
    };

    void loadProfile();

    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ fullName?: string; avatarUrl?: string }>;
      if (customEvent.detail) {
        setProfile(customEvent.detail);
      } else {
        void loadProfile();
      }
    };

    window.addEventListener("admin-profile-updated", handleProfileUpdated);
    return () => {
      active = false;
      window.removeEventListener("admin-profile-updated", handleProfileUpdated);
    };
  }, [account?.role]);

  const displayName = profile?.fullName?.trim() || account?.email;
  const avatarUrl = profile?.avatarUrl?.trim() || null;

  return (
    <WorkspaceShell
      role="admin"
      title="Quản trị viên"
      navigationLabel="Chức năng quản trị"
      links={links}
      showNavigation={account?.role === "ADMIN"}
      name={displayName}
      avatarUrl={avatarUrl}
    >
      {children}
    </WorkspaceShell>
  );
}
