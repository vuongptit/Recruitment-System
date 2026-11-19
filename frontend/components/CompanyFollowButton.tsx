"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { ApiClientError, toUserMessage } from "@/lib/apiClient";
import {
  followCompany,
  getCompanyFollowStatus,
  isDemoPerson2Api,
  unfollowCompany,
} from "@/lib/person2Api";
import { useCurrentAccount } from "./SessionGate";

export function CompanyFollowButton({
  companyId,
  initialFollowersCount = 0,
  basePath = "/companies",
}: {
  companyId: string;
  initialFollowersCount?: number;
  basePath?: string;
}) {
  const account = useCurrentAccount();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(initialFollowersCount);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const locked = useRef(false);

  useEffect(() => {
    if (!isDemoPerson2Api && account?.role !== "CANDIDATE") {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");

    getCompanyFollowStatus(companyId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setIsFollowing(result.data.isFollowing);
          setFollowersCount(result.data.followersCount);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setError(toUserMessage(reason));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [companyId, account?.id, account?.role, reload]);

  // Nếu chưa đăng nhập: hiển thị nút dẫn sang trang đăng nhập ứng viên
  if (!account) {
    const returnPath = `${basePath}/${companyId}`;
    return (
      <Link
        className="btn"
        href={`/login?returnTo=${encodeURIComponent(returnPath)}`}
        title="Đăng nhập để theo dõi công ty và nhận thông báo khi có tin tuyển dụng mới"
      >
        <Bell size={16} aria-hidden="true" /> Theo dõi
      </Link>
    );
  }

  // Chỉ dành cho vai trò ứng viên (CANDIDATE)
  if (!isDemoPerson2Api && account.role !== "CANDIDATE") {
    return null;
  }

  async function toggleFollow() {
    if (locked.current || loading) return;
    locked.current = true;
    setPending(true);
    setError("");

    try {
      if (isFollowing) {
        const res = await unfollowCompany(companyId);
        setIsFollowing(false);
        setFollowersCount(res.data.followersCount);
      } else {
        const res = await followCompany(companyId);
        setIsFollowing(true);
        setFollowersCount(res.data.followersCount);
      }
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 409) {
        setReload((val) => val + 1);
      } else {
        setError(toUserMessage(reason));
      }
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <button
        type="button"
        className={isFollowing ? "btn btn-secondary" : "btn"}
        aria-pressed={isFollowing}
        disabled={loading || pending}
        aria-busy={loading || pending}
        onClick={() => void toggleFollow()}
        title={
          isFollowing
            ? "Bấm để hủy theo dõi công ty"
            : "Theo dõi để nhận thông báo khi công ty có tin tuyển dụng mới"
        }
      >
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Đang cập nhật…
          </>
        ) : loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Đang tải…
          </>
        ) : isFollowing ? (
          <>
            <Check size={16} aria-hidden="true" />
            Đang theo dõi
          </>
        ) : (
          <>
            <Bell size={16} aria-hidden="true" />
            Theo dõi
          </>
        )}
      </button>
      {error ? (
        <span className="notice notice-danger" role="alert" style={{ fontSize: "12px", padding: "4px 8px" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
