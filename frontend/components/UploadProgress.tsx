import { uploadStepLabels, type UploadStep } from "../lib/signedFileUpload";

/** Stage feedback, not an estimated network percentage. */
export function UploadProgress({ step }: { step: UploadStep | null }) {
  if (!step) return null;
  return <div className="upload-progress" role="status">
    <span>{uploadStepLabels[step]}</span>
    <progress aria-label={uploadStepLabels[step]} />
  </div>;
}
