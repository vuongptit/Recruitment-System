"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Search, Building2, Heart, Files, CalendarDays, UserRound, FileText, Sparkles, WandSparkles } from "lucide-react";
import { useCurrentAccount } from "./SessionGate";
import { requestApi } from "../lib/apiClient";
import type { CandidateProfile } from "../lib/person1Api";
import { isDemoPerson2Api } from "../lib/apiMode";
import { PublicShell } from "./PublicShell";
import { WorkspaceShell, type WorkspaceLink } from "./WorkspaceShell";

const links: WorkspaceLink[] = [
  { label: "Tổng quan", href: "/candidate/dashboard", icon: LayoutDashboard },
  { label: "Tìm việc", href: "/candidate/jobs", icon: Search },
  { label: "Công ty", href: "/candidate/companies", icon: Building2 },
  { label: "Việc làm đã lưu", href: "/candidate/bookmarks", icon: Heart },
  { label: "Đơn ứng tuyển", href: "/candidate/applications", icon: Files },
  { label: "Lịch phỏng vấn", href: "/candidate/interviews", icon: CalendarDays },
  { label: "Hồ sơ cá nhân", href: "/candidate/profile", icon: UserRound, exact: true },
  { label: "Quản lý CV", href: "/candidate/profile/cvs", icon: FileText, aliases: ["/candidate/cvs/"] },
  { label: "Gợi ý việc làm", href: "/candidate/ai/recommendations", icon: Sparkles },
  { label: "Trợ lý AI", href: "/candidate/ai", icon: WandSparkles, exact: true },
];
const CandidateWorkspaceContext = createContext(false);
export function CandidateWorkspace({ children }: { children: ReactNode }) {
  const nested = useContext(CandidateWorkspaceContext);
  if (nested) return <>{children}</>;
  return <CandidateWorkspaceContext.Provider value={true}><CandidateWorkspaceContent>{children}</CandidateWorkspaceContent></CandidateWorkspaceContext.Provider>;
}
function CandidateWorkspaceContent({ children }: { children: ReactNode }) {
  const account = useCurrentAccount();
  const pathname = usePathname();
  const discovery = pathname.startsWith("/candidate/jobs") || pathname.startsWith("/candidate/companies");
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  useEffect(() => {
    if (account?.role !== "CANDIDATE") { setProfile(null); return; }
    const controller = new AbortController();
    requestApi<CandidateProfile>(`/api/profile/${account.id}`, { privateData: true, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setProfile(result.data); })
      .catch(() => { if (!controller.signal.aborted) setProfile(null); });

    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ fullName?: string; avatarUrl?: string }>;
      if (customEvent.detail) {
        setProfile(prev => prev ? ({ ...prev, ...customEvent.detail }) : ({ fullName: customEvent.detail.fullName, avatarUrl: customEvent.detail.avatarUrl } as CandidateProfile));
      } else {
        requestApi<CandidateProfile>(`/api/profile/${account.id}`, { privateData: true })
          .then(result => setProfile(result.data))
          .catch(() => {});
      }
    };

    window.addEventListener("candidate-profile-updated", handleProfileUpdated);
    return () => {
      controller.abort();
      window.removeEventListener("candidate-profile-updated", handleProfileUpdated);
    };
  }, [account?.id, account?.role]);
  if (!isDemoPerson2Api && account?.role !== "CANDIDATE") return <PublicShell>{children}</PublicShell>;
  return <WorkspaceShell role="candidate" title="Ứng viên" navigationLabel="Khu vực ứng viên" links={links} showNavigation variant={discovery ? "discovery" : "workspace"} name={profile?.fullName?.trim() || account?.email} avatarUrl={profile?.avatarUrl?.trim() || null}>{children}</WorkspaceShell>;
}
