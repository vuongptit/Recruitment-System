"use client";

import { portalCall, portalSection, type AccountRole } from "@/lib/portalRoutes";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentAccount } from "@/components/SessionGate";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { requestApi, toUserMessage } from "@/lib/apiClientCore";
import {
  listChatMessages,
  mergeConversationMessages,
  parseCallMessage,
  sendChatMessage,
  type ChatConversation,
  type ChatMessage,
} from "@/lib/chatApi";
import { conversationIdentity } from "@/lib/chatIdentity";
import { ChatIdentityAvatar } from "./ChatIdentityAvatar";
import {
  Video,
  PhoneOff,
  PhoneCall,
  Check,
  CheckCheck,
  Loader2,
  AlertCircle,
  RotateCw,
  SendHorizontal,
  ArrowLeft,
  Circle,
} from "lucide-react";

function formatChatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0 && now.getDate() === date.getDate()) {
      return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays <= 1) return "Hôm qua";
    if (diffDays < 7) {
      const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      return days[date.getDay()];
    }
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

function formatFullTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m > 0 ? `${m} phút ` : ""}${s} giây`;
}

interface OutgoingCallState {
  callId: string;
  conversationId: string;
  recipientName: string;
  statusText: string;
}

function ChatInterface({ accountId, role }: { accountId: string; role: AccountRole }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("chat");

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [connected, setConnected] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const [listError, setListError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revision, setRevision] = useState(0);

  // Outgoing call modal state (Wait for recipient to answer)
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCallState | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [endedCallIds, setEndedCallIds] = useState<Set<string>>(new Set());

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const outgoingCallRef = useRef(outgoingCall);
  outgoingCallRef.current = outgoingCall;

  const mounted = useRef(true);
  const loadLock = useRef(false);
  const sendLock = useRef(false);
  const callLock = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialHistory = useRef(true);

  const scrollToLatest = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  const selected = conversations.find((conversation) => conversation.id === selectedId);
  const selectedIdentity = selected ? conversationIdentity(selected, accountId) : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Fetch conversation list
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const response = await requestApi<ChatConversation[]>("/api/chat/chats", { privateData: true });
      if (mounted.current) setConversations(response.data ?? []);
    } catch (error) {
      if (mounted.current) setListError(toUserMessage(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);


  // Query online presence for all counterpart users
  const counterpartIds = Array.from(
    new Set(conversations.flatMap((c) => (c.members ?? []).filter((id) => id !== accountId)))
  );
  const counterpartIdsKey = counterpartIds.sort().join(",");

  useEffect(() => {
    if (!counterpartIds.length) return;
    let active = true;
    const checkOnline = async () => {
      try {
        const res = await requestApi<{ online: boolean; statuses?: Record<string, boolean> }>(
          `/api/notifications/online-status?user_ids=${encodeURIComponent(counterpartIdsKey)}`,
          { privateData: true, maxRetries: 0 }
        );
        if (active && res.data?.statuses) {
          setOnlineUsers(res.data.statuses);
        }
      } catch {
        /* ignore network failures for presence */
      }
    };
    void checkOnline();

    const handlePresenceChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ user_id?: string; online?: boolean }>).detail;
      if (typeof detail?.user_id === "string" && typeof detail?.online === "boolean") {
        setOnlineUsers((prev) => ({ ...prev, [detail.user_id as string]: detail.online as boolean }));
      }
    };
    const handleReconnected = () => {
      void checkOnline();
    };

    window.addEventListener("user_presence_changed", handlePresenceChanged);
    window.addEventListener("sse_reconnected", handleReconnected);

    return () => {
      active = false;
      window.removeEventListener("user_presence_changed", handlePresenceChanged);
      window.removeEventListener("sse_reconnected", handleReconnected);
    };
  }, [counterpartIdsKey]);

  useEffect(() => {
    const handleEnded = (event: Event) => {
      const detail = (event as CustomEvent<{ callId?: string }>).detail;
      if (typeof detail?.callId === "string") {
        setEndedCallIds((prev) => new Set(prev).add(detail.callId!));
      }
    };
    window.addEventListener("video_call_ended", handleEnded);
    window.addEventListener("video_call_rejected", handleEnded);
    return () => {
      window.removeEventListener("video_call_ended", handleEnded);
      window.removeEventListener("video_call_rejected", handleEnded);
    };
  }, []);

  // Outgoing call 30-second timeout (recipient did not answer)
  useEffect(() => {
    if (!outgoingCall) return;
    const currentCall = outgoingCall;
    const timer = setTimeout(async () => {
      setOutgoingCall((prev) =>
        prev?.callId === currentCall.callId ? { ...prev, statusText: "Người nhận không phản hồi" } : prev
      );
      try {
        await requestApi(`/api/calls/${encodeURIComponent(currentCall.callId)}/end`, {
          method: "POST",
          privateData: true,
          maxRetries: 0,
        });
        await sendChatMessage(currentCall.conversationId, `[CALL_REJECTED] ${currentCall.callId}`, crypto.randomUUID());
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        setOutgoingCall((prev) => (prev?.callId === currentCall.callId ? null : prev));
      }, 2500);
    }, 30000);
    return () => clearTimeout(timer);
  }, [outgoingCall?.callId]);

  // Reset thread on conversation switch
  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setActionError("");
    setInputText("");
    initialHistory.current = true;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [selectedId]);

  // Load message history for selected conversation
  useEffect(() => {
    const controller = new AbortController();
    setMessageError("");
    loadLock.current = false;
    if (!selectedId) {
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    listChatMessages(selectedId, undefined, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setMessages((current) => mergeConversationMessages(selectedId, current, response.data ?? []));
        setHasMore((response.data ?? []).length === 20);
        if (initialHistory.current) {
          initialHistory.current = false;
          scrollToLatest();
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessageError(toUserMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingMessages(false);
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      });
    return () => controller.abort();
  }, [selectedId, revision]);

  // Load older messages (pagination)
  const loadOlder = async () => {
    if (!selectedId || loadingMessages || !hasMore || loadLock.current || !messages.length) return;
    const conversationId = selectedId;
    loadLock.current = true;
    setLoadingMessages(true);
    setMessageError("");
    try {
      const response = await listChatMessages(conversationId, messages[0].created_at);
      if (!mounted.current || selectedRef.current !== conversationId) return;
      const container = scrollRef.current;
      const oldHeight = container?.scrollHeight ?? 0;
      const oldTop = container?.scrollTop ?? 0;
      setMessages((current) => mergeConversationMessages(conversationId, response.data ?? [], current));
      setHasMore((response.data ?? []).length === 20);
      requestAnimationFrame(() => {
        if (container && selectedRef.current === conversationId) {
          container.scrollTop = oldTop + container.scrollHeight - oldHeight;
        }
      });
    } catch (error) {
      if (mounted.current && selectedRef.current === conversationId) setMessageError(toUserMessage(error));
    } finally {
      if (mounted.current && selectedRef.current === conversationId) {
        loadLock.current = false;
        setLoadingMessages(false);
      }
    }
  };

  // WebSocket real-time connection
  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let failures = 0;

    const connect = () => {
      if (!active) return;
      const url = new URL("/api/chat/ws/chat", window.location.origin);
      url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (active) {
          failures = 0;
          setConnected(true);
          void fetchConversations();
          setRevision((value) => value + 1);
        }
      };

      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type !== "new_message" || !data.message || typeof data.message.content !== "string") return;
          const message = data.message as ChatMessage;
          const currentId = selectedRef.current;

          if (currentId === message.conversation_id) {
            const container = scrollRef.current;
            const atLatest =
              !container || container.scrollHeight - container.scrollTop - container.clientHeight < 150;
            setMessages((current) => mergeConversationMessages(currentId, current, [{ ...message, status: "delivered" }]));
            if (atLatest) scrollToLatest();
          }

          // Update sidebar preview
          setConversations((current) => {
            const exists = current.some((c) => c.id === message.conversation_id);
            if (!exists) {
              void fetchConversations();
              return current;
            }
            return current
              .map((c) =>
                c.id === message.conversation_id
                  ? { ...c, updated_at: message.created_at, last_message_content: message.content }
                  : c
              )
              .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
          });

          // Check call signaling message
          const call = parseCallMessage(message.content);
          if (call) {
            const currentCall = outgoingCallRef.current;
            // Caller side: Recipient accepted our call!
            if (currentCall && currentCall.callId === call.callId) {
              if (call.action === "ACCEPTED") {
                setOutgoingCall(null);
                router.push(`${portalCall(role, call.callId)}?chat=${encodeURIComponent(currentCall.conversationId)}`);
              } else if (call.action === "REJECTED") {
                setOutgoingCall((prev) => (prev ? { ...prev, statusText: "Cuộc gọi bị từ chối" } : null));
                setTimeout(() => setOutgoingCall(null), 2000);
              } else if (call.action === "ENDED") {
                setOutgoingCall(null);
              }
            }
            if (message.sender_id !== accountId && ["REJECTED", "ENDED"].includes(call.action)) {
              window.dispatchEvent(
                new CustomEvent("video_call_signal", { detail: { callId: call.callId, action: call.action } })
              );
            }
          }
        } catch {
          /* Ignore malformed stream frames */
        }
      };

      socket.onerror = () => {
        if (active) setConnected(false);
      };

      socket.onclose = () => {
        if (!active) return;
        setConnected(false);
        reconnectTimer = setTimeout(async () => {
          await fetchConversations();
          connect();
        }, Math.min(30000, 3000 * 2 ** failures++));
      };
    };

    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [accountId, fetchConversations, role, router]);

  // Listen to call events from other components (NotificationProvider)
  useEffect(() => {
    const handleCallSignal = (event: Event) => {
      const custom = event as CustomEvent<{ callId: string; action: string }>;
      const detail = custom.detail;
      const currentCall = outgoingCallRef.current;
      if (currentCall && currentCall.callId === detail.callId) {
        if (detail.action === "ACCEPTED") {
          setOutgoingCall(null);
          router.push(`${portalCall(role, detail.callId)}?chat=${encodeURIComponent(currentCall.conversationId)}`);
        } else if (detail.action === "REJECTED") {
          setOutgoingCall((prev) => (prev ? { ...prev, statusText: "Cuộc gọi bị từ chối" } : null));
          setTimeout(() => setOutgoingCall(null), 2000);
        } else if (detail.action === "ENDED") {
          setOutgoingCall(null);
        }
      }
    };
    window.addEventListener("video_call_signal", handleCallSignal);
    return () => window.removeEventListener("video_call_signal", handleCallSignal);
  }, [role, router]);

  // HTTP Polling fallback when WebSocket disconnected
  useEffect(() => {
    if (connected || !selectedId) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      listChatMessages(selectedId, undefined, controller.signal)
        .then((response) => {
          if (!controller.signal.aborted) {
            setMessages((current) => mergeConversationMessages(selectedId, current, response.data ?? []));
          }
        })
        .catch(() => {});
    }, 10000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [connected, selectedId]);

  // Send message with optimistic update and focus retention
  async function sendMessageContent(contentToSend: string, clientMsgId: string) {
    if (!selectedId || !contentToSend.trim() || sendLock.current) return;
    const conversationId = selectedId;
    const trimmed = contentToSend.trim();

    // 1. Optimistic message placed immediately into UI
    const tempMessage: ChatMessage = {
      id: `opt-${clientMsgId}`,
      conversation_id: conversationId,
      sender_id: accountId,
      content: trimmed,
      client_message_id: clientMsgId,
      created_at: new Date().toISOString(),
      status: "sending",
    };
    setMessages((current) => mergeConversationMessages(conversationId, current, [tempMessage]));
    scrollToLatest();

    // 2. Clear input & keep focus immediately
    setInputText("");
    requestAnimationFrame(() => inputRef.current?.focus());

    sendLock.current = true;
    setActionError("");
    try {
      const response = await sendChatMessage(conversationId, trimmed, clientMsgId);
      if (!mounted.current || selectedRef.current !== conversationId) return;

      // 3. Mark as sent on success
      setMessages((current) =>
        mergeConversationMessages(conversationId, current, [{ ...response.data, status: "sent" }])
      );
      scrollToLatest();
    } catch (error) {
      if (mounted.current && selectedRef.current === conversationId) {
        // 4. Mark as failed on error
        setMessages((current) =>
          current.map((m) =>
            m.client_message_id === clientMsgId
              ? { ...m, status: "failed", error: toUserMessage(error) }
              : m
          )
        );
        setActionError(`Không thể gửi tin nhắn. Bạn có thể nhấn thử lại bên cạnh tin nhắn.`);
      }
    } finally {
      sendLock.current = false;
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleSend() {
    if (!inputText.trim()) return;
    void sendMessageContent(inputText, crypto.randomUUID());
  }

  function handleRetry(msg: ChatMessage) {
    void sendMessageContent(msg.content, msg.client_message_id ?? crypto.randomUUID());
  }

  // Video calling: Initiate call and open ringing modal
  async function startCall() {
    if (!selected || callLock.current) return;
    const participantIds = (selected.members ?? []).filter((id) => id !== accountId);
    if (!participantIds.length) {
      setActionError("Chưa xác định được người nhận. Hãy tải lại hội thoại.");
      return;
    }
    const recipientId = participantIds[0];
    if (recipientId && !onlineUsers[recipientId]) {
      setActionError("Người nhận hiện không trực tuyến, không thể thực hiện cuộc gọi.");
      return;
    }
    const conversationId = selected.id;
    const recipientName = selectedIdentity?.name || "Đối phương";

    callLock.current = true;
    setStartingCall(true);
    setActionError("");

    try {
      const response = await requestApi<{ id: string }>("/api/calls", {
        method: "POST",
        privateData: true,
        maxRetries: 0,
        body: { title: "Cuộc gọi video", participant_ids: participantIds, conversation_id: conversationId },
      });
      const callId = response.data.id;

      // Send call notification message to recipient
      try {
        await sendChatMessage(conversationId, `[CALL_STARTED] ${callId}`, crypto.randomUUID());
      } catch {
        /* proceed even if chat text failed */
      }

      // Show Outgoing Calling Modal (DO NOT redirect yet!)
      setOutgoingCall({
        callId,
        conversationId,
        recipientName,
        statusText: "Đang đổ chuông...",
      });
    } catch (error) {
      if (mounted.current) setActionError(toUserMessage(error));
    } finally {
      callLock.current = false;
      if (mounted.current) setStartingCall(false);
    }
  }

  // Cancel outgoing call
  async function cancelOutgoingCall() {
    if (!outgoingCall) return;
    const { callId, conversationId } = outgoingCall;
    setOutgoingCall(null);
    try {
      await requestApi(`/api/calls/${encodeURIComponent(callId)}/end`, {
        method: "POST",
        privateData: true,
        maxRetries: 0,
      });
      await sendChatMessage(conversationId, `[CALL_ENDED] ${callId}`, crypto.randomUUID());
    } catch {
      /* ignore */
    }
  }

  // Accept incoming call from thread
  async function acceptCallFromThread(callId: string) {
    if (!selectedId) return;
    try {
      await sendChatMessage(selectedId, `[CALL_ACCEPTED] ${callId}`, crypto.randomUUID());
      router.push(`${portalCall(role, callId)}?chat=${encodeURIComponent(selectedId)}`);
    } catch {
      router.push(`${portalCall(role, callId)}?chat=${encodeURIComponent(selectedId)}`);
    }
  }

  // Reject incoming call from thread
  async function rejectCallFromThread(callId: string) {
    if (!selectedId) return;
    try {
      await requestApi(`/api/calls/${encodeURIComponent(callId)}/reject`, {
        method: "POST",
        privateData: true,
        maxRetries: 0,
      });
      await sendChatMessage(selectedId, `[CALL_REJECTED] ${callId}`, crypto.randomUUID());
    } catch {
      /* ignore */
    }
  }

  // Build a set of ended or rejected call IDs to render appropriate card status
  const callStatusMap = new Map<string, string>();
  for (const m of messages) {
    const c = parseCallMessage(m.content);
    if (c) {
      const prev = callStatusMap.get(c.callId);
      if (prev === "ENDED" || prev === "REJECTED") {
        continue;
      }
      if (c.action === "ENDED" || c.action === "REJECTED" || c.action === "ACCEPTED") {
        callStatusMap.set(c.callId, c.action);
      }
    }
  }

  return (
    <main style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Outgoing Calling Modal (Waiting for recipient) */}
      {outgoingCall && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Đang gọi"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            className="card stack"
            style={{
              maxWidth: 380,
              width: "100%",
              textAlign: "center",
              padding: "36px 24px",
              borderRadius: 20,
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              background: "white",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div style={{ position: "relative", width: 90, height: 90 }}>
              <div
                style={{
                  position: "absolute",
                  inset: -10,
                  borderRadius: "50%",
                  border: "2px solid var(--primary)",
                  opacity: 0.5,
                  animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
                }}
              />
              {selectedIdentity ? (
                <ChatIdentityAvatar identity={selectedIdentity} size={90} />
              ) : (
                <div
                  style={{
                    width: 90,
                    height: 90,
                    borderRadius: "50%",
                    background: "var(--primary-tint)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <PhoneCall size={36} color="var(--primary)" />
                </div>
              )}
            </div>

            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: 19 }}>{outgoingCall.recipientName}</h3>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{outgoingCall.statusText}</p>
            </div>

            <button
              type="button"
              className="btn"
              onClick={() => void cancelOutgoingCall()}
              style={{
                background: "#e53e3e",
                color: "white",
                borderColor: "#e53e3e",
                borderRadius: 30,
                padding: "10px 24px",
                gap: 8,
              }}
            >
              <PhoneOff size={18} />
              <span>Hủy cuộc gọi</span>
            </button>
          </div>
        </div>
      )}

      <div
        className="messages-workspace"
        style={{
          padding: 0,
          overflow: "hidden",
          display: "flex",
          width: "100%",
          height: "100%",
          flex: 1,
          minHeight: 0,
          background: "white",
        }}
      >
        {/* Left column: Conversations list */}
        <section
          className={`messages-list ${selectedId ? "hide-on-mobile" : ""}`}
          aria-label="Danh sách hội thoại"
          style={{
            flex: "0 0 320px",
            minWidth: 0,
            borderRight: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              padding: "16px 18px",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "white",
            }}
          >
            <h2 style={{ fontSize: 17, margin: 0, fontWeight: 700 }}>Đoạn chat</h2>
            <button
              className="btn"
              style={{ padding: "6px 10px", fontSize: 12, borderRadius: 8 }}
              type="button"
              onClick={() => void fetchConversations()}
              disabled={loading}
              title="Tải lại danh sách"
            >
              <RotateCw size={14} className={loading ? "spin" : ""} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <LoadingState />}
            {listError && <ErrorState message={listError} onRetry={() => void fetchConversations()} />}
            {!loading && !listError && !conversations.length && (
              <div style={{ padding: 24 }}>
                <EmptyState
                  title="Chưa có cuộc trò chuyện"
                  description="Mở chi tiết việc làm hoặc hồ sơ ứng tuyển để bắt đầu trao đổi."
                />
              </div>
            )}
            {conversations.map((conversation) => {
              const identity = conversationIdentity(conversation, accountId);
              const peerId = (conversation.members ?? []).find((id) => id !== accountId) || conversation.counterpart?.user_id;
              const isSelected = selectedId === conversation.id;
              const preview = conversation.last_message_content || identity.description;
              const timeDisplay = formatChatTime(conversation.updated_at);

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className="chat-conversation-item"
                  aria-pressed={isSelected}
                  onClick={() =>
                    router.replace(
                      `${portalSection(role, "messages")}?chat=${encodeURIComponent(conversation.id)}`,
                      { scroll: false }
                    )
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "14px 16px",
                    border: 0,
                    borderBottom: "1px solid var(--line)",
                    background: isSelected ? "var(--primary-tint)" : "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <ChatIdentityAvatar identity={identity} size={46} />
                    {peerId && onlineUsers[peerId] && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 0,
                          right: 0,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: "#22c55e",
                          border: "2px solid white",
                        }}
                        title="Đang hoạt động"
                      />
                    )}
                  </div>
                  <div className="chat-identity-copy" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <strong
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 160,
                        }}
                      >
                        {identity.name}
                      </strong>
                      <small style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>{timeDisplay}</small>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: isSelected ? "var(--primary)" : "var(--muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "block",
                      }}
                    >
                      {preview}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right column: Active Chat Thread */}
        <section
          className={`messages-thread ${!selectedId ? "hide-on-mobile" : ""}`}
          aria-label="Nội dung cuộc trò chuyện"
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "white",
          }}
        >
          {selectedId ? (
            <>
              {/* Thread Header */}
              <div
                className="chat-thread-header"
                style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "white",
                  minHeight: 64,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <button
                    className="btn show-on-mobile"
                    type="button"
                    onClick={() => router.replace(portalSection(role, "messages"), { scroll: false })}
                    style={{ padding: "6px 8px", marginRight: -4 }}
                    aria-label="Quay lại"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  {selectedIdentity && <ChatIdentityAvatar identity={selectedIdentity} size={42} />}
                  <div style={{ minWidth: 0 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 16,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {selectedIdentity?.name || "Cuộc trò chuyện"}
                    </h2>
                    {(() => {
                      const peerId = (selected?.members ?? []).find((id) => id !== accountId) || selected?.counterpart?.user_id;
                      const isOnline = peerId ? !!onlineUsers[peerId] : false;
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Circle size={8} fill={isOnline ? "#22c55e" : "#94a3b8"} color="transparent" />
                          <small style={{ color: "var(--muted)", fontSize: 12 }}>
                            {isOnline ? "Đang hoạt động" : "Không trực tuyến"}
                          </small>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void startCall()}
                    disabled={!selected || startingCall}
                    style={{
                      borderRadius: 20,
                      padding: "8px 16px",
                      fontSize: 13,
                      gap: 6,
                    }}
                  >
                    <Video size={16} />
                    <span>{startingCall ? "Đang gọi..." : "Gọi video"}</span>
                  </button>
                </div>
              </div>

              {/* Message scroll container */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  minHeight: 320,
                  overflowY: "auto",
                  padding: "20px 24px",
                  background: "#f8faf9",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                aria-label="Tin nhắn trong hội thoại"
              >
                {hasMore && (
                  <div style={{ textAlign: "center", marginBottom: 10 }}>
                    <button
                      className="btn"
                      type="button"
                      disabled={loadingMessages}
                      onClick={() => void loadOlder()}
                      style={{ fontSize: 12, padding: "5px 14px", borderRadius: 16 }}
                    >
                      {loadingMessages ? "Đang tải..." : "Tải tin nhắn cũ hơn"}
                    </button>
                  </div>
                )}
                {loadingMessages && !messages.length && <LoadingState />}
                {messageError && (
                  <ErrorState
                    message={messageError}
                    onRetry={() => (hasMore ? void loadOlder() : setRevision((v) => v + 1))}
                  />
                )}
                {!loadingMessages && !messageError && !messages.length && (
                  <div style={{ margin: "auto", textAlign: "center" }}>
                    <EmptyState
                      title="Chưa có tin nhắn nào"
                      description="Hãy gửi lời chào đầu tiên để bắt đầu cuộc trò chuyện!"
                    />
                  </div>
                )}

                {(() => {
                  const renderedCallIds = new Set<string>();
                  return messages.map((message) => {
                    const isMe = message.sender_id === accountId;
                    const call = parseCallMessage(message.content);

                    // 1. Render Video Call Card
                    if (call) {
                      if (renderedCallIds.has(call.callId)) {
                        return null;
                      }
                      renderedCallIds.add(call.callId);

                      const finalStatus = callStatusMap.get(call.callId);
                      const isOld = Date.now() - new Date(message.created_at).getTime() > 2 * 60 * 1000;
                      const isVeryOld = Date.now() - new Date(message.created_at).getTime() > 30 * 60 * 1000;
                      const isEnded =
                        call.action === "ENDED" ||
                        finalStatus === "ENDED" ||
                        endedCallIds.has(call.callId) ||
                        (!finalStatus && isOld) ||
                        (finalStatus === "ACCEPTED" && isVeryOld);
                      const isRejected = call.action === "REJECTED" || finalStatus === "REJECTED";
                      const isAccepted = !isEnded && !isRejected && (call.action === "ACCEPTED" || finalStatus === "ACCEPTED");

                    return (
                      <div
                        key={message.id}
                        style={{
                          margin: "12px auto",
                          maxWidth: 380,
                          width: "100%",
                          background: "white",
                          borderRadius: 14,
                          padding: 14,
                          border: "1px solid var(--line)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          alignItems: "center",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: "50%",
                              background: isEnded
                                ? "#f1f5f9"
                                : isRejected
                                ? "#fee2e2"
                                : "var(--primary-tint)",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            {isEnded ? (
                              <PhoneOff size={18} color="#64748b" />
                            ) : isRejected ? (
                              <PhoneOff size={18} color="#ef4444" />
                            ) : (
                              <Video size={18} color="var(--primary)" />
                            )}
                          </div>
                          <div style={{ textAlign: "left" }}>
                            <strong style={{ fontSize: 14, display: "block" }}>
                              {isEnded
                                ? "Cuộc gọi video đã kết thúc"
                                : isRejected
                                ? "Cuộc gọi bị từ chối / Cuộc gọi nhỡ"
                                : isAccepted
                                ? "Cuộc gọi video đang diễn ra"
                                : "Cuộc gọi video"}
                            </strong>
                            <small style={{ color: "var(--muted)", fontSize: 12 }}>
                              {formatFullTime(message.created_at)}
                            </small>
                          </div>
                        </div>

                        {/* If call is still pending/active, show actions */}
                        {!isEnded && !isRejected && (
                          <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 4 }}>
                            {!isMe && call.action === "STARTED" && (
                              <button
                                type="button"
                                className="btn"
                                onClick={() => void rejectCallFromThread(call.callId)}
                                style={{ flex: 1, fontSize: 13, padding: "7px 12px", borderRadius: 8 }}
                              >
                                Từ chối
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => void acceptCallFromThread(call.callId)}
                              style={{ flex: 1, fontSize: 13, padding: "7px 12px", borderRadius: 8 }}
                            >
                              Tham gia cuộc gọi
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // 2. Render standard Chat Bubble
                  const isFailed = message.status === "failed";
                  const isSending = message.status === "sending";

                  return (
                    <article
                      key={message.id || message.client_message_id}
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: isMe ? "flex-end" : "flex-start",
                        gap: 8,
                        margin: "2px 0",
                      }}
                    >
                      {!isMe && selectedIdentity && (
                        <ChatIdentityAvatar identity={selectedIdentity} size={28} />
                      )}

                      <div
                        style={{
                          maxWidth: "70%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: isMe ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            padding: "10px 15px",
                            borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                            background: isMe ? "var(--primary)" : "white",
                            color: isMe ? "white" : "var(--text)",
                            border: isFailed
                              ? "1px solid #ef4444"
                              : isMe
                              ? "none"
                              : "1px solid var(--line)",
                            boxShadow: isMe
                              ? "0 1px 3px rgba(8,127,70,0.15)"
                              : "0 1px 2px rgba(0,0,0,0.03)",
                            fontSize: 14,
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            opacity: isSending ? 0.75 : 1,
                            transition: "opacity 0.2s ease",
                          }}
                        >
                          {message.content}
                        </div>

                        {/* Status bar below message */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 3,
                            fontSize: 11,
                            color: "var(--muted)",
                          }}
                        >
                          <time dateTime={message.created_at}>{formatFullTime(message.created_at)}</time>

                          {isMe && (
                            <>
                              {isSending && <Loader2 size={12} className="spin" />}
                              {message.status === "sent" && <Check size={13} color="#94a3b8" />}
                              {message.status === "delivered" && <CheckCheck size={13} color="#16a34a" />}
                              {isFailed && (
                                <button
                                  type="button"
                                  onClick={() => handleRetry(message)}
                                  style={{
                                    border: 0,
                                    background: "transparent",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    padding: 0,
                                    fontSize: 11,
                                    fontWeight: 600,
                                  }}
                                  title="Thử gửi lại"
                                >
                                  <AlertCircle size={13} />
                                  <span>Lỗi. Nhấn để gửi lại</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                });
                })()}
              </div>

              {/* Message Input Form */}
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                style={{
                  padding: "14px 20px",
                  borderTop: "1px solid var(--line)",
                  background: "white",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {actionError && (
                  <p role="alert" className="form-error" style={{ margin: 0, fontSize: 12 }}>
                    {actionError}
                  </p>
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    ref={inputRef}
                    id="chat-message"
                    className="input"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Nhập tin nhắn... (Nhấn Enter để gửi)"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      borderRadius: 22,
                      padding: "10px 18px",
                      fontSize: 14,
                    }}
                    autoComplete="off"
                  />
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={!inputText.trim()}
                    style={{
                      borderRadius: "50%",
                      width: 42,
                      height: 42,
                      padding: 0,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                    title="Gửi tin nhắn"
                    aria-label="Gửi tin nhắn"
                  >
                    <SendHorizontal size={18} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div style={{ margin: "auto", textAlign: "center", padding: 32 }}>
              <EmptyState
                title="Chọn một cuộc trò chuyện"
                description="Chọn một cuộc hội thoại ở danh sách bên trái để bắt đầu nhắn tin và gọi video."
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function MessagesScreen() {
  const account = useCurrentAccount();
  if (account?.role === "CANDIDATE" || account?.role === "RECRUITER") {
    return <ChatInterface key={account.id} accountId={account.id} role={account.role} />;
  }
  return <LoadingState />;
}
