import React, { useEffect, useMemo, useRef } from "react";

export interface HeatStripProps {
  width: number; // px
  height?: number; // px
  /** 0..1 scores per scene (same order as list). */
  scores: number[];
  /** Called with scene index on click. */
  onSelect?: (index: number) => void;
}

/**
 * Canvas-based horizontal heat strip. Each scene maps to a vertical bar whose height=100%, color intensity by score.
 * Width maps to manuscript progress; scores assumed 0..1.
 */
export default function HeatStrip({ width, height = 32, scores, onSelect }: HeatStripProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const barWidth = useMemo(() => {
    const count = Math.max(1, scores.length);
    return Math.max(1, Math.floor(width / count));
  }, [scores.length, width]);

  // Draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = Math.floor(width * dpr);
    c.height = Math.floor(height * dpr);
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
  const ctx = c.getContext && c.getContext("2d");
  if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const count = scores.length || 1;
    const w = Math.max(1, Math.floor(width / count));

    for (let i = 0; i < count; i++) {
      const s = Math.min(1, Math.max(0, scores[i] ?? 0));
      const x = i * w;
      const hue = 0; // red hue for intensity
      const sat = 85; // vivid
      const light = Math.round(100 - s * 65); // higher score -> darker red
      ctx.fillStyle = `hsl(${hue} ${sat}% ${light}%)`;
      ctx.fillRect(x, 0, w, height);
    }

    // Thin separators for clarity on dense strips
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 1; i < count; i++) {
      const x = i * w;
      ctx.fillRect(x, 0, 1, height);
    }
  }, [barWidth, dpr, height, scores, width]);

  // Click handling: map x to index
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelect) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const count = Math.max(1, scores.length);
    const w = Math.max(1, Math.floor(width / count));
    const idx = Math.min(count - 1, Math.max(0, Math.floor(x / w)));
    onSelect(idx);
  };

  return (
    <canvas
      ref={canvasRef}
      width={Math.floor(width * dpr)}
      height={Math.floor(height * dpr)}
      style={{ width, height, display: "block", cursor: onSelect ? "pointer" : "default", borderRadius: 4 }}
      onClick={onClick}
      aria-label="Scene heat strip"
      role="img"
    />
  );
}
