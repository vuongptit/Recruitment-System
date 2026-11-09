"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { LocationPicker } from "./LocationPicker";
import styles from "./Discovery.module.css";

export function HomeJobSearch() {
  const [location, setLocation] = useState("");
  return <form action="/candidate/jobs" className={`${styles.searchBar} ${styles.homeSearch}`} role="search" aria-label="Tìm kiếm việc làm">
    <div className={styles.searchField}><Search size={20} aria-hidden="true" /><label className="sr-only" htmlFor="home-job-keyword">Vị trí hoặc kỹ năng</label><input id="home-job-keyword" name="q" placeholder="Vị trí tuyển dụng, tên công ty" maxLength={200} /></div>
    <LocationPicker value={location} onChange={setLocation} id="home-job-location" />
    <button className="btn btn-primary" type="submit"><Search size={18} aria-hidden="true" />Tìm việc</button>
    <input type="hidden" name="search" value="1" />
  </form>;
}
