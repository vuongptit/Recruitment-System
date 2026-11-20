"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  Sparkles,
  X,
  RotateCcw,
  Send,
  ExternalLink,
  ChevronDown,
  Lock,
} from "lucide-react";
import { useCurrentAccount } from "./SessionGate";
import { createChatSessionId, toUserMessage } from "../lib/apiClient";
import {
  appendAiChatExchange,
  type AiChatMessage,
} from "../lib/aiChatConversation";
import {
  classifyAiChatBackpressure,
  runAiChatWithBusyRetry,
} from "../lib/aiChatBackpressure";
import { isAiChatSessionBusy } from "../lib/aiChatSessionLock";
import {
  classifyAiChatFeatureState,
  type AiChatFeatureState,
} from "../lib/aiChatFeatureState";
import { validateAiChatMessage } from "../lib/aiChatMessage";
import { presentAiChatResponse } from "../lib/aiChatResponse";
import { sendAiChatMessage } from "../lib/person2Api";
import styles from "./FloatingChatWidget.module.css";

const DEFAULT_WELCOME_MESSAGE: AiChatMessage = {
  id: "welcome-message",
  role: "assistant",
  content:
    "Xin chào! Tôi là Trợ lý AI CareerHub (sử dụng Google Gemini). Tôi có thể hỗ trợ bạn tìm việc làm phù hợp, viết CV và chuẩn bị phỏng vấn.",
};

const SUGGESTIONS = [
  "Gợi ý việc làm phù hợp cho tôi",
  "Cách tối ưu hóa CV xin việc",
  "Kinh nghiệm trả lời phỏng vấn IT",
  "Quy trình nộp hồ sơ trên CareerHub",
];

