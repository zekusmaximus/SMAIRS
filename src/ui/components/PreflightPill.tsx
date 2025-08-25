import React from "react";

export type PillStatus = "pass" | "fail" | "pending";

export function PreflightPill({ status, label }: { status: PillStatus; label: string }) {
  const cls = status === "pass" ? "pill pass" : status === "fail" ? "pill fail" : "pill pending";
  const symbol = status === "pass" ? "✓" : status === "fail" ? "✗" : "–";
  return (
    <span className={cls} aria-label={`${label}: ${status}`} title={label}>
      <span className="pill-symbol" aria-hidden>{symbol}</span>
      <span className="pill-label">{label}</span>
    </span>
  );
}

export default PreflightPill;
