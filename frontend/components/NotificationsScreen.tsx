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
  Inbox,
  Briefcase,
} from "lucide-react";
import { useCurrentAccount } from "@/components/SessionGate";
import { useNotifications } from "@/components/NotificationProvider";
import { LoadingState, ErrorState } from "@/components/ui";
import { notificationDestination, type InboxNotification } from "@/lib/notificationState";
import { notificationPresentation } from "@/lib/notificationPresentation";
import { applicationStatusLabel } from "@/lib/recruitmentLabels";
import { portalSection, type AccountRole } from "@/lib/portalRoutes";
import { requestApi } from "@/lib/apiClientCore";
import { conversationIdentity, type ChatIdentityView } from "@/lib/chatIdentity";
import type { ChatConversation } from "@/lib/chatApi";

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

function formatInterviewSchedule(startStr?: unknown, endStr?: unknown): string | null {
  if (typeof startStr !== "string" || !startStr) return null;
  try {
    const start = new Date(startStr);
    if (isNaN(start.getTime())) return null;
    const days = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
    const dayOfWeek = days[start.getDay()];
    const dateFormatted = `${dayOfWeek}, ngày ${start.getDate().toString().padStart(2, "0")}/${(start.getMonth() + 1).toString().padStart(2, "0")}/${start.getFullYear()}`;
    const startTime = start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });

    if (typeof endStr === "string" && endStr) {
      const end = new Date(endStr);
      if (!isNaN(end.getTime())) {
        const endTime = end.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
        return `${startTime} - ${endTime} · ${dateFormatted}`;
      }
    }
    return `${startTime} · ${dateFormatted}`;
  } catch {
    return null;
  }
}

