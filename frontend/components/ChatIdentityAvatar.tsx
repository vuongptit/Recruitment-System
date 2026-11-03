"use client";

import { useEffect, useState } from "react";
import { Building2, Users } from "lucide-react";
import type { ChatIdentityView } from "@/lib/chatIdentity";

export function ChatIdentityAvatar({ identity, size = 42 }: { identity: ChatIdentityView; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [identity.imageUrl]);
  const initials = identity.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("vi-VN") || "?";
  const iconSize = Math.max(14, Math.round(size / 2));

  return (
    <span
      className={`chat-identity-avatar chat-identity-${identity.kind.toLowerCase()}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size, fontSize: Math.max(11, Math.round(size * 0.32)) }}
      aria-hidden="true"
    >
      {identity.imageUrl && !failed ? (
        <img src={identity.imageUrl} width={size} height={size} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : identity.kind === "COMPANY" ? (
        <Building2 size={iconSize} />
      ) : identity.kind === "GROUP" ? (
        <Users size={iconSize} />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
