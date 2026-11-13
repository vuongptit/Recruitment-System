"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiClientError, toUserMessage } from "@/lib/apiClient";
import { getOffer, type Offer } from "@/lib/person2Api";
import { formatApplicationDate } from "@/lib/applicationStateMachine";
import { offerStatusLabel } from "@/lib/recruitmentLabels";
import { ErrorState, LoadingState, StatusBadge } from "./ui";
import styles from "./ApplicationJourney.module.css";

export function ApplicationOfferSummary({ offerId, applicationId, candidate = false }: { offerId: string; applicationId: string; candidate?: boolean }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getOffer(offerId, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      if (!response.data || response.data.applicationId !== applicationId) throw new ApiClientError({ code: "INVALID_API_RESPONSE" });
      setOffer(response.data);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(toUserMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [offerId, applicationId, reload]);

  return <section className="panel stack" aria-label="Thư mời của hồ sơ">
    <div className="section-head"><h2>Thư mời nhận việc</h2>{!loading && !error && offer ? <StatusBadge tone={offer.status === "ACCEPTED" ? "success" : "info"}>{offerStatusLabel(offer.status)}</StatusBadge> : null}</div>
    {loading ? <LoadingState label="Đang tải thư mời" /> : error ? <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} /> : offer ? <>
      <p><strong>{offer.jobTitle}</strong></p>
      <dl className={styles.offerGrid}><div><dt>Mức lương đề nghị</dt><dd>{Number.isFinite(Number(offer.salary)) ? Number(offer.salary).toLocaleString("vi-VN") : offer.salary}</dd></div><div><dt>Ngày bắt đầu dự kiến</dt><dd>{offer.startDate ? offer.startDate.split("-").reverse().join("/") : "Chưa có"}</dd></div><div><dt>Hạn phản hồi · GMT+7</dt><dd>{formatApplicationDate(offer.expiresAt)}</dd></div></dl>
      {offer.note ? <p style={{ whiteSpace: "pre-wrap" }}>{offer.note}</p> : null}
      {offer.responseNote ? <p style={{ whiteSpace: "pre-wrap" }}>Phản hồi của ứng viên: {offer.responseNote}</p> : null}
      {candidate ? <Link className="btn btn-primary" href={`/candidate/offers/${offer.id}`}>{offer.status === "PENDING_CANDIDATE_RESPONSE" && Date.parse(offer.expiresAt) > Date.now() && (!offer.applicationStatus || offer.applicationStatus === "OFFER") ? "Mở thư mời và phản hồi" : "Xem thư mời"}</Link> : <p className="help">Trạng thái thư mời tách biệt với bước xét tuyển. Thư mời hết hạn không đồng nghĩa ứng viên đã bị từ chối; nhà tuyển dụng cần xử lý kết quả hồ sơ.</p>}
    </> : null}
  </section>;
}
