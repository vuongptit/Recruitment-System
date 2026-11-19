"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, BriefcaseBusiness, Files, UsersRound, Building2, MailPlus, MessageSquare, Bell, UserCog } from "lucide-react";
import { useCurrentAccount } from "./SessionGate";
import { WorkspaceShell, type WorkspaceLink } from "./WorkspaceShell";
import { requestApi } from "../lib/apiClientCore";

const links: WorkspaceLink[] = [
  { href: "/recruiter/dashboard", label: "Trang chủ", icon: LayoutDashboard },
  { href: "/recruiter/jobs", label: "Quản lý tin tuyển dụng", icon: BriefcaseBusiness },
  { href: "/recruiter/applications", label: "Hồ sơ ứng tuyển", icon: Files },
  { href: "/recruiter/candidate-recommendations", label: "Ứng viên gợi ý", icon: UsersRound },
  { href: "/recruiter/company", label: "Hồ sơ công ty", icon: Building2 },
  { href: "/recruiter/profile", label: "Thông tin cá nhân", icon: UserCog },
  { href: "/recruiter/invitations/accept", label: "Nhận lời mời", icon: MailPlus },
  { href: "/recruiter/messages", label: "Tin nhắn", icon: MessageSquare },
  { href: "/recruiter/notifications", label: "Thông báo", icon: Bell },
];

export function RecruiterShell({ children }: { children: ReactNode }) {
  const account = useCurrentAccount();
  const [profile, setProfile] = useState<{ fullName?: string; avatarUrl?: string } | null>(null);

  useEffect(() => {
    if (account?.role !== "RECRUITER") return;
    let active = true;

    const loadProfile = async () => {
      try {
        const res = await requestApi<{ fullName?: string; avatarUrl?: string }>("/api/auth/me/recruiter-profile", {
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

    window.addEventListener("recruiter-profile-updated", handleProfileUpdated);
    return () => {
      active = false;
      window.removeEventListener("recruiter-profile-updated", handleProfileUpdated);
    };
  }, [account?.role]);

  const displayName = profile?.fullName?.trim() || account?.email;
  const avatarUrl = profile?.avatarUrl?.trim() || null;

  return (
    <WorkspaceShell
      role="recruiter"
      title="Nhà tuyển dụng"
      navigationLabel="Khu vực nhà tuyển dụng"
      links={links}
      showNavigation={account?.role === "RECRUITER"}
      name={displayName}
      avatarUrl={avatarUrl}
    >
      {children}
    </WorkspaceShell>
  );
}
