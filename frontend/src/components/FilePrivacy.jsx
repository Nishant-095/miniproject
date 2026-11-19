import { ShieldCheck } from "lucide-react";

export default function FilePrivacy() {
  return (
    <p className="file-privacy-note" role="note">
      <ShieldCheck size={17} /> Files stay on your device. Processing works here, online or offline; no file is uploaded.
    </p>
  );
}