export function FloatingChatWidget() {
  const pathname = usePathname();
  const account = useCurrentAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    DEFAULT_WELCOME_MESSAGE,
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [featureState, setFeatureState] = useState<AiChatFeatureState>(null);
  const exchangeSequence = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isCandidate = account?.role === "CANDIDATE";
  const draftValidation = validateAiChatMessage(draft);

  // Initialize session ID
  useEffect(() => {
    setSessionId(createChatSessionId());
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setCooldownSeconds((curr) => Math.max(0, curr - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, pending, isOpen]);

  if (
    pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname === "/candidate/ai" ||
    (pathname.startsWith("/interviews/") && pathname.endsWith("/room"))
  ) {
    return null;
  }

  function handleReset() {
    setSessionId(createChatSessionId());
    setMessages([DEFAULT_WELCOME_MESSAGE]);
    setDraft("");
    setError("");
    setCooldownSeconds(0);
    setFeatureState(null);
    exchangeSequence.current = 0;
  }

  async function sendMessageContent(text: string) {
    const activeSessionId = sessionId;
    const validation = validateAiChatMessage(text);
    if (!activeSessionId || validation.errorCode || pending || cooldownSeconds > 0)
      return;

    const message = validation.value;
    setPending(true);
    setError("");

    try {
      const response = await runAiChatWithBusyRetry(() =>
        sendAiChatMessage(activeSessionId, message)
      );
      exchangeSequence.current += 1;
      setMessages((current) =>
        appendAiChatExchange(
          current,
          message,
          response.data.answer,
          `${activeSessionId}-${exchangeSequence.current}`
        )
      );
      setDraft("");
    } catch (reason: unknown) {
      const nextFeatureState = classifyAiChatFeatureState(reason);
      if (nextFeatureState) {
        setFeatureState(nextFeatureState);
        setError("");
      } else if (isAiChatSessionBusy(reason)) {
        setError(
          "Phiên đang xử lý một tin nhắn khác. Hãy đợi trong giây lát rồi thử lại."
        );
      } else {
        const backpressure = classifyAiChatBackpressure(reason);
        if (backpressure?.kind === "rate-limit") {
          setCooldownSeconds(backpressure.retryAfterSeconds);
          setError("");
        } else if (backpressure?.kind === "busy") {
          setError(
            "Trợ lý AI đang bận. Vui lòng thử lại sau vài giây."
          );
        } else {
          setError(toUserMessage(reason));
        }
      }
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessageContent(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessageContent(draft);
    }
  }

  return (
    <div className={styles.floatingWidgetContainer}>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          type="button"
          className={styles.fabButton}
          onClick={() => setIsOpen(true)}
          aria-label="Mở Trợ lý AI CareerHub"
        >
          <div className={styles.fabIconWrapper}>
            <Sparkles size={19} aria-hidden="true" />
            <span className={styles.fabPulseRing} />
          </div>
          <span className={styles.fabLabel}>Trợ lý AI</span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <aside
          className={styles.chatWindow}
          aria-label="Hộp thoại Trợ lý AI CareerHub"
        >
          {/* Header */}
          <div className={styles.chatHeader}>
            <div className={styles.headerInfo}>
              <div className={styles.botAvatar}>
                <Bot size={22} aria-hidden="true" />
                <span className={styles.onlineBadge} />
              </div>
              <div>
                <h3 className={styles.headerTitle}>CareerHub AI</h3>
                <p className={styles.headerSubtitle}>
                  <Sparkles size={12} aria-hidden="true" />
                  Google Gemini Flash
                </p>
              </div>
            </div>
            <div className={styles.headerActions}>
              {isCandidate && (
                <button
                  type="button"
                  className={styles.headerBtn}
                  onClick={handleReset}
                  title="Bắt đầu hội thoại mới"
                  aria-label="Bắt đầu hội thoại mới"
                >
                  <RotateCcw size={16} />
                </button>
              )}
              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => setIsOpen(false)}
                title="Thu nhỏ cửa sổ chat"
                aria-label="Thu nhỏ cửa sổ chat"
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className={styles.chatBody}>
            {/* Non-candidate Notice */}
            {!isCandidate && (
              <div className={styles.authNotice}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, marginBottom: 4 }}>
                  <Lock size={15} />
                  <span>Dành riêng cho Ứng viên</span>
                </div>
                {account === null ? (
                  <p style={{ margin: 0 }}>
                    Bạn cần đăng nhập tài khoản Ứng viên để nhận gợi ý việc làm riêng và tư vấn nghề nghiệp.{" "}
                    <Link href={`/login?returnTo=${encodeURIComponent(pathname)}`}>
                      Đăng nhập ngay
                    </Link>
                  </p>
                ) : (
                  <p style={{ margin: 0 }}>
                    Trợ lý AI hiện được tối ưu riêng cho Ứng viên. Bạn đang đăng nhập bằng tài khoản{" "}
                    {account?.role === "RECRUITER" ? "Nhà tuyển dụng" : "Quản trị viên"}.
                  </p>
                )}
              </div>
            )}

            {/* Feature State Banners */}
            {featureState === "hidden" && (
              <div className={`${styles.noticeBanner} ${styles.noticeWarning}`}>
                Tính năng Trợ lý AI hiện chưa sẵn sàng trên hệ thống.
              </div>
            )}
            {featureState === "forbidden" && (
              <div className={`${styles.noticeBanner} ${styles.noticeWarning}`}>
                Quyền truy cập dành riêng cho tài khoản ứng viên.
              </div>
            )}
            {featureState === "reauthenticate" && (
              <div className={`${styles.noticeBanner} ${styles.noticeWarning}`}>
                Phiên đăng nhập đã hết hạn. Vui lòng{" "}
                <Link href={`/login?returnTo=${encodeURIComponent(pathname)}`}>
                  đăng nhập lại
                </Link>
                .
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              if (isUser) {
                return (
                  <div key={msg.id} className={`${styles.msgRow} ${styles.msgRowUser}`}>
                    <div className={`${styles.bubble} ${styles.bubbleUser}`}>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Assistant message
              const presentation = presentAiChatResponse(msg.content);
              return (
                <div key={msg.id} className={`${styles.msgRow} ${styles.msgRowAssistant}`}>
                  <div className={styles.msgAvatar}>
                    <Bot size={16} />
                  </div>
                  <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
                    {presentation.jobLines.length > 0 ? (
                      <div>
                        {presentation.introduction && <p style={{ margin: "0 0 6px 0" }}>{presentation.introduction}</p>}
                        {presentation.jobLines.map((job) => (
                          <div key={job.jobId} className={styles.jobItemCard}>
                            <div>{job.text}</div>
                            <Link
                              href={`/candidate/jobs/${job.jobId}`}
                              className={styles.jobItemLink}
                              onClick={() => setIsOpen(false)}
                            >
                              Xem chi tiết việc làm
                              <ExternalLink size={12} />
                            </Link>
                          </div>
                        ))}
                        {presentation.conclusion && <p style={{ margin: "6px 0 0 0" }}>{presentation.conclusion}</p>}
                      </div>
                    ) : (
                      <div style={{ whiteSpace: "pre-wrap" }}>{presentation.text}</div>
                    )}

                    {presentation.hasSuitableJobsIntent && (
                      <Link
                        href="/candidate/jobs#suitable-jobs"
                        className={styles.actionButton}
                        onClick={() => setIsOpen(false)}
                      >
                        Mở Việc làm phù hợp
                        <ExternalLink size={13} />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Quick Suggestions (show when only welcome message exists) */}
            {messages.length === 1 && isCandidate && (
              <div className={styles.welcomeCard}>
                <strong>💡 Câu hỏi gợi ý nhanh:</strong>
                <div className={styles.promptChips}>
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className={styles.chip}
                      onClick={() => void sendMessageContent(suggestion)}
                      disabled={pending || cooldownSeconds > 0}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Typing Indicator */}
            {pending && (
              <div className={`${styles.msgRow} ${styles.msgRowAssistant}`}>
                <div className={styles.msgAvatar}>
                  <Bot size={16} />
                </div>
                <div className={styles.typingRow}>
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              </div>
            )}

            {/* Cooldown notice */}
            {cooldownSeconds > 0 && (
              <div className={`${styles.noticeBanner} ${styles.noticeWarning}`}>
                Bạn đã gửi quá nhanh. Có thể gửi lại sau <strong>{cooldownSeconds} giây</strong>.
              </div>
            )}

            {/* Error notice */}
            {error && (
              <div className={`${styles.noticeBanner} ${styles.noticeDanger}`}>
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Composer */}
          <div className={styles.chatFooter}>
            <form className={styles.composerForm} onSubmit={handleSubmit}>
              <textarea
                className={styles.inputField}
                rows={1}
                value={draft}
                placeholder={
                  isCandidate
                    ? "Nhập câu hỏi cho trợ lý AI..."
                    : "Đăng nhập ứng viên để trò chuyện..."
                }
                disabled={!isCandidate || pending || cooldownSeconds > 0}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
              />
              <button
                type="submit"
                className={styles.sendButton}
                disabled={
                  !isCandidate ||
                  pending ||
                  cooldownSeconds > 0 ||
                  !draft.trim()
                }
                title="Gửi tin nhắn (Enter)"
                aria-label="Gửi tin nhắn"
              >
                <Send size={16} />
              </button>
            </form>
            <div className={styles.footerMeta}>
              <span>Nhấn Enter để gửi, Shift+Enter xuống dòng</span>
              <span>{draft.length}/2.000</span>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
