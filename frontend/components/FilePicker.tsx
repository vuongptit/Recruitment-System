"use client";

import { forwardRef, useId, useImperativeHandle, useRef, type InputHTMLAttributes } from "react";

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { fileName?: string };

/** Own the visible copy instead of relying on the browser's English file-input labels. */
export const FilePicker = forwardRef<HTMLInputElement, FilePickerProps>(function FilePicker({ fileName, id, disabled, className, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!);
  return <div className={`file-picker input ${className ?? ""}`}>
    <button className="btn" type="button" disabled={disabled} aria-label="Chọn tệp" aria-controls={inputId} aria-describedby={`${inputId}-name`} onClick={() => input.current?.click()}>Chọn tệp</button>
    <span id={`${inputId}-name`} className="file-picker-name">{fileName || "Chưa chọn tệp"}</span>
    <input {...props} id={inputId} ref={input} hidden aria-hidden="true" tabIndex={-1} type="file" disabled={disabled} />
  </div>;
});
