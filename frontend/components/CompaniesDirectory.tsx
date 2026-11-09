"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, MapPin, Search, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { CompanyMark } from "./discovery/CompanyMark";
import styles from "./discovery/Discovery.module.css";
import { toUserMessage } from "@/lib/apiClient";
import { mergePublicCompanyPage, shouldLockCompanySearch } from "@/lib/companyPublicSearch";
import { type PublicCompanySummary, searchPublicCompanies } from "@/lib/person2Api";

export function CompaniesDirectory({ basePath = "/companies" }: { basePath?: string }) {
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLimit, setDraftLimit] = useState(20);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [companies, setCompanies] = useState<PublicCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [locked, setLocked] = useState(false);
  const [composing, setComposing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (locked || composing) return;
    const timer = window.setTimeout(() => {
      setQuery(draftQuery.trim());
      setLimit(draftLimit);
      setCursor(null);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [composing, draftLimit, draftQuery, locked]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    searchPublicCompanies({ q: query || undefined, limit, cursor }, controller.signal)
      .then((response) => {
        if (!active) return;
        setCompanies((current) => mergePublicCompanyPage(current, response.data, cursor !== null));
        setHasMore(Boolean(response.meta?.hasMore));
        setNextCursor(typeof response.meta?.nextCursor === "string" ? response.meta.nextCursor : null);
        setLocked(shouldLockCompanySearch(Boolean(response.meta?.hasMore), cursor));
      })
      .catch((reason: unknown) => { if (active) setError(reason); })
      .finally(() => {
        if (active) {
          setLoading(false);
          loadingRef.current = false;
        }
      });
    return () => { active = false; controller.abort(); };
  }, [cursor, limit, query, reloadKey]);

  const loadMore = useCallback(() => {
    if (!hasMore || !nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    setCursor(nextCursor);
  }, [hasMore, nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: "160px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  function startNewSearch() {
    setLocked(false);
    setDraftQuery("");
    setDraftLimit(20);
    setQuery("");
    setLimit(20);
    setCursor(null);
    setNextCursor(null);
    setHasMore(false);
    setCompanies([]);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Đường dẫn"><Link href="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Công ty</span></nav>
      <section className={styles.directoryHero}>
        <div><span className={styles.verified}><BadgeCheck size={16} aria-hidden="true" />Kết nối với doanh nghiệp đã xác minh</span><h1>Khám phá doanh nghiệp</h1><p>Tìm hiểu môi trường làm việc, khám phá cơ hội nghề nghiệp và chọn nơi bạn muốn gắn bó.</p>
          <form className={styles.directorySearch} onSubmit={event => { event.preventDefault(); if (!locked) { setQuery(draftQuery.trim()); setCursor(null); setReloadKey(value => value + 1); } }}>
            <Search size={20} aria-hidden="true" /><label className="sr-only" htmlFor="company-search">Tên công ty</label>
            <input ref={searchRef} id="company-search" type="search" value={draftQuery} disabled={locked} placeholder="Nhập tên công ty bạn muốn tìm" onCompositionStart={() => setComposing(true)} onCompositionEnd={(event) => { setComposing(false); setDraftQuery(event.currentTarget.value); }} onChange={(event) => setDraftQuery(event.target.value)} />
            {draftQuery && !locked ? <button className={styles.clearButton} type="button" aria-label="Xóa từ khóa công ty" onClick={() => { setDraftQuery(""); searchRef.current?.focus(); }}><X size={18} /></button> : null}
            <button className="btn btn-primary" type="submit" disabled={locked}>Tìm công ty</button>
          </form>
          {locked ? <p>Bạn đang xem danh sách đã tải. <button className="btn" type="button" onClick={startNewSearch}>Tìm kiếm mới</button></p> : null}
        </div>
        <Building2 aria-hidden="true" />
      </section>

      <section className={`${styles.directoryResults} company-search-results`} aria-busy={loading}>
        <div className={styles.resultHeader}><div><h2>Doanh nghiệp đã xác minh</h2><p>{query ? `Kết quả cho “${query}” · ` : ""}{companies.length.toLocaleString("vi-VN")} doanh nghiệp đã hiển thị</p></div><div className={styles.sortControl}><label htmlFor="company-limit">Số kết quả mỗi lần</label><select id="company-limit" value={draftLimit} disabled={locked} onChange={(event) => setDraftLimit(Number(event.target.value))}><option value={10}>10 công ty</option><option value={20}>20 công ty</option><option value={50}>50 công ty</option></select></div></div>
        {error ? <ErrorState message={toUserMessage(error)} onRetry={() => setReloadKey((value) => value + 1)} /> : null}
        {loading && companies.length === 0 ? <LoadingState label="Đang tìm công ty" /> : null}
        {!loading && !error && companies.length === 0 ? <EmptyState title="Chưa có công ty phù hợp" description="Thử từ khóa ngắn hơn hoặc xóa bộ lọc để xem tất cả doanh nghiệp." /> : null}
        <div className={styles.directoryGrid}>
          {companies.map((company) => (
            <Link className={`${styles.directoryCard} company-search-card`} href={`${basePath}/${company.id}`} prefetch={false} key={company.id} aria-label={`Xem hồ sơ ${company.name}`}>
              <div className={styles.directoryCardCover} aria-hidden="true" />
              <div className={styles.directoryCardBody}><div className={styles.directoryCardIdentity}><CompanyMark name={company.name} src={company.logoUrl} /><span className={styles.verified}><BadgeCheck size={14} aria-hidden="true" />Đã xác minh</span></div><h3>{company.name}</h3><p>{company.industry || "Chưa cập nhật lĩnh vực"}</p><p><UsersRound size={14} aria-hidden="true" />{company.size || "Chưa cập nhật quy mô"}</p><p><MapPin size={14} aria-hidden="true" />{company.address || "Chưa cập nhật địa chỉ"}</p><div className={styles.directoryCardFooter}>Hồ sơ & việc đang tuyển <ArrowRight size={17} aria-hidden="true" /></div></div>
            </Link>
          ))}
        </div>
        {loading && companies.length > 0 ? <p className="status-line" role="status">Đang tải thêm doanh nghiệp…</p> : null}
        <div ref={sentinelRef} className="company-search-sentinel" aria-hidden="true" />
        {hasMore ? <button className="btn btn-secondary" type="button" disabled={loading} onClick={loadMore}>Tải thêm công ty</button> : companies.length > 0 ? <p className="status-line">Đã hiển thị hết kết quả.</p> : null}
      </section>
    </main>
  );
}