function NotificationsList({ accountId, role }: { accountId: string; role: AccountRole }) {
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
  const [conversations, setConversations] = useState<Map<string, ChatConversation>>(new Map());

  // Load chat conversations to resolve counterpart identity and avatar
  useEffect(() => {
    let active = true;
    void requestApi<ChatConversation[]>("/api/chat/chats", { privateData: true })
      .then((res) => {
        if (!active || !res.data) return;
        const map = new Map<string, ChatConversation>();
        for (const conv of res.data) {
          map.set(conv.id, conv);
        }
        setConversations(map);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
            {counts.unread > 0 && (
              <span className="notifications-badge-pill">
                {counts.unread} chưa đọc
              </span>
            )}
          </h1>
          <p className="notifications-subtitle">
            Theo dõi tin nhắn mới, cập nhật hồ sơ ứng tuyển và lịch phỏng vấn kịp thời.
          </p>
        </div>

        <div className="notifications-actions">
          <button
            type="button"
            className="btn btn-secondary btn-notif-action"
            onClick={() => void refresh()}
            disabled={loading}
            title="Làm mới danh sách"
          >
            <RotateCw size={15} className={loading ? "spin" : ""} />
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

          const isMessageType = notification.type === "new_message" || notification.type.toLowerCase().includes("message");
          const isInterviewType = notification.type.toLowerCase().includes("interview");
          const isApplicationType = notification.type.toLowerCase().includes("application");
          const isOfferType = notification.type.toLowerCase().includes("offer");
          const isVideoCallType = notification.type === "video_call" || notification.type.toLowerCase().includes("video");

          // Extract sender info for message notification
          const convId = typeof notification.metadata?.conversation_id === "string" ? notification.metadata.conversation_id : null;
          const conv = convId ? conversations.get(convId) : undefined;
          const identity: ChatIdentityView | null = conv ? conversationIdentity(conv, accountId) : null;
          const metaSenderName = typeof notification.metadata?.sender_name === "string" ? notification.metadata.sender_name : null;
          const senderName = identity?.name || metaSenderName || (
            presentation.title.startsWith("Tin nhắn mới từ ")
              ? presentation.title.replace("Tin nhắn mới từ ", "")
              : (role === "CANDIDATE" ? "Nhà tuyển dụng" : "Ứng viên")
          );
          const senderRole = identity?.description || (role === "CANDIDATE" ? "Nhà tuyển dụng" : "Ứng viên");
          const senderAvatar = identity?.imageUrl;
          const senderInitial = (senderName || "U").trim().slice(0, 1).toUpperCase();

          // Interview schedule format
          const scheduleFormatted = isInterviewType
            ? formatInterviewSchedule(notification.metadata?.scheduled_start, notification.metadata?.scheduled_end)
            : null;

          // Application status label
          const toStatus = typeof notification.metadata?.to_status === "string" ? notification.metadata.to_status : "";
          const statusLabel = toStatus ? applicationStatusLabel(toStatus) : "";

          // Display title
          const cardTitle = isMessageType
            ? `Tin nhắn mới từ ${senderName}`
            : presentation.title;

          // Action link button text
          const actionText = isMessageType
            ? "Mở cuộc trò chuyện"
            : isInterviewType
            ? "Xem chi tiết lịch phỏng vấn"
            : isOfferType
            ? "Xem thư nhận việc"
            : isVideoCallType
            ? "Tham gia cuộc gọi"
            : "Xem chi tiết";

          const ActionIcon = isMessageType
            ? MessageSquare
            : isInterviewType
            ? CalendarDays
            : isOfferType
            ? Award
            : isVideoCallType
            ? Video
            : ArrowUpRight;

          const targetUrl = destination || (isMessageType && convId ? `${portalSection(role, "messages")}?chat=${convId}` : null);

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

                <h3>{cardTitle}</h3>

                {/* Specific rich detail card for messages */}
                {isMessageType && (
                  <div className="notification-detail-box">
                    <div className="notification-sender-info">
                      {senderAvatar ? (
                        <img
                          src={senderAvatar}
                          alt={senderName}
                          className="notification-sender-avatar"
                          width={36}
                          height={36}
                        />
                      ) : (
                        <span className="notification-sender-avatar">{senderInitial}</span>
                      )}
                      <div className="notification-sender-meta">
                        <span className="notification-sender-name">{senderName}</span>
                        <span className="notification-sender-role">{senderRole}</span>
                      </div>
                    </div>
                    <blockquote className="notification-quote-body">
                      &ldquo;{notification.body}&rdquo;
                    </blockquote>
                  </div>
                )}

                {/* Specific rich detail card for interview schedule */}
                {isInterviewType && (
                  <div className="notification-detail-box">
                    {scheduleFormatted ? (
                      <div className="notification-detail-pill schedule">
                        <CalendarDays size={15} />
                        <span>Thời gian: {scheduleFormatted}</span>
                      </div>
                    ) : null}
                    <p className="notification-body" style={{ margin: 0 }}>
                      {presentation.body}
                    </p>
                  </div>
                )}

                {/* Specific rich detail card for application status */}
                {isApplicationType && !isInterviewType && (
                  <div className="notification-detail-box">
                    {statusLabel && statusLabel !== "Chưa rõ trạng thái" ? (
                      <div className="notification-detail-pill application">
                        <Briefcase size={15} />
                        <span>Trạng thái: {statusLabel}</span>
                      </div>
                    ) : null}
                    <p className="notification-body" style={{ margin: 0 }}>
                      {presentation.body}
                    </p>
                  </div>
                )}

                {/* Specific rich detail card for offers */}
                {isOfferType && (
                  <div className="notification-detail-box">
                    <div className="notification-detail-pill offer">
                      <Award size={15} />
                      <span>Thư mời nhận việc</span>
                    </div>
                    <p className="notification-body" style={{ margin: 0 }}>
                      {presentation.body}
                    </p>
                  </div>
                )}

                {/* Specific rich detail card for video calls */}
                {isVideoCallType && (
                  <div className="notification-detail-box">
                    <div className="notification-detail-pill call">
                      <Video size={15} />
                      <span>
                        {typeof notification.metadata?.room_name === "string"
                          ? `Phòng: ${notification.metadata.room_name}`
                          : "Cuộc gọi phỏng vấn video"}
                      </span>
                    </div>
                    <p className="notification-body" style={{ margin: 0 }}>
                      {presentation.body}
                    </p>
                  </div>
                )}

                {/* Fallback plain body for generic notifications */}
                {!isMessageType && !isInterviewType && !isApplicationType && !isOfferType && !isVideoCallType && (
                  <p className="notification-body">{presentation.body}</p>
                )}

                <div className="notification-footer-actions">
                  {targetUrl && (
                    <Link
                      href={targetUrl}
                      className="btn-notif-action btn-notif-primary"
                      onClick={() => {
                        if (!notification.is_read) void markAsRead(notification.id);
                      }}
                    >
                      <ActionIcon size={14} />
                      {actionText}
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
  return account ? <NotificationsList accountId={account.id} role={account.role} /> : <LoadingState />;
}
