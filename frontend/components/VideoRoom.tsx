"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { Mic, MicOff, Video, VideoOff, ScreenShare, PhoneOff, Loader2 } from "lucide-react";
import { requestApi, toUserMessage } from "@/lib/apiClientCore";
import { sendChatMessage } from "@/lib/chatApi";
import { portalSection } from "@/lib/portalRoutes";
import { useCurrentAccount } from "./SessionGate";
import { ErrorState, LoadingState } from "./ui";

interface RoomCredentials {
  token: string;
  livekit_url: string;
  call: { host_id: string; conversation_id: string; status: string };
}

function GoogleMeetConference({
  callId,
  conversationId,
  backHref,
}: {
  callId: string;
  conversationId: string;
  backHref: string;
}) {
  const router = useRouter();
  const room = useRoomContext();
  const account = useCurrentAccount();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const [ending, setEnding] = useState(false);
  const endingRef = useRef(false);
  const hadRemoteParticipant = useRef(false);

  const backHrefRef = useRef(backHref);
  backHrefRef.current = backHref;
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const leaveAndEndCall = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);

    try {
      await requestApi(`/api/calls/${encodeURIComponent(callId)}/end`, {
        method: "POST",
        privateData: true,
        maxRetries: 0,
      });
    } catch {
      /* ignore */
    }

    const convId = conversationIdRef.current;
    if (convId) {
      try {
        await sendChatMessage(convId, `[CALL_ENDED] ${callId}`, crypto.randomUUID());
      } catch {
        /* ignore */
      }
    }

    window.dispatchEvent(new CustomEvent("video_call_ended", { detail: { callId } }));

    try {
      room.disconnect();
    } catch {
      /* ignore */
    }

    router.replace(backHrefRef.current);
  }, [callId, room, router]);

  const leaveAndEndCallRef = useRef(leaveAndEndCall);
  leaveAndEndCallRef.current = leaveAndEndCall;

  // Page exit & abrupt disconnect handling
  useEffect(() => {
    const handlePageHide = () => {
      if (!endingRef.current) {
        try {
          fetch(`/api/calls/${encodeURIComponent(callId)}/end`, {
            method: "POST",
            credentials: "include",
            keepalive: true,
          });
        } catch {
          /* ignore */
        }
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      // If user navigated away inside the portal, end call and notify
      if (!endingRef.current) {
        void leaveAndEndCallRef.current();
      }
    };
  }, [callId]);

  // If the remote participant joined and then disconnected, auto-end after 3s
  const remoteCount = participants.filter((p) => !p.isLocal).length;
  if (remoteCount > 0) {
    hadRemoteParticipant.current = true;
  }
  useEffect(() => {
    if (hadRemoteParticipant.current && remoteCount === 0) {
      const timer = setTimeout(() => {
        void leaveAndEndCallRef.current();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [remoteCount]);

  // Display all tracks, or fallback to local participant
  const displayTracks = tracks.length > 0 ? tracks : [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#202124",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Video Tiles Grid (Google Meet Layout) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 20px",
          boxSizing: "border-box",
          width: "100%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              displayTracks.length <= 1
                ? "1fr"
                : displayTracks.length === 2
                ? "repeat(auto-fit, minmax(360px, 1fr))"
                : "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
            width: "100%",
            height: "100%",
            maxHeight: "100%",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {displayTracks.map((t) => {
            const p = t.participant;
            let displayName = p.name?.trim() || "";
            if (!displayName) {
              if (p.isLocal) {
                displayName = account?.email ? account.email.split("@")[0] : "Bạn";
              } else {
                displayName = p.identity ? p.identity.slice(0, 8) : "Người dùng";
              }
            }

            let avatarUrl = "";
            try {
              if (p.metadata) {
                const meta = JSON.parse(p.metadata);
                if (typeof meta.avatar_url === "string") avatarUrl = meta.avatar_url;
              }
            } catch {
              /* ignore */
            }

            const isReference = isTrackReference(t);
            const hasActiveVideo = isReference && t.publication && !t.publication.isMuted && !!t.publication.track;
            const isSpeaking = p.isSpeaking;
            const isMuted = !p.isMicrophoneEnabled;

            return (
              <div
                key={`${p.identity}-${t.source}`}
                style={{
                  background: "#3c4043",
                  borderRadius: 12,
                  overflow: "hidden",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  minHeight: 220,
                  maxHeight: displayTracks.length <= 1 ? "calc(100dvh - 190px)" : "100%",
                  aspectRatio: displayTracks.length <= 1 ? "16 / 9" : undefined,
                  margin: "0 auto",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
                }}
              >
                {/* Active Video Feed */}
                {hasActiveVideo && isReference ? (
                  <VideoTrack
                    trackRef={t}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: t.source === Track.Source.ScreenShare ? "contain" : "cover",
                    }}
                  />
                ) : (
                  /* Google Meet Placeholder when Camera is OFF */
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      userSelect: "none",
                    }}
                  >
                    <div
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: "50%",
                        background: isSpeaking ? "#15803d" : "#00875a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: isSpeaking
                          ? "0 0 0 6px rgba(34, 197, 94, 0.4), 0 0 0 12px rgba(34, 197, 94, 0.2)"
                          : "0 4px 12px rgba(0,0,0,0.2)",
                        transition: "box-shadow 0.2s ease, background 0.2s ease",
                        overflow: "hidden",
                      }}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={displayName}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: 34,
                            fontWeight: 600,
                            color: "#fff",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                          }}
                        >
                          {displayName.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <span style={{ color: "#e8eaed", fontSize: 16, fontWeight: 500 }}>
                      {displayName} {p.isLocal ? "(Bạn)" : ""}
                    </span>
                  </div>
                )}

                {/* Bottom-left Name Pill */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 12,
                    left: 12,
                    background: "rgba(0, 0, 0, 0.65)",
                    backdropFilter: "blur(6px)",
                    color: "#fff",
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    pointerEvents: "none",
                    zIndex: 2,
                    maxWidth: "calc(100% - 24px)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isMuted ? (
                    <MicOff size={15} color="#ea4335" />
                  ) : (
                    <Mic size={15} color={isSpeaking ? "#22c55e" : "#e8eaed"} />
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {displayName} {p.isLocal ? "(Bạn)" : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Control Bar (Google Meet Style) */}
      <footer
        style={{
          height: 80,
          minHeight: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#202124",
          padding: "0 24px",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          zIndex: 10,
        }}
      >
        {/* Mic Toggle */}
        <button
          type="button"
          onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          title={isMicrophoneEnabled ? "Tắt micro" : "Bật micro"}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "none",
            background: isMicrophoneEnabled ? "#3c4043" : "#ea4335",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Camera Toggle */}
        <button
          type="button"
          onClick={() => void localParticipant.setCameraEnabled(!isCameraEnabled)}
          title={isCameraEnabled ? "Tắt camera" : "Bật camera"}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "none",
            background: isCameraEnabled ? "#3c4043" : "#ea4335",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* Screen Share Toggle */}
        <button
          type="button"
          onClick={() => void localParticipant.setScreenShareEnabled(!isScreenShareEnabled)}
          title={isScreenShareEnabled ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "none",
            background: isScreenShareEnabled ? "#1a73e8" : "#3c4043",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <ScreenShare size={20} />
        </button>

        {/* Red Leave / End Call Button */}
        <button
          type="button"
          onClick={() => void leaveAndEndCall()}
          disabled={ending}
          title="Rời cuộc gọi và kết thúc cho mọi người"
          style={{
            height: 48,
            borderRadius: 24,
            padding: "0 22px",
            border: "none",
            background: "#ea4335",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: ending ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
            opacity: ending ? 0.7 : 1,
            transition: "all 0.15s ease",
          }}
        >
          {ending ? <Loader2 size={18} className="spinner" /> : <PhoneOff size={18} />}
          <span>{ending ? "Đang kết thúc…" : "Rời cuộc gọi"}</span>
        </button>
      </footer>
    </div>
  );
}

export function VideoRoom({ callId }: { callId: string }) {
  const router = useRouter();
  const account = useCurrentAccount();
  const [credentials, setCredentials] = useState<RoomCredentials | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const messagePath = portalSection(account?.role ?? "CANDIDATE", "messages");
  const conversationId = credentials?.call.conversation_id;
  const backHref = conversationId
    ? `${messagePath}?chat=${encodeURIComponent(conversationId)}`
    : messagePath;

  const backHrefRef = useRef(backHref);
  backHrefRef.current = backHref;

  useEffect(() => {
    const controller = new AbortController();
    setCredentials(null);
    setError("");

    const joinRoom = async () => {
      let displayName = account?.email ? account.email.split("@")[0] : "User";
      let avatarUrl = "";

      if (account?.role === "CANDIDATE" && account?.id) {
        try {
          const profile = await requestApi<{ fullName?: string; avatarUrl?: string }>(
            `/api/profile/${account.id}`,
            { privateData: true, signal: controller.signal, maxRetries: 0 }
          );
          if (profile.data?.fullName?.trim()) {
            displayName = profile.data.fullName.trim();
          }
          if (profile.data?.avatarUrl) {
            avatarUrl = profile.data.avatarUrl;
          }
        } catch {
          /* fallback to email name */
        }
      }

      try {
        const response = await requestApi<RoomCredentials>(
          `/api/calls/${encodeURIComponent(callId)}/join`,
          {
            method: "POST",
            privateData: true,
            body: { display_name: displayName, avatar_url: avatarUrl },
            signal: controller.signal,
            maxRetries: 0,
          }
        );
        if (!controller.signal.aborted) {
          setCredentials(response.data);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(toUserMessage(failure));
        }
      }
    };

    void joinRoom();

    const handleEnded = (event: Event) => {
      if ((event as CustomEvent<{ callId: string }>).detail?.callId !== callId) return;
      router.replace(backHrefRef.current);
    };

    const handleOffline = (event: Event) => {
      if ((event as CustomEvent<{ callId: string }>).detail?.callId !== callId) return;
      setError("Người nhận hiện chưa trực tuyến. Bạn có thể nhắn tin để hẹn lại.");
    };

    window.addEventListener("video_call_rejected", handleEnded);
    window.addEventListener("video_call_ended", handleEnded);
    window.addEventListener("video_call_offline", handleOffline);

    return () => {
      controller.abort();
      window.removeEventListener("video_call_rejected", handleEnded);
      window.removeEventListener("video_call_ended", handleEnded);
      window.removeEventListener("video_call_offline", handleOffline);
    };
  }, [callId, revision, account?.id, account?.role, account?.email, router]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: "#202124",
          padding: 24,
        }}
      >
        <ErrorState message={error} onRetry={() => setRevision((v) => v + 1)} />
        <button
          type="button"
          className="btn"
          onClick={() => router.replace(backHrefRef.current)}
          style={{ marginTop: 16 }}
        >
          Quay lại cuộc trò chuyện
        </button>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: "#202124",
        }}
      >
        <LoadingState label="Đang chuẩn bị phòng gọi…" />
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={false}
      audio={true}
      token={credentials.token}
      serverUrl={credentials.livekit_url}
      data-lk-theme="default"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: "#202124",
      }}
      onError={() =>
        setError(
          "Không thể kết nối camera, micro hoặc phòng gọi. Hãy kiểm tra quyền thiết bị và kết nối mạng."
        )
      }
    >
      <GoogleMeetConference
        callId={callId}
        conversationId={credentials.call.conversation_id}
        backHref={backHref}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
