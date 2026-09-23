import Image from "next/image";
export default function Loading() { return <div className="page-loading" role="status" aria-label="Loading QaziPro"><Image src="/brand/qazipro-mark-clean.png" width={720} height={413} sizes="146px" alt="" loading="eager" style={{ height: "auto" }}/><span>Preparing your page…</span></div>; }
