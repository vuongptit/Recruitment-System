"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  Loader2,
} from "lucide-react";
import { requestApi } from "@/lib/apiClientCore";
import {
  interviewScheduleError,
  joinInterviewRoom,
  leaveInterviewRoom,
  listApplicationInterviews,
  type JoinInterviewRoomResponse,
} from "@/lib/interviewApi";
import { useCurrentAccount } from "./SessionGate";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "./ui";

function InterviewParticipantTile({
  trackRef,
  account,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  account: ReturnType<typeof useCurrentAccount>;
}) {
  const p = trackRef.participant;
  const displayName =
    p.name?.trim() ||
    (p.isLocal
      ? account?.email
        ? account.email.split("@")[0]
        : "Bạn"
      : p.identity
      ? p.identity.slice(0, 8)
      : "Thành viên");

  const isReference = isTrackReference(trackRef);
  const hasActiveVideo =
    isReference &&
    trackRef.publication &&
    !trackRef.publication.isMuted &&
    !!trackRef.publication.track;
  const isSpeaking = p.isSpeaking;
  const isMuted = !p.isMicrophoneEnabled;

  return (
    <div
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
        minHeight: 240,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
      }}
    >
      {hasActiveVideo && isReference ? (
        <VideoTrack
          trackRef={trackRef}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: "50%",
              background: isSpeaking ? "#15803d" : "#00875a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 28,
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            {displayName.slice(0, 2)}
          </div>
          <span style={{ color: "#e8eaed", fontSize: 15, fontWeight: 500 }}>
            {displayName} {p.isLocal ? "(Bạn)" : ""}
          </span>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          background: "rgba(0, 0, 0, 0.65)",
          color: "#fff",
          padding: "6px 12px",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {isMuted ? (
          <MicOff size={15} color="#ea4335" />
        ) : (
          <Mic size={15} color={isSpeaking ? "#22c55e" : "#e8eaed"} />
        )}
        <span>
          {displayName} {p.isLocal ? "(Bạn)" : ""}
        </span>
      </div>
    </div>
  );
}

function InterviewConferenceStage({
  interviewId,
  roundNumber,
  onLeave,
  returnLabel,
}: {
  interviewId: string;
  roundNumber: number;
  onLeave: () => void;
  returnLabel: string;
}) {
  const room = useRoomContext();
  const account = useCurrentAccount();
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
  } = useLocalParticipant();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);

  const handleLeave = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    try {
      await leaveInterviewRoom(interviewId);
    } catch {
      /* ignore leave error */
    }
    try {
      room.disconnect();
    } catch {
      /* ignore */
    }
    onLeave();
  }, [interviewId, onLeave, room]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "calc(100dvh - 80px)",
        minHeight: 540,
        background: "#202124",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "12px 20px",
          background: "rgba(0,0,0,0.35)",
          color: "#e8eaed",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 14,
        }}
      >
        <strong>Phòng phỏng vấn trực tuyến · Vòng {roundNumber}</strong>
        <span>LiveKit WebRTC</span>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: 16,
          display: "grid",
          gridTemplateColumns:
            tracks.length <= 1
              ? "1fr"
              : "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        {tracks.map((t) => (
          <InterviewParticipantTile
            key={`${t.participant.identity}-${t.source}`}
            trackRef={t}
            account={account}
          />
        ))}
      </div>

      <footer
        style={{
          height: 76,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#202124",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "0 20px",
        }}
      >
        <button
          type="button"
          onClick={() =>
            void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
          }
          title={isMicrophoneEnabled ? "Tắt micro" : "Bật micro"}
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: "none",
            background: isMicrophoneEnabled ? "#3c4043" : "#ea4335",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        <button
          type="button"
          onClick={() =>
            void localParticipant.setCameraEnabled(!isCameraEnabled)
          }
          title={isCameraEnabled ? "Tắt camera" : "Bật camera"}
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: "none",
            background: isCameraEnabled ? "#3c4043" : "#ea4335",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        <button
          type="button"
          onClick={() =>
            void localParticipant.setScreenShareEnabled(!isScreenShareEnabled)
          }
          title={
            isScreenShareEnabled ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"
          }
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: "none",
            background: isScreenShareEnabled ? "#1a73e8" : "#3c4043",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ScreenShare size={20} />
        </button>

        <button
          type="button"
          onClick={() => void handleLeave()}
          disabled={leaving}
          style={{
            height: 46,
            borderRadius: 23,
            padding: "0 20px",
            border: "none",
            background: "#ea4335",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: leaving ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {leaving ? (
            <Loader2 size={18} className="spinner" />
          ) : (
            <PhoneOff size={18} />
          )}
          <span>{leaving ? "Đang rời phòng…" : returnLabel}</span>
        </button>
      </footer>
    </div>
  );
}

