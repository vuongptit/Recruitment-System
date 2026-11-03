"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "./ui";

const VideoRoom = dynamic(() => import("./VideoRoom").then(module => module.VideoRoom), {
  ssr: false,
  loading: () => <LoadingState label="Đang chuẩn bị phòng gọi" />,
});

export default function CallScreen({ params }: { params: { id: string } }) {
  return (
    <main className="call-room-main" style={{ width: "100%", height: "100%", display: "flex", flex: 1, minHeight: 0 }}>
      <div className="call-room-workspace">
        <VideoRoom callId={params.id} />
      </div>
    </main>
  );
}
