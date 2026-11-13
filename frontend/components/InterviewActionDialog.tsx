"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./InterviewWorkspace.module.css";

export function InterviewActionDialog({ title, pending, onClose, children }: { title: string; pending: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return <dialog ref={dialog} className={styles.modal} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <div style={{ padding: "24px 26px 0" }}><h2 id={titleId} style={{ margin: 0, fontSize: 21 }}>{title}</h2></div>{children}
  </dialog>;
}
