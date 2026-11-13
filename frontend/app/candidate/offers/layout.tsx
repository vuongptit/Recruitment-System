import type { Metadata } from "next";
import { type ReactNode } from "react";
import { SessionGate } from "@/components/SessionGate";

export const metadata: Metadata = { title: "Phản hồi thư mời nhận việc" };

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return <SessionGate role="CANDIDATE">{children}</SessionGate>;
}
