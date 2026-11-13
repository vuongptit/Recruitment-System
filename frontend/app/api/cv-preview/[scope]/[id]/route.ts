import { NextRequest } from "next/server";
import { serveCvPreview } from "@/lib/cvPreview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest, { params }: { params: { scope: string; id: string } }) {
  return serveCvPreview(params.scope, params.id, request.cookies.get("careerhub_token")?.value);
}