export function InterviewVideoRoom({
  interviewId,
  applicationId,
  onLeave,
  returnLabel = "Rời phòng phỏng vấn",
}: {
  interviewId?: string;
  applicationId?: string;
  returnLabel?: string;
  onLeave: () => void;
}) {
  const account = useCurrentAccount();
  const [credentials, setCredentials] =
    useState<JoinInterviewRoomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setCredentials(null);

    const connectRoom = async () => {
      try {
        let targetInterviewId = interviewId?.trim() || "";
        if (!targetInterviewId && applicationId) {
          const page = await listApplicationInterviews(
            applicationId,
            null,
            controller.signal
          );
          const activeOnline = page.data.items.find(
            (iv) =>
              iv.mode === "ONLINE" &&
              ["IN_PROGRESS", "CONFIRMED", "SCHEDULED"].includes(iv.status)
          );
          if (activeOnline) {
            targetInterviewId = activeOnline.id;
          }
        }

        if (!targetInterviewId) {
          setError(
            "Chưa tìm thấy lịch phỏng vấn trực tuyến đang hoạt động cho hồ sơ này."
          );
          setLoading(false);
          return;
        }

        let displayName = account?.email
          ? account.email.split("@")[0]
          : account?.role === "RECRUITER"
          ? "Nhà tuyển dụng"
          : "Ứng viên";
        let avatarUrl = "";

        if (account?.role === "CANDIDATE" && account?.id) {
          try {
            const profile = await requestApi<{
              fullName?: string;
              avatarUrl?: string;
            }>(`/api/profile/${account.id}`, {
              privateData: true,
              signal: controller.signal,
              maxRetries: 0,
            });
            if (profile.data?.fullName?.trim()) {
              displayName = profile.data.fullName.trim();
            }
            if (profile.data?.avatarUrl) {
              avatarUrl = profile.data.avatarUrl;
            }
          } catch {
            /* fallback to email */
          }
        }

        const res = await joinInterviewRoom(
          targetInterviewId,
          { display_name: displayName, avatar_url: avatarUrl },
          controller.signal
        );
        if (!controller.signal.aborted) {
          setCredentials(res.data);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(interviewScheduleError(e));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void connectRoom();
    return () => controller.abort();
  }, [account?.email, account?.id, account?.role, applicationId, interviewId, reload]);

  if (loading) {
    return (
      <section className="card stack">
        <PageHeader title="Phòng phỏng vấn trực tuyến" />
        <LoadingState label="Đang kết nối vào phòng phỏng vấn video…" />
      </section>
    );
  }

  if (error || !credentials) {
    return (
      <section className="card stack">
        <PageHeader title="Phòng phỏng vấn trực tuyến" />
        <ErrorState
          message={
            error || "Không thể kết nối vào phòng phỏng vấn trực tuyến."
          }
          onRetry={() => setReload((v) => v + 1)}
        />
        <div className="btn-group">
          <button className="btn" type="button" onClick={onLeave}>
            {returnLabel}
          </button>
        </div>
      </section>
    );
  }

  if (!credentials.token || !credentials.livekit_url) {
    return (
      <section className="card stack">
        <PageHeader title="Phòng phỏng vấn trực tuyến" />
        <EmptyState
          title="Chưa nhận được thông tin kết nối LiveKit"
          description="Hãy thử kết nối lại hoặc kiểm tra trạng thái lịch phỏng vấn."
        />
        <div className="btn-group">
          <button className="btn" type="button" onClick={onLeave}>
            {returnLabel}
          </button>
        </div>
      </section>
    );
  }

  return (
    <LiveKitRoom
      token={credentials.token}
      serverUrl={credentials.livekit_url}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={onLeave}
      style={{ width: "100%", height: "100%" }}
    >
      <RoomAudioRenderer />
      <InterviewConferenceStage
        interviewId={credentials.interview.id}
        roundNumber={credentials.interview.roundNumber}
        onLeave={onLeave}
        returnLabel={returnLabel}
      />
    </LiveKitRoom>
  );
}
