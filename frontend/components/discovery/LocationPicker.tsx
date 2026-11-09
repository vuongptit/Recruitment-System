"use client";

import * as Popover from "@radix-ui/react-popover";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, MapPin, Search, X } from "lucide-react";
import { loadProvinceWards, locationSearchValue, normalizeLocationText, provinceForLocation, provinces, wardForLocation, type Ward } from "@/lib/locations/catalogue";
import styles from "./LocationPicker.module.css";

export function LocationPicker({ value, onChange, name = "location", id = "location", invalid = false, describedBy }: {
  value: string; onChange: (value: string) => void; name?: string; id?: string; invalid?: boolean; describedBy?: string;
}) {
  const groupId = useId();
  const provinceInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [provinceCode, setProvinceCode] = useState("");
  const [wardName, setWardName] = useState("");
  const [provinceQuery, setProvinceQuery] = useState("");
  const [wardQuery, setWardQuery] = useState("");
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const selectedProvince = provinces.find(province => province.code === provinceCode);

  function changeOpen(next: boolean) {
    if (next) {
      const province = provinceForLocation(value);
      setProvinceCode(province?.code ?? "");
      setWardName(wardForLocation(value, province));
      setProvinceQuery("");
      setWardQuery("");
    }
    setOpen(next);
  }

  useEffect(() => {
    setWards([]);
    setError(false);
    setLoading(false);
    if (!open || !provinceCode) return;
    const controller = new AbortController();
    setLoading(true);
    loadProvinceWards(provinceCode, controller.signal)
      .then(data => { if (!controller.signal.aborted) setWards(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, provinceCode, reload]);

  const filteredProvinces = provinces.filter(province => normalizeLocationText(province.name).includes(normalizeLocationText(provinceQuery)));
  const filteredWards = wards.filter(ward => normalizeLocationText(ward.name).includes(normalizeLocationText(wardQuery)));
  const canApply = !wardName || (!loading && !error && wards.some(ward => ward.name === wardName));

  return <div className={styles.root}>
    {name ? <input type="hidden" name={name} value={value} /> : null}
    <Popover.Root open={open} onOpenChange={changeOpen} modal>
      <Popover.Trigger asChild><button type="button" className={styles.trigger} id={id} aria-label={value ? `Địa điểm: ${value}` : "Địa điểm làm việc"} aria-invalid={invalid} aria-describedby={describedBy} title={value || "Chọn tỉnh/thành phố, xã/phường"}><MapPin size={20} aria-hidden="true" /><span>{value || "Địa điểm"}</span><ChevronDown size={16} aria-hidden="true" /></button></Popover.Trigger>
      <Popover.Portal><Popover.Content className={styles.popover} side="bottom" align="end" sideOffset={12} collisionPadding={12} aria-label="Chọn địa điểm làm việc" onOpenAutoFocus={event => { event.preventDefault(); provinceInput.current?.focus(); }}>
        <div className={styles.heading}><div><h2>Địa điểm làm việc</h2><p>Chọn tỉnh/thành phố, sau đó chọn xã/phường nếu cần.</p></div><Popover.Close className={styles.close} aria-label="Đóng chọn địa điểm"><X size={19} /></Popover.Close></div>
        <div className={styles.columns}>
          <fieldset className={styles.column}><legend>Tỉnh / thành phố</legend><div className={styles.search}><Search size={16} aria-hidden="true" /><input ref={provinceInput} aria-label="Tìm tỉnh/thành phố" placeholder="Tìm tỉnh/thành phố" value={provinceQuery} onChange={event => setProvinceQuery(event.target.value)} /></div><div className={styles.options}>
            {!provinceQuery ? <label className={styles.option}><input type="radio" name={`${groupId}-province`} checked={!provinceCode} onChange={() => { setProvinceCode(""); setWardName(""); setWardQuery(""); }} /><span>Toàn quốc</span>{!provinceCode ? <Check size={16} aria-hidden="true" /> : null}</label> : null}
            {filteredProvinces.map(province => <label key={province.code} className={styles.option}><input type="radio" name={`${groupId}-province`} checked={provinceCode === province.code} onChange={() => { setProvinceCode(province.code); setWardName(""); setWardQuery(""); }} /><span>{province.shortName}</span>{provinceCode === province.code ? <Check size={16} aria-hidden="true" /> : null}</label>)}
            {!filteredProvinces.length ? <p className={styles.message}>Không tìm thấy tỉnh/thành phố.</p> : null}
          </div></fieldset>
          <fieldset className={styles.column}><legend>Xã / phường</legend><div className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="Tìm xã/phường" placeholder="Tìm xã/phường" value={wardQuery} disabled={!provinceCode || loading || error} onChange={event => setWardQuery(event.target.value)} /></div><div className={styles.options}>
            {!provinceCode ? <p className={styles.message}><MapPin size={24} aria-hidden="true" />Chọn tỉnh/thành phố để xem danh sách xã/phường.</p> : loading ? <p className={styles.message} role="status"><LoaderCircle size={20} aria-hidden="true" />Đang tải xã/phường…</p> : error ? <div className={styles.message} role="alert">Chưa tải được danh sách xã/phường.<button className="btn" type="button" onClick={() => setReload(current => current + 1)}>Thử lại</button></div> : <>
              {!wardQuery ? <label className={styles.option}><input type="radio" name={`${groupId}-ward`} checked={!wardName} onChange={() => setWardName("")} /><span>Tất cả xã/phường</span>{!wardName ? <Check size={16} aria-hidden="true" /> : null}</label> : null}
              {filteredWards.map(ward => <label key={ward.code} className={styles.option}><input type="radio" name={`${groupId}-ward`} checked={wardName === ward.name} onChange={() => setWardName(ward.name)} /><span>{ward.name}</span>{wardName === ward.name ? <Check size={16} aria-hidden="true" /> : null}</label>)}
              {!filteredWards.length ? <p className={styles.message}>Không tìm thấy xã/phường.</p> : null}
            </>}
          </div></fieldset>
        </div>
        <div className={styles.footer}><button className={styles.reset} type="button" onClick={() => { setProvinceCode(""); setWardName(""); setProvinceQuery(""); setWardQuery(""); }}>Bỏ chọn</button><button className="btn btn-primary" type="button" disabled={!canApply} onClick={() => { onChange(locationSearchValue(selectedProvince, wardName)); setOpen(false); }}>Áp dụng địa điểm</button></div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </div>;
}
