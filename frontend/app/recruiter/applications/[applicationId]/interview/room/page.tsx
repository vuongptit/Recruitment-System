"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { InterviewVideoRoom } from "@/components/InterviewVideoRoom";

export default function RecruiterInterviewRoomPage({
  params,
}: {
  params: { applicationId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get("interviewId") ?? undefined;

  return (
    <div style={{ height: "100%", width: "100%", background: "var(--surface)" }}>
      <InterviewVideoRoom
        interviewId={interviewId}
        applicationId={params.applicationId}
        returnLabel="Quay lại hồ sơ"
        onLeave={() => router.push(`/recruiter/applications/${params.applicationId}`)}
      />
    </div>
  );
}
