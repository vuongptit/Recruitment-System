"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import {
  Bell,
  MessageSquare,
  CalendarDays,
  FileText,
  Award,
  Video,
  Check,
  CheckCheck,
  RotateCw,
  ArrowUpRight,
  Clock,
  Sparkles,
  Inbox,
  Briefcase,
} from "lucide-react";
import { useCurrentAccount } from "@/components/SessionGate";
import { useNotifications } from "@/components/NotificationProvider";
import { LoadingState, ErrorState } from "@/components/ui";
import { notificationDestination, type InboxNotification } from "@/lib/notificationState";
import { notificationPresentation } from "@/lib/notificationPresentation";

type FilterTab = "all" | "unread" | "messages" | "recruitment";

interface NotificationTypeMeta {
  category: string;
  icon: typeof Bell;
  iconBg: string;
  iconColor: string;
}

function getNotificationTypeMeta(type: string): NotificationTypeMeta {
  const t = (type || "").toUpperCase();
  if (t === "NEW_MESSAGE" || t.includes("MESSAGE")) {
    return {
      category: "Tin nhắn",
      icon: MessageSquare,
      iconBg: "#ecfdf5",
      iconColor: "#059669",
    };
  }
  if (t.includes("INTERVIEW")) {
    return {
      category: "Lịch phỏng vấn",
      icon: CalendarDays,
      iconBg: "#f5f3ff",
      iconColor: "#7c3aed",
    };
  }
  if (t.includes("APPLICATION")) {
    return {
      category: "Ứng tuyển",
      icon: FileText,
      iconBg: "#eff6ff",
      iconColor: "#2563eb",
    };
  }
  if (t.includes("OFFER")) {
    return {
      category: "Thư nhận việc",
      icon: Award,
      iconBg: "#fffbeb",
      iconColor: "#d97706",
    };
  }
  if (t.includes("VIDEO") || t.includes("CALL")) {
    return {
      category: "Cuộc gọi video",
      icon: Video,
      iconBg: "#eef2ff",
      iconColor: "#4f46e5",
    };
  }
  return {
    category: "Hệ thống",
    icon: Bell,
    iconBg: "#f0fdf4",
    iconColor: "#087f46",
  };
}

function formatNotificationTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return "Vừa xong";
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;
    if (diffHours < 24 && now.getDate() === date.getDate()) {
      return `${diffHours} giờ trước`;
    }
    if (diffDays === 1) {
      return `Hôm qua ${date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return date.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function NotificationsList({ role }: { role: string }) {
  const {
    notifications,
    loading,
    error,
    marking,
    refresh,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    unreadCount,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const total = notifications.length;
    const unread = notifications.filter((n) => !n.is_read).length;
    const messages = notifications.filter(
      (n) => n.type === "new_message" || n.type.toLowerCase().includes("message")
    ).length;
    const recruitment = notifications.filter(
      (n) =>
        n.type.toLowerCase().includes("application") ||
        n.type.toLowerCase().includes("interview") ||
        n.type.toLowerCase().includes("offer")
    ).length;
    return { total, unread, messages, recruitment };
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case "unread":
        return notifications.filter((n) => !n.is_read);
      case "messages":
        return notifications.filter(
          (n) => n.type === "new_message" || n.type.toLowerCase().includes("message")
        );
      case "recruitment":
        return notifications.filter(
          (n) =>
            n.type.toLowerCase().includes("application") ||
            n.type.toLowerCase().includes("interview") ||
            n.type.toLowerCase().includes("offer")
        );
      case "all":
      default:
        return notifications;
    }
  }, [notifications, activeTab]);

  return (
    <main className="notifications-wrapper">
      {/* Header section */}
      <div className="notifications-header">
        <div className="notifications-title-area">
          <h1>
            Thông báo
            {unreadCount > 0 && (
              <span className="notifications-badge-pill">
                {unreadCount} chưa đọc
              </span>
            )}
          </h1>
          <p className="notifications-subtitle">
            Theo dõi hồ sơ ứng tuyển, lời mời phỏng vấn và tin nhắn mới nhất
          </p>
        </div>

        <div className="notifications-actions">
          <button
            type="button"
            className="btn btn-secondary btn-notif-action"
            onClick={() => void refresh()}
            disabled={loading}
            title="Tải lại danh sách thông báo"
          >
            <RotateCw size={15} className={loading ? "animate-spin" : ""} />
            Làm mới
          </button>
          <button
            type="button"
            className="btn btn-primary btn-notif-action"
            onClick={() => void markAllAsRead()}
            disabled={!unreadCount || loading || marking}
            title="Đánh dấu tất cả thông báo là đã đọc"
          >
            <CheckCheck size={16} />
            {marking ? "Đang xử lý…" : "Đã đọc tất cả"}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="notifications-filter-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`notifications-tab ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          Tất cả
          <span className="notifications-tab-count">{counts.total}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "unread"}
          className={`notifications-tab ${activeTab === "unread" ? "active" : ""}`}
          onClick={() => setActiveTab("unread")}
        >
          Chưa đọc
          {counts.unread > 0 && (
            <span className="notifications-tab-count" style={{ background: "var(--danger)", color: "#fff" }}>
              {counts.unread}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "messages"}
          className={`notifications-tab ${activeTab === "messages" ? "active" : ""}`}
          onClick={() => setActiveTab("messages")}
        >
          <MessageSquare size={14} />
          Tin nhắn
          {counts.messages > 0 && (
            <span className="notifications-tab-count">{counts.messages}</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "recruitment"}
          className={`notifications-tab ${activeTab === "recruitment" ? "active" : ""}`}
          onClick={() => setActiveTab("recruitment")}
        >
          <Briefcase size={14} />
          Tuyển dụng & Hồ sơ
          {counts.recruitment > 0 && (
            <span className="notifications-tab-count">{counts.recruitment}</span>
          )}
        </button>
      </div>

      {/* Main Content List */}
      <section className="notifications-list" aria-label="Danh sách thông báo">
        {error && <ErrorState message={error} onRetry={() => void refresh()} />}

        {loading && !notifications.length && <LoadingState label="Đang tải thông báo…" />}

        {!filteredNotifications.length && !loading && !error && (
          <div className="notifications-empty-box">
            <div className="notifications-empty-icon">
              {activeTab === "unread" ? <CheckCheck size={28} /> : <Inbox size={28} />}
            </div>
            <h3>
              {activeTab === "unread"
                ? "Bạn đã đọc hết thông báo!"
                : activeTab === "messages"
                ? "Chưa có thông báo tin nhắn nào"
                : activeTab === "recruitment"
                ? "Chưa có thông báo tuyển dụng nào"
                : "Chưa có thông báo nào"}
            </h3>
            <p>
              {activeTab === "unread"
                ? "Không còn thông báo chưa đọc nào cần xử lý."
                : "Khi có tin nhắn, hồ sơ mới hoặc lịch phỏng vấn, thông báo sẽ hiển thị ở đây."}
            </p>
          </div>
        )}

        {filteredNotifications.map((notification) => {
          const destination = notificationDestination(notification, role);
          const presentation = notificationPresentation(notification);
          const meta = getNotificationTypeMeta(notification.type);
          const Icon = meta.icon;
          const timeFormatted = formatNotificationTime(notification.created_at);

          return (
            <article
              key={notification.id}
              className={`notification-card ${!notification.is_read ? "unread" : ""}`}
            >
              <div
                className="notification-icon-box"
                style={{ background: meta.iconBg, color: meta.iconColor }}
                aria-hidden="true"
              >
                <Icon size={20} strokeWidth={2} />
              </div>

              <div className="notification-content">
                <div className="notification-meta-row">
                  <span className="notification-category-tag">{meta.category}</span>
                  <span className="notification-time">
                    <Clock size={12} />
                    {timeFormatted}
                  </span>
                  {!notification.is_read && (
                    <span className="notification-unread-dot" title="Chưa đọc" />
                  )}
                </div>

                <h3>{presentation.title}</h3>
                <p className="notification-body">{presentation.body}</p>

                <div className="notification-footer-actions">
                  {destination && (
                    <Link
                      href={destination}
                      className="btn-notif-action btn-notif-primary"
                      onClick={() => {
                        if (!notification.is_read) void markAsRead(notification.id);
                      }}
                    >
                      Xem chi tiết
                      <ArrowUpRight size={14} />
                    </Link>
                  )}

                  {!notification.is_read && (
                    <button
                      type="button"
                      className="btn-notif-action btn-notif-ghost"
                      disabled={marking}
                      onClick={() => void markAsRead(notification.id)}
                      title="Đánh dấu đã đọc"
                    >
                      <Check size={14} />
                      Đánh dấu đã đọc
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {hasMore && (
          <div style={{ textAlign: "center", paddingTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary btn-notif-action"
              disabled={loading}
              onClick={() => void loadMore()}
            >
              {loading ? "Đang tải thêm…" : "Tải thêm thông báo cũ hơn"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default function NotificationsScreen() {
  const account = useCurrentAccount();
  return account ? <NotificationsList role={account.role} /> : <LoadingState />;
}
